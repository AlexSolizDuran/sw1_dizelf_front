import { API_BASE_URL } from "@/lib/api";

/**
 * Cliente del ticket de sincronización.
 *
 * El WebSocket no pasa por el proxy de Next —Vercel no proxea WebSockets—, así
 * que el handshake va directo al backend. Pero la cookie de sesión quedó
 * host-only del dominio del front (el login ahora pasa por `/api/backend`), y
 * por eso el gateway recibe a cambio un ticket firmado, de vida corta, atado al
 * usuario y al proyecto.
 *
 * El ticket lo emite el BACKEND (`POST /proyectos/:id/sync-ticket`), no este
 * código: el secreto de firma nunca sale de Render y la membresía se valida del
 * lado del servidor.
 */

/** Tope de la petición. Es un POST chico; si tarda esto, algo se colgó. */
const TIMEOUT_MS = 10_000;

/**
 * Cuánto se reutiliza un ticket.
 *
 * Bien por debajo de los 120 s de vida: si socket.io reintenta varias veces
 * seguidas (los dos namespaces reconectan juntos), no se pide uno nuevo en cada
 * intento. Al expirar el caché, el siguiente `auth` pide otro.
 */
const CACHE_MS = 20_000;

export class ErrorTicket extends Error {
  constructor(
    readonly status: number,
    mensaje: string
  ) {
    super(mensaje);
    this.name = "ErrorTicket";
  }
}

/** `401`/`403` significan que no hay sesión válida: reintentar no sirve. */
export function esErrorDeSesion(error: unknown): error is ErrorTicket {
  return (
    error instanceof ErrorTicket &&
    (error.status === 401 || error.status === 403)
  );
}

const cache = new Map<string, { ticket: string; expiraEn: number }>();

/**
 * Pide un ticket para abrir el socket de sync de `proyectoId`.
 *
 * Lo llama socket.io en cada conexión y reconexión a través de `auth`, así que
 * el ticket se renueva solo cuando el anterior vence.
 */
export async function pedirTicketSync(proyectoId: string): Promise<string> {
  const guardado = cache.get(proyectoId);
  if (guardado && guardado.expiraEn > Date.now()) return guardado.ticket;

  const control = new AbortController();
  const timer = setTimeout(() => control.abort(new Error("timeout")), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(
      `${API_BASE_URL}/proyectos/${encodeURIComponent(proyectoId)}/sync-ticket`,
      {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: control.signal,
      }
    );
  } catch {
    if (control.signal.aborted) {
      throw new ErrorTicket(
        0,
        "El servidor tardó demasiado en emitir el ticket de sincronización."
      );
    }
    throw new ErrorTicket(
      0,
      "No se pudo pedir el ticket de sincronización."
    );
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as {
      message?: string | string[];
    };
    if (res.status === 401) {
      throw new ErrorTicket(401, "Tu sesión venció. Volvé a iniciar sesión.");
    }
    const mensaje = Array.isArray(data.message)
      ? data.message.join(". ")
      : data.message;
    throw new ErrorTicket(
      res.status,
      mensaje || `El servidor respondió HTTP ${res.status}.`
    );
  }

  const data = (await res.json().catch(() => ({}))) as { ticket?: unknown };
  if (typeof data.ticket !== "string" || data.ticket.length === 0) {
    throw new ErrorTicket(
      500,
      "El servidor no emitió el ticket de sincronización."
    );
  }

  cache.set(proyectoId, {
    ticket: data.ticket,
    expiraEn: Date.now() + CACHE_MS,
  });
  return data.ticket;
}
