"use client";

import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useEditor } from "@pascal-app/editor";
import { useViewer } from "@pascal-app/viewer";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Qué está mirando cada persona en el plano ahora mismo.
 *
 * No es el documento: el plano se sincroniza aparte. Esto solo dice quién está
 * conectado y en qué está trabajando, y es lo que hace que una sesión se sienta
 * compartida antes de que haya ninguna ediciónVisible.
 */
export interface Presente {
  usuarioId: number;
  nombre: string;
  rol: string;
  puedeEditar: boolean;
  nodoSeleccionado: string | null;
  nivelId: string | null;
  edificioId: string | null;
  modo: string | null;
  vista: string | null;
  actualizadoEn: string;
}

export interface EstadoPresencia {
  conectados: Presente[];
  /** `true` mientras el socket intenta reconectar. */
  reconectando: boolean;
  error: string | null;
}

/**
 * Conecta con el canal de presencia del proyecto.
 *
 * El socket se abre con `withCredentials`: la cookie httpOnly de sesión tiene
 * que viajar en el handshake, que es exactamente donde el gateway la lee. Un
 * LECTOR entra por el mismo canal y recibe la misma lista —lo que cambia es que
 * el backend ignora lo que reporte—, así que alcanza con un solo código.
 *
 * Lo que se reporta sale de stores que el editor ya tenía suscritos
 * (`useViewer` y `useEditor`), así que no hay que leerlos extra: se reenvía con
 * un throttle para no saturar el socket con cada mousemove.
 */
export function usePresencia(proyectoId: string | null): EstadoPresencia {
  const [conectados, setConectados] = useState<Presente[]>([]);
  const [reconectando, setReconectando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);

  // Se leen dentro del efecto y se mandan por el socket: no hace falta que este
  // componente se re-renderice cada vez que cambia la selección.
  const modo = useEditor((st) => st.mode);
  const vista = useEditor((st) => st.viewMode);
  const seleccion = useViewer((st) => st.selection);

  useEffect(() => {
    if (!proyectoId) {
      setConectados([]);
      return;
    }

    const socket = io(`${API_BASE_URL}/presencia`, {
      query: { proyectoId },
      withCredentials: true,
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setReconectando(false);
      setError(null);
    });

    socket.on("presencia:lista", (lista: Presente[]) => {
      setConectados(Array.isArray(lista) ? lista : []);
    });

    socket.on("presencia:cambio", (presente: Presente) => {
      setConectados((prev) => {
        const resto = prev.filter((p) => p.usuarioId !== presente.usuarioId);
        return [...resto, presente].sort((a, b) => a.usuarioId - b.usuarioId);
      });
    });

    socket.on("presencia:error", (payload: { mensaje?: string }) => {
      setError(payload?.mensaje ?? "No se pudo entrar a la sesión compartida.");
    });

    socket.io.on("reconnect_attempt", () => setReconectando(true));
    socket.on("disconnect", () => setReconectando(true));
    socket.on("connect_error", () => setReconectando(true));

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [proyectoId]);

  // Throttle: la selección cambia en cada clic, pero 4 Hz alcanza para que el
  // remoto vea el movimiento y evita inundar el canal.
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket?.connected) return;

    const timer = setTimeout(() => {
      socket.emit("presencia:actualizar", {
        nodoSeleccionado: seleccion.selectedIds?.[0] ?? null,
        nivelId: seleccion.levelId ?? null,
        edificioId: seleccion.buildingId ?? null,
        modo: modo ?? null,
        vista: vista ?? null,
      });
    }, 250);

    return () => clearTimeout(timer);
  }, [modo, vista, seleccion.selectedIds, seleccion.levelId, seleccion.buildingId]);

  return { conectados, reconectando, error };
}