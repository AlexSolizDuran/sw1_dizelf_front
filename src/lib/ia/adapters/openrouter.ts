import {
  IA_CHAT_TIMEOUT_MS,
  OPENROUTER_API_KEYS,
  OPENROUTER_BASE_URL,
  OPENROUTER_DEFAULT_MODEL,
} from "../config";
import type {
  HealthResult,
  IAChatRequestBody,
  IAChatResponse,
  IAToolCall,
  IAToolDef,
} from "../types";
import { ErrorProveedor, errorHttp, fetchConTimeout } from "../server/errors";

/**
 * Modelos de pago que queremos ofrecer siempre en el desplegable del chat.
 * El listado de OpenRouter se filtra a `*:free`, así que Haiku no aparecería
 * aunque la API responda; se agregan de forma explícita.
 */
const MODELOS_DESTACADOS = ["anthropic/claude-haiku-5.5"] as const;

function toJsonArgs(args: string | Record<string, unknown> | undefined): string {
  if (typeof args === "string") return args;
  return JSON.stringify(args ?? {});
}

function toOpenAiMessages(messages: IAChatRequestBody["messages"]): unknown[] {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content ?? "",
        tool_call_id: message.tool_call_id,
      };
    }
    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: message.content ?? "",
        ...(Array.isArray(message.tool_calls) && message.tool_calls.length > 0
          ? { tool_calls: message.tool_calls }
          : {}),
      };
    }
    return { role: message.role, content: message.content ?? "" };
  });
}

export async function health(): Promise<HealthResult> {
  if (OPENROUTER_API_KEYS.length === 0) {
    return {
      ok: false,
      error: "Falta OPENROUTER_API_KEY en el servidor.",
    };
  }
  return { ok: true };
}

export async function listModels(): Promise<string[]> {
  const modelos = new Set<string>([OPENROUTER_DEFAULT_MODEL, ...MODELOS_DESTACADOS]);
  if (OPENROUTER_API_KEYS.length === 0) return [...modelos];

  try {
    const res = await fetchConTimeout(
      `${OPENROUTER_BASE_URL}/api/v1/models`,
      { headers: { Authorization: `Bearer ${OPENROUTER_API_KEYS[0]}` } },
      10_000
    );
    if (res.ok) {
      const json = (await res.json()) as {
        data?: Array<{
          id?: string;
          supported_parameters?: string[] | null;
        }>;
      };
      for (const item of json.data ?? []) {
        if (typeof item.id !== "string" || !item.id.endsWith(":free")) {
          continue;
        }
        // Los modelos sin soporte nativo de tools devuelven narración o JSON
        // en el texto; no sirven para este asistente.
        const soportaTools =
          !Array.isArray(item.supported_parameters) ||
          item.supported_parameters.includes("tools");
        if (soportaTools) modelos.add(item.id);
      }
    }
  } catch {
    // Sin red se devuelve solo el modelo por defecto.
  }
  return [...modelos];
}

export async function chat(req: IAChatRequestBody): Promise<IAChatResponse> {
  if (OPENROUTER_API_KEYS.length === 0) {
    throw new ErrorProveedor(
      "4xx",
      "Falta OPENROUTER_API_KEY en el servidor. Configurala para usar OpenRouter."
    );
  }

  const payload = {
    model: req.model || OPENROUTER_DEFAULT_MODEL,
    messages: toOpenAiMessages(req.messages),
    ...(req.tools.length > 0
      ? {
          tools: req.tools as IAToolDef[],
          tool_choice: "auto",
          // Sin esto OpenRouter puede enrutar a un proveedor que ignora
          // `tools` y devuelve la llamada como texto.
          provider: { require_parameters: true },
        }
      : {}),
    stream: false,
    temperature: 0.2,
    max_tokens: 4096,
  };

  let ultimo: ErrorProveedor | null = null;
  for (const key of OPENROUTER_API_KEYS) {
    try {
      const res = await fetchConTimeout(
        `${OPENROUTER_BASE_URL}/api/v1/chat/completions`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${key}`,
            "HTTP-Referer":
              req.httpReferer ??
              process.env.NEXT_PUBLIC_APP_URL ??
              "http://localhost:3000",
            "X-Title": "DIZELF",
          },
          body: JSON.stringify(payload),
        },
        IA_CHAT_TIMEOUT_MS
      );

      if (!res.ok) {
        const texto = await res.text().catch(() => "");
        throw errorHttp("OpenRouter", res, texto);
      }

      const data = (await res.json()) as {
        model?: string;
        choices?: Array<{
          finish_reason?: string;
          message?: {
            content?: string | null;
            tool_calls?: Array<{
              id?: string;
              type?: string;
              function?: {
                name?: string;
                arguments?: string | Record<string, unknown>;
              };
            }>;
          };
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
        };
      };

      const message = data.choices?.[0]?.message;
      const toolCalls: IAToolCall[] = (message?.tool_calls ?? []).map(
        (call, index) => ({
          id: call.id ?? `call-${Date.now()}-${index}`,
          type: "function",
          function: {
            name: String(call.function?.name ?? ""),
            arguments: toJsonArgs(call.function?.arguments),
          },
        })
      );

      return {
        content: message?.content ?? "",
        toolCalls,
        model: data.model,
        ...(data.choices?.[0]?.finish_reason
          ? { finishReason: data.choices[0].finish_reason }
          : {}),
        ...(data.usage
          ? {
              usage: {
                entrada: data.usage.prompt_tokens ?? 0,
                salida: data.usage.completion_tokens ?? 0,
              },
            }
          : {}),
      };
    } catch (error: unknown) {
      if (error instanceof ErrorProveedor && error.motivo !== "429" && error.motivo !== "5xx") {
        throw error;
      }
      ultimo =
        error instanceof ErrorProveedor
          ? error
          : new ErrorProveedor("red", String(error));
    }
  }

  throw (
    ultimo ??
    new ErrorProveedor("4xx", "OpenRouter no respondió con ninguna de las claves configuradas.")
  );
}
