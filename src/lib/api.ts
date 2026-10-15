import { ApiError } from "@/types/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Tope por petición.
 *
 * Holgado a propósito: un `PATCH /proyectos/:id` manda la escena completa y
 * con un plano grande puede tardar varios segundos. Sin este techo, un backend
 * colgado dejaba el spinner de carga y de guardado girando para siempre, sin
 * distinguishable de "está trabajando".
 */
const TIMEOUT_MS = 15_000;

const MENSAJE_TIMEOUT =
  "La solicitud tardó demasiado. Revisá tu conexión e intentá de nuevo.";

const MENSAJE_SIN_RED =
  "No se pudo conectar con el servidor. Revisá tu conexión a internet.";

interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, headers, signal, ...rest } = options;

  let url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`;

  if (params) {
    const searchParams = new URLSearchParams(params);
    url += (url.includes("?") ? "&" : "?") + searchParams.toString();
  }

  // Se compone el signal propio con el del llamador: el timeout se cancela
  // solo si quien llama no lo cancela antes, y viceversa.
  const control = new AbortController();
  const temporizador = setTimeout(() => control.abort(new Error("timeout")), TIMEOUT_MS);
  const alAbortar = () => control.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) {
      clearTimeout(temporizador);
      throw signal.reason instanceof Error
        ? signal.reason
        : new Error("La solicitud fue cancelada.");
    }
    signal.addEventListener("abort", alAbortar, { once: true });
  }

  let response: Response;
  try {
    response = await fetch(url, {
      credentials: "include", // Vital: transporta la cookie HttpOnly access_token
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      signal: control.signal,
      ...rest,
    });
  } catch (e) {
    // Se limpia antes de traducir: el error se propaga, no se propaga el timer.
    clearTimeout(temporizador);
    if (signal) signal.removeEventListener("abort", alAbortar);

    if (control.signal.aborted && !signal?.aborted) {
      throw new Error(MENSAJE_TIMEOUT);
    }
    if (signal?.aborted) {
      throw new Error("La solicitud fue cancelada.");
    }
    throw new Error(MENSAJE_SIN_RED, { cause: e });
  }
  clearTimeout(temporizador);
  if (signal) signal.removeEventListener("abort", alAbortar);

  if (!response.ok) {
    let errorData: ApiError = {
      statusCode: response.status,
      message: "Ha ocurrido un error inesperado",
    };

    try {
      const data = await response.json();
      if (data && typeof data === "object") {
        errorData = data as ApiError;
      }
    } catch {
      // Si la respuesta no es JSON válido
    }

    let friendlyMessage = "Error al procesar la solicitud.";
    if (Array.isArray(errorData.message)) {
      friendlyMessage = errorData.message.join(". ");
    } else if (typeof errorData.message === "string") {
      friendlyMessage = errorData.message;
    }

    if (response.status === 401) {
      friendlyMessage = "Credenciales inválidas. Verifica tus datos.";
    } else if (response.status === 409) {
      friendlyMessage = "El nombre de usuario o correo electrónico ya está registrado.";
    }

    const error = new Error(friendlyMessage);
    (error as Error & { statusCode?: number }).statusCode = response.status;
    throw error;
  }

  // Si la respuesta no tiene cuerpo (ej. 204 No Content)
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return {} as T;
}
