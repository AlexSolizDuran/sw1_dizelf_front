import { IA_CHAT_TIMEOUT_MS } from "./config";
import type {
  IAChatMessage,
  IAChatResponse,
  IAProvider,
  IAToolDef,
} from "./types";

export class ErrorProxy extends Error {
  constructor(
    readonly status: number,
    mensaje: string,
    readonly retryAfterMs?: number
  ) {
    super(mensaje);
    this.name = "ErrorProxy";
  }
}

export interface OpcionesProxy {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ProxyBody {
  provider: IAProvider;
  model: string;
  messages: IAChatMessage[];
  tools: IAToolDef[];
  /**
   * Proveedor que no debe usarse en esta petición.
   *
   * Se manda cuando el modelo chico repite el mismo error de argumentos: el
   * servidor salta directo al respaldo en vez de reintentar contra el mismo.
   */
  evitarProveedor?: IAProvider;
}

/**
 * Cliente del proxy `/api/ia/chat`.
 *
 * Es el único punto del navegador que habla con el proveedor. El servidor
 * resuelve la cadena de respaldo y devuelve también qué proveedor respondió.
 */
export async function solicitarChat(
  body: ProxyBody,
  opciones: OpcionesProxy = {}
): Promise<IAChatResponse> {
  const timeoutMs = opciones.timeoutMs ?? IA_CHAT_TIMEOUT_MS;
  const controller = new AbortController();
  let abortadoPorTimeout = false;
  const timer = setTimeout(() => {
    abortadoPorTimeout = true;
    controller.abort();
  }, timeoutMs);

  const alAbortar = () => controller.abort();
  if (opciones.signal) {
    if (opciones.signal.aborted) {
      clearTimeout(timer);
      throw new ErrorProxy(0, "La operación fue cancelada.");
    }
    opciones.signal.addEventListener("abort", alAbortar, { once: true });
  }

  try {
    let res: Response;
    try {
      res = await fetch("/api/ia/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch {
      if (abortadoPorTimeout) {
        throw new ErrorProxy(
          0,
          `El asistente no respondió en ${Math.round(timeoutMs / 1000)} s.`
        );
      }
      if (opciones.signal?.aborted) {
        throw new ErrorProxy(0, "La operación fue cancelada.");
      }
      throw new ErrorProxy(0, "No se pudo conectar con el asistente.");
    }

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      const retryAfter = Number(res.headers.get("Retry-After") ?? "0");
      throw new ErrorProxy(
        res.status,
        data.error ?? `El asistente respondió HTTP ${res.status}.`,
        Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : undefined
      );
    }

    const data = (await res.json()) as Partial<IAChatResponse>;
    return {
      content: data.content ?? "",
      toolCalls: Array.isArray(data.toolCalls) ? data.toolCalls : [],
      model: data.model,
      proveedorUsado: data.proveedorUsado,
      modeloUsado: data.modeloUsado,
      fallbacks: data.fallbacks,
      finishReason: data.finishReason,
      usage: data.usage,
    };
  } finally {
    clearTimeout(timer);
    opciones.signal?.removeEventListener("abort", alAbortar);
  }
}

export function mensajeDeErrorIA(error: unknown): string {
  if (error instanceof ErrorProxy) {
    if (error.status === 401) {
      /*
       * Se muestra el mensaje del servidor, no uno fijo.
       *
       * Antes decía siempre "Tu sesión venció…", y eso mandaba a diagnosticar
       * mal: el caso real en producción era que la cookie de sesión no llegaba
       * al route handler porque vivía en el dominio del backend. El servidor
       * distingue `sin-sesion` ("Iniciá sesión…") de `sesion-invalida`
       * ("Tu sesión venció…"); el cliente tiene que repetir esa distinción en
       * vez de inventar una.
       */
      return error.message;
    }
    if (error.status === 429) {
      const segundos = error.retryAfterMs
        ? Math.max(1, Math.ceil(error.retryAfterMs / 1000))
        : null;
      return segundos
        ? `Alcanzaste el límite de uso. Esperá ${segundos} s.`
        : "Alcanzaste el límite de uso. Esperá un momento.";
    }
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : "El asistente no respondió.";
}
