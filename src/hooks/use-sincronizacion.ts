"use client";

import { useEffect, useRef } from "react";
import * as Y from "yjs";
import { io, type Socket } from "socket.io-client";
import {
  clearSceneHistory,
  useScene,
  type AnyNode,
  type AnyNodeId,
} from "@pascal-app/core";
import {
  aplicarDelta,
  deltaVacio,
  diffEscena,
  materializar,
  reemplazarTodo,
  type EstadoEscena,
} from "@/lib/editor/y-bridge";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

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
 * EL UNDO
 * -------
 * `clearSceneHistory` después de aplicar un remoto. El historial del store es
 * local por diseño (zundo), y sin limpiarlo un Ctrl-Z intentaría deshacer algo
 * que ya fue deshecho por otro, dejando la escena en un estado que nadie quiere.
 *
 * UN LECTOR NO ESCRIBE
 * --------------------
 * El hook no conecta si no puede editar: entra por presencia y alcanza con ver.
 */
export function useSincronizacion(
  proyectoId: string | null,
  puedeEditar: boolean
): void {
  const docRef = useRef<Y.Doc | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const anteriorRef = useRef<EstadoEscena | null>(null);
  const aplicandoRemoto = useRef(false);
  /** `true` hasta que el servidor manda el estado inicial. */
  const inicializado = useRef(false);

  useEffect(() => {
    if (!proyectoId || !puedeEditar) return;

    const doc = new Y.Doc();
    docRef.current = doc;
    inicializado.current = false;

    const socket = io(`${API_BASE_URL}/sync`, {
      query: { proyectoId },
      withCredentials: true,
      transports: ["websocket", "polling"],
      // El canal de sync manda updates binarios; el polling solo se usa para el
      // handshake inicial si el WebSocket no levanta.
    });
    socketRef.current = socket;

    // ── Local → doc ──────────────────────────────────────────────────────────
    doc.on("update", (update: Uint8Array, origen: unknown) => {
      // Lo que dispara el handler de abajo lleva `origen = 'remoto'` y no se
      // reenvía: es el corte del eco.
      if (origen === "remoto") return;
      socket.emit("sync:update", update);
    });

    const desuscribir = useScene.subscribe((estado, previo) => {
      if (aplicandoRemoto.current) return;
      if (!inicializado.current) return;

      const siguiente: EstadoEscena = {
        nodes: estado.nodes,
        rootNodeIds: estado.rootNodeIds,
        collections: estado.collections as Record<string, unknown>,
        materials: estado.materials as Record<string, unknown>,
        installedPlugins: estado.installedPlugins,
      };
      const anterior = anteriorRef.current;
      anteriorRef.current = siguiente;

      if (!anterior) {
        // Primera vez: entra todo el estado de golpe.
        reemplazarTodo(doc, siguiente);
        return;
      }

      const delta = diffEscena(anterior, siguiente);
      if (deltaVacio(delta)) return;
      aplicarDelta(doc, delta);

      // Las raíces cambian por operaciones que no tocan el mapa de nodos.
      if (
        JSON.stringify(anterior.rootNodeIds) !==
        JSON.stringify(siguiente.rootNodeIds)
      ) {
        const raices = doc.getArray<AnyNodeId>("scene:roots");
        doc.transact(() => {
          raices.delete(0, raices.length);
          raices.push(siguiente.rootNodeIds);
        });
      }
    });

    // ── Remoto → store ───────────────────────────────────────────────────────
    socket.on("sync:inicial", (binario: ArrayBuffer | Uint8Array) => {
      const bytes =
        binario instanceof Uint8Array ? binario : new Uint8Array(binario);

      aplicandoRemoto.current = true;
      try {
        Y.applyUpdate(doc, bytes, "remoto");

        const estado = materializar(doc);
        useScene.getState().setScene(
          estado.nodes,
          estado.rootNodeIds,
          {
            collections: estado.collections as never,
            materials: estado.materials as never,
            installedPlugins: estado.installedPlugins,
          }
        );
        // El historial local quedó describiendo un documento que ya no existe.
        clearSceneHistory();

        anteriorRef.current = estado;
        inicializado.current = true;
      } finally {
        aplicandoRemoto.current = false;
      }
    });

    socket.on("sync:update", (binario: ArrayBuffer | Uint8Array) => {
      if (!inicializado.current) return;
      const bytes =
        binario instanceof Uint8Array ? binario : new Uint8Array(binario);

      aplicandoRemoto.current = true;
      try {
        Y.applyUpdate(doc, bytes, "remoto");

        const estado = materializar(doc);
        const delta = diffEscena(anteriorRef.current ?? estado, estado);
        anteriorRef.current = estado;

        if (deltaVacio(delta)) return;
        useScene.getState().applyNodeChanges(delta as never);
        clearSceneHistory();
      } finally {
        aplicandoRemoto.current = false;
      }
    });

    socket.on("sync:error", (payload: { mensaje?: string }) => {
      // eslint-disable-next-line no-console
      console.warn("[sync]", payload?.mensaje);
    });

    return () => {
      desuscribir();
      socket.removeAllListeners();
      socket.disconnect();
      doc.destroy();
      docRef.current = null;
      socketRef.current = null;
      anteriorRef.current = null;
      inicializado.current = false;
    };
  }, [proyectoId, puedeEditar]);
}

/** Exportado para que el shell pueda sembrar el doc antes de conectar. */
export { materializar as materializarDoc };