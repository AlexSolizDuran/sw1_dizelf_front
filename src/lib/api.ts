import { ApiError } from "@/types/auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface RequestOptions extends RequestInit {
  params?: Record<string, string>;
}

export async function apiClient<T>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const { params, headers, ...rest } = options;

  let url = endpoint.startsWith("http") ? endpoint : `${API_BASE_URL}${endpoint}`;

  if (params) {
    const searchParams = new URLSearchParams(params);
    url += (url.includes("?") ? "&" : "?") + searchParams.toString();
  }

  const response = await fetch(url, {
    credentials: "include", // Vital: transporta la cookie HttpOnly access_token
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    ...rest,
  });

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
