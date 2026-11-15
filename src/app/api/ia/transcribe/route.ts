import type { NextRequest } from "next/server";
import {
  HF_STT_SPACE_URL,
  IA_STT_MAX_BYTES,
  IA_STT_TIMEOUT_MS,
} from "@/lib/ia/config";
import { guardiaIA } from "@/lib/ia/server/guard";

export const runtime = "nodejs";
export const maxDuration = 300;

const MENSAJE_SERVICIO =
  "El servicio de voz no está disponible en este momento. Intentá de nuevo en unos segundos.";

function errorJson(mensaje: string, status: number): Response {
  return Response.json({ error: mensaje }, { status });
}

function esArchivo(valor: FormDataEntryValue | null): valor is File {
  return (
    typeof valor === "object" &&
    valor !== null &&
    typeof (valor as File).arrayBuffer === "function" &&
    typeof (valor as File).size === "number"
  );
}

function tipoAceptado(tipo: string): boolean {
  const limpio = tipo.trim().toLowerCase();
  if (limpio === "") return true;
  return limpio.startsWith("audio/") || limpio.startsWith("video/");
}

function mensajeDeEstado(status: number): string {
  if (status === 413) return "El audio es demasiado grande. Grabá un mensaje más corto.";
  if (status === 415) return "El formato de audio no es compatible con el servicio de voz.";
  if (status === 429) return "El servicio de voz está ocupado. Esperá un momento.";
  if (status === 503) return "El servicio de voz se está iniciando. Esperá un momento.";
  return MENSAJE_SERVICIO;
}

export async function POST(request: NextRequest) {
  const guardia = await guardiaIA(request, "transcribe");
  if (!guardia.ok) return guardia.respuesta;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return errorJson("El audio debe enviarse como multipart/form-data.", 415);
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (
    Number.isFinite(contentLength) &&
    contentLength > IA_STT_MAX_BYTES + 64 * 1024
  ) {
    return errorJson("El audio es demasiado grande. Grabá un mensaje más corto.", 413);
  }

  let formulario: FormData;
  try {
    formulario = await request.formData();
  } catch {
    return errorJson("No se pudo leer el audio enviado.", 400);
  }

  const archivo = formulario.get("file");
  if (!esArchivo(archivo)) {
    return errorJson("Falta el archivo de audio.", 400);
  }
  if (archivo.size === 0) {
    return errorJson("El archivo de audio está vacío.", 400);
  }
  if (archivo.size > IA_STT_MAX_BYTES) {
    return errorJson("El audio es demasiado grande. Grabá un mensaje más corto.", 413);
  }
  if (!tipoAceptado(archivo.type)) {
    return errorJson("El formato de audio no es compatible con el servicio de voz.", 415);
  }

  const salida = new FormData();
  salida.append("file", archivo, archivo.name || "dictado.webm");
  salida.append("temperature", "0.2");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IA_STT_TIMEOUT_MS);

  try {
    const respuesta = await fetch(`${HF_STT_SPACE_URL}/api/transcribe`, {
      method: "POST",
      body: salida,
      signal: controller.signal,
      cache: "no-store",
    });

    const datos = (await respuesta.json().catch(() => null)) as
      | { text?: unknown; error?: unknown }
      | null;

    if (!respuesta.ok) {
      console.error(
        `[api/ia:transcribe] space status=${respuesta.status} usuario=${guardia.usuario.usuarioId}`
      );
      return errorJson(
        mensajeDeEstado(respuesta.status),
        respuesta.status >= 500 ? 502 : respuesta.status
      );
    }

    if (datos === null || typeof datos !== "object") {
      return errorJson(MENSAJE_SERVICIO, 502);
    }

    if (typeof datos.error === "string" && datos.error.trim() !== "") {
      console.error(
        `[api/ia:transcribe] space error usuario=${guardia.usuario.usuarioId}`
      );
      return errorJson("El servicio de voz no pudo transcribir el audio.", 502);
    }

    const texto = typeof datos.text === "string" ? datos.text.trim() : "";
    if (texto === "") {
      return errorJson(
        "No se detectó voz en la grabación. Hablá más cerca del micrófono.",
        422
      );
    }

    return Response.json({ text: texto });
  } catch {
    if (controller.signal.aborted) {
      return errorJson(
        "El servicio de voz tardó demasiado. Puede estar iniciándose; probá de nuevo en un minuto.",
        504
      );
    }
    return errorJson(MENSAJE_SERVICIO, 502);
  } finally {
    clearTimeout(timer);
  }
}
