import { IA_STT_MAX_DURACION_MS } from "./config";

/**
 * Dictado por voz: grabación en el navegador y transcripción por el proxy
 * `/api/ia/transcribe`, que habla con el HF Space de voz.
 */

export const STT_MAX_DURACION_MS = IA_STT_MAX_DURACION_MS;

export const STT_MIME_CANDIDATOS = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/mp4",
  "audio/mpeg",
  "audio/wav",
] as const;

const EXTENSIONES: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm",
  "audio/ogg": "ogg",
  "video/ogg": "ogg",
  "audio/mp4": "m4a",
  "video/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
};

export interface ResultadoDictado {
  texto: string;
  cursor: number;
}

export function elegirMimeType(
  soportado?: (tipo: string) => boolean
): string | undefined {
  const comprobar =
    soportado ??
    ((tipo: string) => {
      if (typeof MediaRecorder === "undefined") return false;
      return typeof MediaRecorder.isTypeSupported === "function"
        ? MediaRecorder.isTypeSupported(tipo)
        : false;
    });
  return STT_MIME_CANDIDATOS.find((tipo) => comprobar(tipo));
}

export function extensionDeMime(mime: string): string {
  const base = mime.split(";")[0]?.trim().toLowerCase() ?? "";
  return EXTENSIONES[base] ?? "webm";
}

export function nombreArchivoAudio(mime: string, ahora = Date.now()): string {
  return `dictado-${ahora}.${extensionDeMime(mime)}`;
}

/** Inserta el dictado en la posición del cursor, con espacios de separación. */
export function insertarDictado(
  textoActual: string,
  dictado: string,
  cursor: number
): ResultadoDictado {
  const limpio = dictado.trim();
  const posicion = Math.max(0, Math.min(Math.trunc(cursor), textoActual.length));
  if (limpio === "") return { texto: textoActual, cursor: posicion };

  const antes = textoActual.slice(0, posicion);
  const despues = textoActual.slice(posicion);
  const prefijo = antes !== "" && !/\s$/.test(antes) ? " " : "";
  const sufijo = despues !== "" && !/^\s/.test(despues) ? " " : "";
  const insertado = `${prefijo}${limpio}${sufijo}`;

  return {
    texto: `${antes}${insertado}${despues}`,
    cursor: antes.length + insertado.length,
  };
}

function leerTexto(datos: unknown): string {
  if (typeof datos !== "object" || datos === null) return "";
  const texto = (datos as Record<string, unknown>).text;
  return typeof texto === "string" ? texto.trim() : "";
}

function mensajeDeError(datos: unknown, status: number): string {
  if (typeof datos === "object" && datos !== null) {
    const error = (datos as Record<string, unknown>).error;
    if (typeof error === "string" && error.trim() !== "") return error.trim();
  }
  if (status === 401) return "Tu sesión expiró. Volvé a iniciar sesión.";
  if (status === 413) return "El audio es demasiado grande. Grabá algo más corto.";
  if (status === 415) return "El formato de audio no es compatible.";
  if (status === 422) return "No se detectó voz. Hablá más cerca del micrófono.";
  if (status === 429) return "Alcanzaste el límite de uso del dictado.";
  if (status === 504) return "El servicio de voz tardó demasiado. Probá de nuevo.";
  return "No se pudo transcribir el audio.";
}

export async function transcribirAudio(
  audio: Blob,
  opciones: { signal?: AbortSignal } = {}
): Promise<string> {
  const formulario = new FormData();
  const nombre = nombreArchivoAudio(audio.type || "audio/webm");
  formulario.append(
    "file",
    new File([audio], nombre, { type: audio.type || "audio/webm" })
  );

  const respuesta = await fetch("/api/ia/transcribe", {
    method: "POST",
    body: formulario,
    signal: opciones.signal,
    cache: "no-store",
  });

  const datos = (await respuesta.json().catch(() => null)) as unknown;
  if (!respuesta.ok) {
    throw new Error(mensajeDeError(datos, respuesta.status));
  }

  const texto = leerTexto(datos);
  if (texto === "") {
    throw new Error("No se detectó voz en la grabación.");
  }
  return texto;
}
