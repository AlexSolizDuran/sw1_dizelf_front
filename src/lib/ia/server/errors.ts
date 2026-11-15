import type { FallbackIA } from "../types";

export type MotivoError = FallbackIA["motivo"] | "4xx";

/** Error tipado de un proveedor; el fallback decide con `motivo`. */
export class ErrorProveedor extends Error {
  constructor(
    readonly motivo: MotivoError,
    mensaje: string,
    readonly status?: number,
    readonly retryAfterMs?: number
  ) {
    super(mensaje);
    this.name = "ErrorProveedor";
  }
}

function leerRetryAfter(valor: string | null, ahora = Date.now()): number | undefined {
  if (!valor) return undefined;
  const segundos = Number(valor);
  if (Number.isFinite(segundos) && segundos >= 0) return Math.round(segundos * 1000);
  const fecha = Date.parse(valor);
  if (!Number.isNaN(fecha)) return Math.max(0, fecha - ahora);
  return undefined;
}

/** Fetch con timeout propio; normaliza red y timeout a `ErrorProveedor`. */
export async function fetchConTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch (error: unknown) {
    if (controller.signal.aborted) {
      throw new ErrorProveedor("timeout", `El proveedor no respondió en ${timeoutMs} ms.`);
    }
    const mensaje = error instanceof Error ? error.message : String(error);
    throw new ErrorProveedor("red", `No se pudo conectar con el proveedor: ${mensaje}`);
  } finally {
    clearTimeout(timer);
  }
}

/** Convierte una respuesta HTTP no-2xx en un error clasificable. */
export function errorHttp(
  proveedor: string,
  res: Response,
  texto: string
): ErrorProveedor {
  const detalle = (texto || `HTTP ${res.status}`).slice(0, 300);
  const mensaje = `${proveedor} respondió HTTP ${res.status}: ${detalle}`;
  if (res.status === 429) {
    return new ErrorProveedor(
      "429",
      mensaje,
      res.status,
      leerRetryAfter(res.headers.get("retry-after"))
    );
  }
  if (res.status >= 500) return new ErrorProveedor("5xx", mensaje, res.status);
  return new ErrorProveedor("4xx", mensaje, res.status);
}

/** Quita credenciales que el proveedor pudiera reflejar en un mensaje. */
export function sanitizarMensaje(mensaje: string): string {
  return mensaje
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redactado]")
    .replace(/\b(?:sk|hf|or)-[A-Za-z0-9._-]{12,}\b/gi, "[redactado]")
    .replace(/((?:api[_-]?key|token|secret)\s*[=:]\s*)[^\s,;]+/gi, "$1[redactado]");
}
