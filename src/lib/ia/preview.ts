"use client";

import {
  type AnyNode,
  type AnyNodeId,
  pauseSceneHistory,
  resumeSceneHistory,
  useScene,
} from "@pascal-app/core";

/**
 * Borrador transaccional de la escena.
 *
 * PROBLEMA
 * --------
 * Cuando el modelo proponía cambios, la escena real no se tocaba: no podía leer
 * lo que acababa de crear, `validate_scene` validaba la escena limpia y los
 * errores aparecían recién al aprobar, en bloque. Un turno escribía a ciegas.
 *
 * SOLUCIÓN
 * --------
 * Abrir un preview antes de la primera escritura del turno: las tools escriben
 * de verdad sobre el store (una sola ruta de código, la misma que usa la
 * aprobación), el modelo puede leer y corregir, y al cerrar el turno se
 * restauran las referencias guardadas.
 *
 * POR QUÉ RESTAURAR REFERENCIAS ALCANZA
 * -------------------------------------
 * Las acciones del store actualizan de forma inmutable (`{ ...state.nodes }`),
 * así que basta con volver a apuntar `nodes`/`rootNodeIds`/etc. a los objetos
 * de antes. Las únicas mutaciones in-place de las tools (`duplicate`) son sobre
 * clones creados por `cloneNodesInto`.
 *
 * `dirtyNodes`, en cambio, es un `Set` que algunas partes del editor mutan con
 * `.add()`, así que se guarda una copia.
 *
 * HISTORIAL
 * ---------
 * `pauseSceneHistory` evita que el preview deje pasos en el undo. Con Yjs el
 * historial es un `UndoManager` con orígenes: además de pausar, la
 * sincronización corta el envío al doc mientras el preview está abierto
 * (ver `use-sincronizacion`), para no publicar geometría que se va a descartar.
 */

interface EscenaGuardada {
  nodes: Record<AnyNodeId, AnyNode>;
  rootNodeIds: AnyNodeId[];
  collections: ReturnType<typeof useScene.getState>["collections"];
  materials: ReturnType<typeof useScene.getState>["materials"];
  installedPlugins: string[];
  dirtyNodes: Set<AnyNodeId>;
}

let guardada: EscenaGuardada | null = null;
const oyentesDeCierre = new Set<() => void>();

/** `true` mientras hay un preview abierto (las escrituras son descartables). */
export function previewActivo(): boolean {
  return guardada !== null;
}

/** Abre el borrador. Idempotente: un preview por turno. */
export function abrirPreview(): void {
  if (guardada) return;
  const estado = useScene.getState();
  guardada = {
    nodes: estado.nodes,
    rootNodeIds: estado.rootNodeIds,
    collections: estado.collections,
    materials: estado.materials,
    installedPlugins: estado.installedPlugins,
    dirtyNodes: new Set(estado.dirtyNodes),
  };
  pauseSceneHistory(useScene);
}

/**
 * Descarta el preview y devuelve la escena al estado de apertura.
 *
 * Idempotente: si ya estaba cerrado no hace nada, así el `finally` del loop
 * puede llamarlo sin cuidado.
 */
export function cerrarPreview(): void {
  const escena = guardada;
  if (!escena) return;

  // Se restaura mientras `guardada` sigue seteada: la sincronización ignora el
  // cambio en vez de mandarlo al doc como edición local.
  try {
    useScene.setState({
      nodes: escena.nodes,
      rootNodeIds: escena.rootNodeIds,
      collections: escena.collections,
      materials: escena.materials,
      installedPlugins: escena.installedPlugins,
      dirtyNodes: escena.dirtyNodes,
    });
  } finally {
    guardada = null;
    resumeSceneHistory(useScene);
    for (const oyente of oyentesDeCierre) {
      try {
        oyente();
      } catch {
        // un oyente roto no debe impedir cerrar el preview
      }
    }
  }
}

/**
 * Registra un callback para cuando el preview se cierra.
 * Lo usa la sincronización para soltar los updates remotos que llegaron
 * mientras el borrador estaba abierto.
 */
export function alCerrarPreview(oyente: () => void): () => void {
  oyentesDeCierre.add(oyente);
  return () => {
    oyentesDeCierre.delete(oyente);
  };
}
