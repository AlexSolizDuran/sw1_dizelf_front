"use client";

import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { io, type Socket } from "socket.io-client";
import { clearSceneHistory, useScene } from "@pascal-app/core";
import type { AnyNode, AnyNodeId } from "@pascal-app/core";
import { useProjectStore } from "@/stores/use-project-store";
import { instalarUndoYjs, type UndoYjs } from "@/lib/editor/undo-yjs";
import {
  aplicarCambiosDocumento,
  aplicarDelta,
  CLAVES,
  deltaVacio,
  diffEscena,
  fusionarDocumento,
  materializar,
  reemplazarTodo,
  ORIGEN_LOCAL,
  ORIGEN_REMOTO,
  ORIGEN_SISTEMA,
  type DeltaNodos,
  type EstadoEscena,
} from "@/lib/editor/y-bridge";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/** Estados que puede mostrar el navbar. */
export type EstadoSync = "conectando" | "listo" | "reconectando" | "error";

export interface ResultadoSync {
  estado: EstadoSync;
  /** Motivo del último error, si lo hubo. */
  mensaje: string | null;
  /**
   * `true` cuando reconectar no sirve (sesión, acceso o expulsión). La UI puede
   * bloquear el editor y pedir que se vuelva a abrir el proyecto.
   */
  fatal: boolean;
}

/**
 * Códigos de `sync:error` que el servidor cierra la conexión después de mandar.
 * Reintentar solo repetiría el rechazo.
 */
const CODIGOS_FATALES = new Set([
  "PROYECTO_FALTANTE",
  "SIN_SESION",
  "SIN_ACCESO",
  "EXPULSADO",
]);

/**
 * Cambios remotos acumulados entre `Y.applyUpdate` y su volcado al store.
 *
 * Se guardan como mapas por id para que varias transacciones del mismo update
 * (o dos updates seguidos) no dupliquen altas ni updates del mismo nodo.
 */
interface RemotoPendiente {
  crear: Map<string, { node: AnyNode; parentId?: AnyNodeId }>;
  actualizar: Map<string, Record<string, unknown>>;
  borrar: Set<string>;
  raices: boolean;
  colecciones: boolean;
  materiales: boolean;
  plugins: boolean;
}

function remotoVacio(): RemotoPendiente {
  return {
    crear: new Map(),
    actualizar: new Map(),
    borrar: new Set(),
    raices: false,
    colecciones: false,
    materiales: false,
    plugins: false,
  };
}

/**
 * Sincronización del plano entre varios participantes, con Yjs.
 *
 * EL CICLO
 * --------
 *   store local  ──diff──►  Y.Doc  ──update binario──►  gateway  ──►  otros
 *        ▲                  │
 *        └── applyNodeChanges ◄── update ◄── gateway ◄────┘
 *
 * `useScene.subscribe` avisa de cualquier cambio del store. De ahí sale un delta
 * por diff contra el estado anterior y se escribe en el doc. El doc emite
 * `update`, y ese update viaja por el socket. Cuando llega uno remoto se aplica
 * con `applyNodeChanges`, que es la operación del store que corresponde a un
 * delta.
 *
 * EL ECO
 * -------
 * Aplicar un cambio remoto también dispara `subscribe`, así que sin una
 * bandera el update volvería al doc y rebotaría. `aplicandoRemoto` corta esa
 * vuelta: mientras está activo, los cambios del store son del doc, no al doc.
 *
 * LA RECEPCIÓN
 * ------------
 * Un update remoto NO se materializa entero: `afterTransaction` dice qué mapas
 * cambiaron y `manejarRemoto` arma el delta solo con esos nodos. En un arrastre
 * llegan decenas de updates por segundo, así que reconstruir y comparar toda la
 * escena en cada uno era el costo dominante del receptor.
 *
 * EL UNDO
 * -------
 * El historial vive en `Y.UndoManager` (ver `undo-yjs.ts`), no en zundo. Solo
 * registra transacciones con `ORIGEN_LOCAL`, así que los cambios remotos no lo
 * borran ni entran a la pila. Ya no se llama `clearSceneHistory` en cada
 * `sync:update`: esa era justamente la forma de tapar el problema.
 *
 * RECONEXIÓN VS RESTAURACIÓN
 * --------------------------
 * `sync:inicial` trae un segundo argumento:
 *
 * - `reemplazar: false` (reconexión): el estado del servidor se FUSIONA con el
 *   doc local y se reenvían las ediciones hechas sin conexión.
 * - `reemplazar: true` (restaurar versión): el doc local se descarta y se
 *   reemplaza por la escena restaurada.
 *
 * UN LECTOR NO ESCRIBE, PERO SÍ RECIBE
 * -------------------------------------
 * El hook conecta para todos los miembros. Un LECTOR aplica `sync:inicial` y
 * `sync:update` —así ve el plano en vivo— pero no escribe en el doc, no emite
 * updates y no instala historial. Como el store corta `applyNodeChanges` con
 * `readOnly`, el volcado remoto levanta el candado y lo restaura en el mismo
 * tick (ver `volcarRemoto`).
 */
export function useSincronizacion(
  proyectoId: string | null,
  puedeEditar: boolean
): ResultadoSync {
  const [estado, setEstado] = useState<EstadoSync>("conectando");
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [fatal, setFatal] = useState(false);

  const docRef = useRef<Y.Doc | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const anteriorRef = useRef<EstadoEscena | null>(null);
  const aplicandoRemoto = useRef(false);
  /** `true` hasta que el servidor manda el estado inicial. */
  const inicializado = useRef(false);

  useEffect(() => {
    if (!proyectoId) return;

    setEstado("conectando");
    setMensaje(null);
    setFatal(false);

    let doc = new Y.Doc();
    docRef.current = doc;
    inicializado.current = false;
    anteriorRef.current = null;

    // El historial se instala por doc: al reemplazar el documento (restaurar
    // versión) hay que crear otro manager, porque el anterior apunta a
    // estructuras ya destruidas.
    let undo: UndoYjs | null = null;
    /** Delta remoto pendiente de volcar al store (ver `manejarRemoto`). */
    let remotoPendiente: RemotoPendiente | null = null;
    /**
     * `true` mientras corre `sync:inicial`. En ese momento el store se
     * reemplaza con `setScene`, así que procesar el delta remoto intermedio
     * sería trabajo tirado.
     */
    let aplicandoInicial = false;

    /** Referencias actuales del store, tal como las ve el editor. */
    const escenaDelStore = (): EstadoEscena => {
      const escena = useScene.getState();
      return {
        nodes: escena.nodes,
        rootNodeIds: escena.rootNodeIds,
        collections: escena.collections as Record<string, unknown>,
        materials: escena.materials as Record<string, unknown>,
        installedPlugins: escena.installedPlugins,
      };
    };

    /**
     * Vuelca el doc al store. Lo usa el historial después de deshacer/rehacer:
     * Yjs ya aplicó la transacción inversa y el store es una proyección del
     * doc. El flag evita que ese volcado vuelva al doc como si fuera local.
     */
    const volcarDocAlStore = (): void => {
      aplicandoRemoto.current = true;
      try {
        const estadoDoc = materializar(doc);
        useScene.getState().setScene(estadoDoc.nodes, estadoDoc.rootNodeIds, {
          collections: estadoDoc.collections as never,
          materials: estadoDoc.materials as never,
          installedPlugins: estadoDoc.installedPlugins,
        });
        // `setScene` normaliza y puede agregar/quitar campos; el estado
        // posterior del store es la referencia contra la que debe comparar el
        // próximo diff local.
        anteriorRef.current = escenaDelStore();
      } finally {
        aplicandoRemoto.current = false;
      }
    };

    const instalarHistorial = (): void => {
      undo?.destruir();
      undo = puedeEditar ? instalarUndoYjs(doc, volcarDocAlStore) : null;
    };

    instalarHistorial();

    const socket = io(`${API_BASE_URL}/sync`, {
      query: { proyectoId },
      withCredentials: true,
      transports: ["websocket", "polling"],
      // El canal de sync manda updates binarios; el polling solo se usa para el
      // handshake inicial si el WebSocket no levanta.
    });
    socketRef.current = socket;

    // ── Local → doc ──────────────────────────────────────────────────────────
    // Se factoriza porque `sync:inicial` puede reemplazar el doc entero y hay
    // que enganchar el reenvío en el doc nuevo.
    const reenviar = (update: Uint8Array, origen: unknown): void => {
      // Lo que dispara el handler de abajo lleva `ORIGEN_REMOTO` y no se
      // reenvía: es el corte del eco. Un LECTOR nunca emite.
      if (origen === ORIGEN_REMOTO || !puedeEditar) return;
      // Sin conexión los updates quedarían bufferizados y llegarían antes del
      // `sync:listo` (el gateway los descarta). El merge de la reconexión es
      // quien reenvía lo acumulado.
      if (!socket.connected) return;
      socket.emit("sync:update", update);
    };
    /**
     * Traduce una transacción remota a un delta de nodos.
     *
     * Se lee lo que Yjs ya sabe que cambió en vez de `materializar` la escena
     * entera: durante un arrastre llegan decenas de updates por segundo y
     * reconstruir todos los nodos en cada uno era el costo dominante. Acá solo
     * se tocan los nodos afectados (O(campos del nodo)).
     *
     * `changedParentTypes` repite el mismo evento bajo el tipo cambiado y bajo
     * sus padres, así que se deduplica por identidad. El `path` no sirve para
     * distinguir el mapa raíz del mapa de un nodo (ambos son `[]`): se compara
     * `target`.
     */
    const manejarRemoto = (trx: Y.Transaction): void => {
      if (trx.origin !== ORIGEN_REMOTO) return;
      // En `sync:inicial` el store se reemplaza con `setScene` después del
      // apply; procesar el delta intermedio sería trabajo tirado.
      if (aplicandoInicial) return;

      const eventos = new Set<Y.YEvent<Y.AbstractType<unknown>>>();
      for (const lista of trx.changedParentTypes.values()) {
        for (const evento of lista) eventos.add(evento);
      }
      if (eventos.size === 0) return;

      const nodos = doc.getMap<Y.Map<unknown>>(CLAVES.nodes);
      const raices = doc.getArray<AnyNodeId>(CLAVES.roots);
      const colecciones = doc.getMap<unknown>(CLAVES.collections);
      const materiales = doc.getMap<unknown>(CLAVES.materials);
      const plugins = doc.getArray<string>(CLAVES.plugins);

      const pendiente = (remotoPendiente ??= remotoVacio());

      for (const evento of eventos) {
        const objetivo = evento.target;

        // Mapa raíz: alta o baja de un nodo completo (el valor es su `Y.Map`).
        if (objetivo === nodos) {
          for (const [id, cambio] of evento.changes.keys) {
            if (cambio.action === "delete") {
              pendiente.crear.delete(id);
              pendiente.actualizar.delete(id);
              pendiente.borrar.add(id);
              continue;
            }

            const mapa = nodos.get(id);
            if (!(mapa instanceof Y.Map)) continue;
            const nodo = mapa.toJSON() as AnyNode;
            pendiente.borrar.delete(id);

            if (anteriorRef.current?.nodes[id as AnyNodeId]) {
              // Reemplazo del mapa entero: viaja el nodo completo.
              pendiente.crear.delete(id);
              pendiente.actualizar.set(
                id,
                nodo as unknown as Record<string, unknown>
              );
            } else {
              pendiente.actualizar.delete(id);
              pendiente.crear.set(id, {
                node: nodo,
                parentId: mapa.get("parentId") as AnyNodeId | undefined,
              });
            }
          }
          continue;
        }

        // Estructuras que no son nodos: solo se marca que hay que releerlas.
        if (objetivo === raices) {
          pendiente.raices = true;
          continue;
        }
        if (objetivo === colecciones) {
          pendiente.colecciones = true;
          continue;
        }
        if (objetivo === materiales) {
          pendiente.materiales = true;
          continue;
        }
        if (objetivo === plugins) {
          pendiente.plugins = true;
          continue;
        }

        // `Y.Map` interno de un nodo: update campo por campo.
        if (!(objetivo instanceof Y.Map)) continue;
        const id = objetivo.get("id");
        if (typeof id !== "string") continue;
        if (pendiente.borrar.has(id) || pendiente.crear.has(id)) continue;
        if (!anteriorRef.current?.nodes[id as AnyNodeId]) continue;

        const datos: Record<string, unknown> = {
          ...(pendiente.actualizar.get(id) ?? {}),
        };
        for (const [clave, cambio] of evento.changes.keys) {
          // Una clave borrada viaja como `undefined`: el store la deja fuera
          // del nodo al parsear el update.
          datos[clave] =
            cambio.action === "delete" ? undefined : objetivo.get(clave);
        }
        pendiente.actualizar.set(id, datos);
      }
    };

    /**
     * Aplica al store lo acumulado y refresca la referencia del diff local.
     *
     * Se hace fuera del observer de Yjs: un error del store no debe romper la
     * transacción que Yjs está cerrando, y así hay un solo `applyNodeChanges`
     * por update.
     */
    const volcarRemoto = (): void => {
      const pendiente = remotoPendiente;
      remotoPendiente = null;
      if (!pendiente) return;

      const delta: DeltaNodos = {};
      if (pendiente.crear.size > 0) {
        delta.create = Array.from(pendiente.crear.values());
      }
      if (pendiente.actualizar.size > 0) {
        delta.update = Array.from(pendiente.actualizar, ([id, data]) => ({
          id: id as AnyNodeId,
          data: data as Partial<AnyNode>,
        }));
      }
      if (pendiente.borrar.size > 0) {
        delta.delete = Array.from(pendiente.borrar) as AnyNodeId[];
      }

      const escena = useScene.getState();
      const bloqueado = escena.readOnly;
      // Un LECTOR no puede editar, pero sí ver el plano en vivo.
      // `applyNodeChanges` corta con `readOnly`, así que se levanta el candado
      // solo para aplicar el cambio remoto y se restaura en el mismo tick.
      if (bloqueado) escena.setReadOnly(false);
      try {
        if (!deltaVacio(delta)) {
          useScene.getState().applyNodeChanges(delta as never);
        }

        // Raíces, colecciones, materiales y plugins no viajan en el delta de
        // nodos: se releen solo cuando su estructura cambió.
        if (
          pendiente.raices ||
          pendiente.colecciones ||
          pendiente.materiales ||
          pendiente.plugins
        ) {
          useScene.setState({
            ...(pendiente.raices
              ? { rootNodeIds: doc.getArray<AnyNodeId>(CLAVES.roots).toJSON() }
              : {}),
            ...(pendiente.colecciones
              ? {
                  collections: doc
                    .getMap(CLAVES.collections)
                    .toJSON() as never,
                }
              : {}),
            ...(pendiente.materiales
              ? { materials: doc.getMap(CLAVES.materials).toJSON() as never }
              : {}),
            ...(pendiente.plugins
              ? {
                  installedPlugins: doc
                    .getArray<string>(CLAVES.plugins)
                    .toJSON(),
                }
              : {}),
          });
        }

        // El store ya es la verdad: se capturan sus referencias para que el
        // próximo diff local no compare contra objetos normalizados distintos.
        anteriorRef.current = escenaDelStore();
      } finally {
        if (bloqueado) useScene.getState().setReadOnly(true);
      }
    };

    const enlazar = (objetivo: Y.Doc): void => {
      objetivo.on("update", reenviar);
      objetivo.on("afterTransaction", manejarRemoto);
    };
    enlazar(doc);

    /**
     * Origen que corresponde a la escritura actual. Con el historial pausado
     * (arrastres, borradores) el cambio se envía igual, pero no se registra
     * como paso de undo.
     */
    const origenDeEscritura = (): string =>
      undo?.estaPausado() ? ORIGEN_SISTEMA : ORIGEN_LOCAL;

    // Un LECTOR no escribe en el doc: se suscribe igual para nada, así que se
    // evita el trabajo.
    const desuscribir = puedeEditar
      ? useScene.subscribe((estadoStore) => {
          if (aplicandoRemoto.current) return;
          if (!inicializado.current) return;

          const siguiente: EstadoEscena = {
            nodes: estadoStore.nodes,
            rootNodeIds: estadoStore.rootNodeIds,
            collections: estadoStore.collections as Record<string, unknown>,
            materials: estadoStore.materials as Record<string, unknown>,
            installedPlugins: estadoStore.installedPlugins,
          };
          const anterior = anteriorRef.current;
          anteriorRef.current = siguiente;

          if (!anterior) {
            // Primera vez: entra todo el estado de golpe.
            reemplazarTodo(doc, siguiente);
            return;
          }

          const delta = diffEscena(anterior, siguiente);
          const origen = origenDeEscritura();
          if (!deltaVacio(delta)) {
            aplicarDelta(doc, delta, undefined, origen);
          }

          // Raíces, colecciones, materiales y plugins no entran en `diffEscena`.
          // Se escriben aparte para que el gateway también los reciba.
          aplicarCambiosDocumento(doc, anterior, siguiente, origen);
        })
      : () => {};

    // ── Remoto → store ───────────────────────────────────────────────────────
    socket.on(
      "sync:inicial",
      (
        binario: ArrayBuffer | Uint8Array,
        opciones?: { reemplazar?: boolean }
      ) => {
        const bytes =
          binario instanceof Uint8Array ? binario : new Uint8Array(binario);
        // Ante un backend viejo no hay segundo argumento: reemplazar es el
        // comportamiento seguro (el actual).
        const reemplazar = opciones?.reemplazar ?? true;

        aplicandoInicial = true;
        aplicandoRemoto.current = true;
        try {
          let cambiosLocales: Uint8Array | null = null;

          if (reemplazar) {
            // `sync:inicial` con reemplazo es el estado COMPLETO, no un delta:
            // aplicarlo con `applyUpdate` sobre un doc que ya traía contenido
            // FUSIONA (CRDT), no reemplaza, y las raíces viejas sobreviven.
            doc.off("update", reenviar);
            doc.off("afterTransaction", manejarRemoto);
            doc.destroy();
            doc = new Y.Doc();
            docRef.current = doc;
            remotoPendiente = null;
            enlazar(doc);
            Y.applyUpdate(doc, bytes, ORIGEN_REMOTO);

            // El historial anterior describía un documento que ya no existe.
            instalarHistorial();
            // También resetea la profundidad de pausa del paquete, que puede
            // haber quedado desfasada si se restauró en medio de una
            // herramienta.
            clearSceneHistory();
          } else {
            // Reconexión: se conserva lo editado sin conexión y el historial
            // local. `fusionarDocumento` devuelve lo que el servidor no tiene.
            cambiosLocales = fusionarDocumento(doc, bytes);
          }

          const estadoDoc = materializar(doc);
          useScene.getState().setScene(
            estadoDoc.nodes,
            estadoDoc.rootNodeIds,
            {
              collections: estadoDoc.collections as never,
              materials: estadoDoc.materials as never,
              installedPlugins: estadoDoc.installedPlugins,
            }
          );

          // `setScene` normaliza la escena; el store posterior es la base del
          // próximo diff.
          anteriorRef.current = escenaDelStore();
          inicializado.current = true;

          // Confirma la generación aplicada: hasta que el gateway recibe esto,
          // descarta nuestros updates. Va ANTES de reenviar lo local, porque el
          // gateway los descartaría con el epoch viejo.
          socket.emit("sync:listo");

          if (cambiosLocales && cambiosLocales.length > 2) {
            socket.emit("sync:update", cambiosLocales);
          }

          setEstado("listo");
          setMensaje(null);
          setFatal(false);
        } finally {
          aplicandoInicial = false;
          aplicandoRemoto.current = false;
        }
      }
    );

    socket.on("sync:update", (binario: ArrayBuffer | Uint8Array) => {
      if (!inicializado.current) return;
      const bytes =
        binario instanceof Uint8Array ? binario : new Uint8Array(binario);

      aplicandoRemoto.current = true;
      try {
        // `ORIGEN_REMOTO`: no se reenvía y no entra al historial local.
        // `manejarRemoto` acumula el delta desde los eventos de Yjs y
        // `volcarRemoto` lo aplica al store fuera del observer.
        Y.applyUpdate(doc, bytes, ORIGEN_REMOTO);
        volcarRemoto();
        // A propósito NO se limpia el historial: con Y.UndoManager los cambios
        // remotos no entran a la pila local ni la invalidan.
      } finally {
        aplicandoRemoto.current = false;
        // Si `applyUpdate` falló a mitad de camino, no se aplica un delta
        // parcial en el próximo update.
        remotoPendiente = null;
      }
    });

    // ── Permisos ─────────────────────────────────────────────────────────────
    socket.on(
      "sync:permiso",
      (payload: { rol?: string; puedeEditar?: boolean }) => {
        if (
          typeof payload?.rol !== "string" ||
          typeof payload?.puedeEditar !== "boolean"
        ) {
          return;
        }
        // El store cambia `puedeEditar`, el efecto se reengancha con el permiso
        // nuevo y `EditorShell` recalcula `soloLectura`.
        useProjectStore
          .getState()
          .actualizarPermiso(payload.rol, payload.puedeEditar);
      }
    );

    // ── Estado de la conexión ────────────────────────────────────────────────
    let conexionPrevia = false;
    let cerradoPorError = false;

    /** Error definitivo: se apaga el socket para que no reintente. */
    const cerrarPorError = (texto: string): void => {
      cerradoPorError = true;
      setMensaje(texto);
      setFatal(true);
      setEstado("error");
      socket.disconnect();
    };

    socket.on("connect", () => {
      if (cerradoPorError) return;
      setEstado(conexionPrevia ? "reconectando" : "conectando");
      setMensaje(null);
      conexionPrevia = true;
    });

    socket.on("disconnect", (motivo: string) => {
      if (cerradoPorError) return;

      if (motivo === "io server disconnect") {
        // El servidor no reconecta por su cuenta: o expulsó o rechazó la
        // sesión. El `sync:error` ya trajo el motivo; si no llegó, se muestra
        // uno genérico.
        setEstado("error");
        setFatal(true);
        setMensaje((previo) => previo ?? "El servidor cerró la conexión.");
        return;
      }

      // Caída de transporte: socket.io reintenta solo. `inicializado` sigue en
      // true a propósito, para que las ediciones hechas sin conexión se
      // acumulen en el doc y el merge las recupere.
      setEstado("reconectando");
    });

    socket.on("connect_error", (error: Error) => {
      if (cerradoPorError) return;
      setEstado("error");
      setMensaje(
        error?.message
          ? `Sin conexión con el servidor (${error.message}).`
          : "Sin conexión con el servidor."
      );
    });

    socket.on(
      "sync:error",
      (payload: { codigo?: string; mensaje?: string }) => {
        const texto = payload?.mensaje ?? "Error de sincronización.";

        if (payload?.codigo && CODIGOS_FATALES.has(payload.codigo)) {
          cerrarPorError(texto);
          return;
        }

        // `SIN_PERMISO` no cierra la conexión: el usuario sigue viendo el
        // plano como lector. El aviso de permiso llega por `sync:permiso`.
        setMensaje(texto);
      }
    );

    return () => {
      desuscribir();
      // Se quitan los listeners antes de desconectar: el `disconnect` no debe
      // tocar estado de un componente que se está desmontando.
      socket.removeAllListeners();
      socket.disconnect();
      undo?.destruir();
      undo = null;
      doc.destroy();
      docRef.current = null;
      socketRef.current = null;
      anteriorRef.current = null;
      inicializado.current = false;
    };
  }, [proyectoId, puedeEditar]);

  return { estado, mensaje, fatal };
}

/** Exportado para que el shell pueda sembrar el doc antes de conectar. */
export { materializar as materializarDoc };
