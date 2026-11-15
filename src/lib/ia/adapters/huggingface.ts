import {
  HF_BASE_URL,
  HF_DEFAULT_MODEL,
  HF_MODELS_URL,
  HF_TOKEN,
  IA_CHAT_TIMEOUT_MS,
} from "../config";
import type {
  HealthResult,
  IAChatRequestBody,
  IAChatResponse,
  IAToolCall,
  IAToolDef,
} from "../types";
import { ErrorProveedor, errorHttp, fetchConTimeout } from "../server/errors";

const CURATED_MODELS = [
  "meta-llama/Llama-3.1-8B-Instruct",
  "Qwen/Qwen2.5-Coder-7B-Instruct",
  "openai/gpt-oss-120b",
];

function toJsonArgs(args: string | Record<string, unknown> | undefined): string {
  if (typeof args === "string") return args;
  return JSON.stringify(args ?? {});
}

function toMessages(messages: IAChatRequestBody["messages"]): unknown[] {
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
  if (!HF_TOKEN) {
    return {
      ok: false,
      error: "Falta HF_TOKEN en el servidor para usar Hugging Face.",
    };
  }
  return { ok: true };
}

export async function listModels(): Promise<string[]> {
  const modelos = new Set<string>([HF_DEFAULT_MODEL, ...CURATED_MODELS]);
  if (!HF_TOKEN) return [...modelos];

  try {
    const res = await fetchConTimeout(
      HF_MODELS_URL,
      { headers: { Authorization: `Bearer ${HF_TOKEN}` } },
      10_000
    );
    if (res.ok) {
      const json = (await res.json()) as
        | Array<{ id?: string }>
        | { data?: Array<{ id?: string }> };
      const items = Array.isArray(json) ? json : (json.data ?? []);
      for (const item of items.slice(0, 40)) {
        if (typeof item.id === "string" && item.id.trim() !== "") {
          modelos.add(item.id);
        }
      }
    }
  } catch {
    // Sin red se devuelve la lista curada.
  }
  return [...modelos];
}

export async function chat(req: IAChatRequestBody): Promise<IAChatResponse> {
  if (!HF_TOKEN) {
    throw new ErrorProveedor(
      "4xx",
      "Falta HF_TOKEN en el servidor para el proveedor Hugging Face."
    );
  }

  const payload: Record<string, unknown> = {
    model: req.model || HF_DEFAULT_MODEL,
    messages: toMessages(req.messages),
    stream: false,
    temperature: 0.2,
    max_tokens: 4096,
  };
  if (req.tools.length > 0) {
    payload.tools = req.tools as IAToolDef[];
    payload.tool_choice = "auto";
  }

  const res = await fetchConTimeout(
    `${HF_BASE_URL}/v1/chat/completions`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${HF_TOKEN}`,
      },
      body: JSON.stringify(payload),
    },
    IA_CHAT_TIMEOUT_MS
  );

  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw errorHttp("Hugging Face", res, texto);
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
}
