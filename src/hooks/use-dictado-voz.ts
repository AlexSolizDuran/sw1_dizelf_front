"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  elegirMimeType,
  STT_MAX_DURACION_MS,
  transcribirAudio,
} from "@/lib/ia/stt";

export type EstadoDictado = "inactivo" | "solicitando" | "grabando" | "transcribiendo";

function mensajeDePermisoMicrofono(error: unknown): string {
  const nombre = (error as { name?: string } | null)?.name ?? "";
  if (nombre === "NotAllowedError" || nombre === "SecurityError") {
    return "No se pudo acceder al micrófono. Revisá los permisos del navegador.";
  }
  if (nombre === "NotFoundError" || nombre === "DevicesNotFoundError") {
    return "No se encontró un micrófono disponible.";
  }
  if (nombre === "NotReadableError" || nombre === "TrackStartError") {
    return "El micrófono está siendo usado por otra aplicación.";
  }
  return "No se pudo iniciar la grabación de audio.";
}

export function useDictadoVoz({
  onTexto,
  maxDuracionMs = STT_MAX_DURACION_MS,
}: {
  onTexto: (texto: string) => void;
  maxDuracionMs?: number;
}) {
  const [estado, setEstado] = useState<EstadoDictado>("inactivo");
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const solicitandoRef = useRef(false);
  const descartarRef = useRef(false);
  const onTextoRef = useRef(onTexto);

  useEffect(() => {
    onTextoRef.current = onTexto;
  }, [onTexto]);

  const limpiarRecursos = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    const stream = streamRef.current;
    streamRef.current = null;
    stream?.getTracks().forEach((track) => track.stop());
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      descartarRef.current = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.ondataavailable = null;
        recorder.onstop = null;
        recorder.onerror = null;
        try {
          recorder.stop();
        } catch {
          // ya estaba detenido
        }
      }
      limpiarRecursos();
    };
  }, [limpiarRecursos]);

  const detener = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        limpiarRecursos();
        setEstado("inactivo");
      }
    }
  }, [limpiarRecursos]);

  const iniciar = useCallback(async () => {
    if (estado !== "inactivo" || solicitandoRef.current) return;
    solicitandoRef.current = true;
    setError(null);
    setEstado("solicitando");

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      solicitandoRef.current = false;
      setEstado("inactivo");
      setError(
        typeof window !== "undefined" && window.isSecureContext === false
          ? "El micrófono requiere HTTPS (o localhost)."
          : "Tu navegador no soporta la grabación de audio."
      );
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      solicitandoRef.current = false;
      setEstado("inactivo");
      setError("Tu navegador no soporta la grabación de audio.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const mimeType = elegirMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      descartarRef.current = false;

      recorder.ondataavailable = (evento) => {
        if (evento.data.size > 0) chunksRef.current.push(evento.data);
      };

      recorder.onerror = () => {
        descartarRef.current = true;
        setError("La grabación se interrumpió. Probá de nuevo.");
        limpiarRecursos();
        if (mountedRef.current) setEstado("inactivo");
      };

      recorder.onstop = () => {
        const tipo = recorder.mimeType || mimeType || "audio/webm";
        const audio = new Blob(chunksRef.current, { type: tipo });
        const montado = mountedRef.current;
        const descartar = descartarRef.current;
        descartarRef.current = false;
        chunksRef.current = [];
        limpiarRecursos();
        if (!montado || descartar) return;

        if (audio.size < 256) {
          setEstado("inactivo");
          setError("La grabación fue demasiado corta. Hablá antes de detenerla.");
          return;
        }

        setEstado("transcribiendo");
        void transcribirAudio(audio)
          .then((texto) => {
            if (!mountedRef.current) return;
            if (texto.trim() !== "") onTextoRef.current(texto.trim());
            setEstado("inactivo");
          })
          .catch((err: unknown) => {
            if (!mountedRef.current) return;
            setEstado("inactivo");
            setError(
              err instanceof Error ? err.message : "No se pudo transcribir el audio."
            );
          });
      };

      recorder.start(250);
      setEstado("grabando");
      timeoutRef.current = setTimeout(() => detener(), maxDuracionMs);
    } catch (err: unknown) {
      limpiarRecursos();
      if (mountedRef.current) setEstado("inactivo");
      setError(mensajeDePermisoMicrofono(err));
    } finally {
      solicitandoRef.current = false;
    }
  }, [detener, estado, limpiarRecursos, maxDuracionMs]);

  const alternar = useCallback(() => {
    if (estado === "grabando") {
      detener();
      return;
    }
    if (estado === "inactivo") void iniciar();
  }, [detener, estado, iniciar]);

  return {
    estado,
    solicitando: estado === "solicitando",
    grabando: estado === "grabando",
    transcribiendo: estado === "transcribiendo",
    error,
    alternar,
    limpiarError: () => setError(null),
  };
}
