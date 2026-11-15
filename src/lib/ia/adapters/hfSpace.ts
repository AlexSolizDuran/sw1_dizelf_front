import {
  HF_SPACE_MODEL,
  HF_SPACE_MODELOS,
  HF_SPACE_URL,
  HF_TOKEN,
  IA_CHAT_TIMEOUT_MS,
} from "../config";
import type {
  HealthResult,
  IAChatMessage,
  IAChatRequestBody,
  IAChatResponse,
  IAToolCall,
} from "../types";
import { ErrorProveedor, errorHttp, fetchConTimeout } from "../server/errors";

export function resolverEspacio(modelo?: string | null): {
  id: string;
  url: string;
} {
  const buscado = (modelo ?? "").trim().toLowerCase();
  const encontrado = HF_SPACE_MODELOS.find(
    (id) => id.toLowerCase() === buscado
  );
  return { id: encontrado ?? HF_SPACE_MODEL, url: HF_SPACE_URL };
}

/**
 * El Space es público, pero mandar el token hace que ZeroGPU consuma la cuota
 * de la cuenta (5 min/día) en vez de la anónima (2 min/día). Sin token la
 * petición funciona igual.
 */
function cabecerasSpace(extra: Record<string, string> = {}): Record<string, string> {
  return HF_TOKEN ? { ...extra, Authorization: `Bearer ${HF_TOKEN}` } : extra;
}

export async function health(): Promise<HealthResult> {
  try {
    const res = await fetchConTimeout(
      `${HF_SPACE_URL}/health`,
      { headers: cabecerasSpace() },
      15_000
    );
    if (!res.ok) {
      return { ok: false, error: `HF Space respondió HTTP ${res.status}.` };
    }
    return { ok: true };
  } catch (error: unknown) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function listModels(): Promise<string[]> {
  return [...HF_SPACE_MODELOS];
}

function toJsonArgs(valor: unknown): string {
  if (typeof valor === "string") return valor;
  try {
    return JSON.stringify(valor ?? {});
  } catch {
    return "{}";
  }
}

/**
 * El Space expone un endpoint compatible con OpenAI (`/v1/chat/completions`),
 * así que los mensajes viajan tal cual: conserva `tool_calls` del asistente y
 * `tool_call_id` de los resultados para que el modelo encadene rondas.
 */
function toMessages(mensajes: IAChatMessage[]): unknown[] {
  return mensajes.map((mensaje) => {
    if (mensaje.role === "tool") {
      return {
        role: "tool",
        content: mensaje.content ?? "",
        tool_call_id: mensaje.tool_call_id,
      };
    }
    if (mensaje.role === "assistant") {
      return {
        role: "assistant",
        content: mensaje.content ?? "",
        ...(Array.isArray(mensaje.tool_calls) && mensaje.tool_calls.length > 0
          ? { tool_calls: mensaje.tool_calls }
          : {}),
      };
    }
    return { role: mensaje.role, content: mensaje.content ?? "" };
  });
}

function llamadaDesdeObjeto(
  valor: unknown,
  indice: number,
  nombresValidos?: ReadonlySet<string>
): IAToolCall | null {
  if (typeof valor !== "object" || valor === null) return null;
  const objeto = valor as Record<string, unknown>;
  const funcion = (
    typeof objeto.function === "object" && objeto.function !== null
      ? objeto.function
      : objeto
  ) as Record<string, unknown>;
  const name = String(funcion.name ?? objeto.name ?? "").trim();
  if (!name) return null;
  // El modelo a veces escribe objetos de datos ({"name":"Patio",...}) en el
  // contenido. Sin este filtro se convierten en tools inventadas y el turno
  // se quema en errores repetidos.
  if (nombresValidos && !nombresValidos.has(name)) return null;
  const args =
    funcion.arguments ?? funcion.args ?? objeto.arguments ?? objeto.args ?? {};
  return {
    id: String(objeto.id ?? `call-${Date.now()}-${indice}`),
    type: "function",
    function: { name, arguments: toJsonArgs(args) },
  };
}

function llamadasDeArreglo(
  valor: unknown,
  nombresValidos?: ReadonlySet<string>
): IAToolCall[] {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((item, indice) => llamadaDesdeObjeto(item, indice, nombresValidos))
    .filter((llamada): llamada is IAToolCall => llamada !== null);
}

function llamadasDeJson(
  texto: string,
  nombresValidos?: ReadonlySet<string>
): IAToolCall[] {
  try {
    const parsed: unknown = JSON.parse(texto);
    if (typeof parsed !== "object" || parsed === null) return [];
    const objeto = parsed as Record<string, unknown>;
    const toolCalls = objeto.tool_calls ?? objeto.toolCalls;
    if (Array.isArray(toolCalls)) {
      return llamadasDeArreglo(toolCalls, nombresValidos);
    }
    const unica = llamadaDesdeObjeto(objeto, 0, nombresValidos);
    return unica ? [unica] : [];
  } catch {
    return [];
  }
}

function objetosJson(texto: string): string[] {
  const objetos: string[] = [];
  let indice = 0;
  while (indice < texto.length) {
    const inicio = texto.indexOf("{", indice);
    if (inicio === -1) break;
    let profundidad = 0;
    let fin = -1;
    let enCadena = false;
    let escape = false;
    for (let i = inicio; i < texto.length; i++) {
      const caracter = texto[i];
      if (enCadena) {
        if (escape) escape = false;
        else if (caracter === "\\") escape = true;
        else if (caracter === '"') enCadena = false;
        continue;
      }
      if (caracter === '"') enCadena = true;
      else if (caracter === "{") profundidad++;
      else if (caracter === "}") {
        profundidad--;
        if (profundidad === 0) {
          fin = i;
          break;
        }
      }
    }
    if (fin === -1) break;
    objetos.push(texto.slice(inicio, fin + 1));
    indice = fin + 1;
  }
  return objetos;
}

function deduplicar(llamadas: IAToolCall[]): IAToolCall[] {
  const vistas = new Set<string>();
  return llamadas.filter((llamada) => {
    const clave = `${llamada.function.name}|${llamada.function.arguments}`;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
}

/**
 * Red de seguridad: si el chat template no separa la llamada y la deja dentro
 * de `content` (`<tool_call>{...}</tool_call>` o un bloque JSON), se recupera.
 *
 * `nombresValidos` limita la recuperación a las tools declaradas: un objeto de
 * datos como `{"name":"Patio","polygon":[...]}` no es una llamada.
 */
export function parseTextoToToolCalls(
  texto: string,
  nombresValidos?: ReadonlySet<string>
): IAToolCall[] {
  const raw = (texto ?? "").trim();
  if (!raw) return [];

  for (const bloque of raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const encontradas = llamadasDeJson(bloque[1].trim(), nombresValidos);
    if (encontradas.length > 0) return encontradas;
  }

  const etiquetas = deduplicar(
    Array.from(raw.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi))
      .flatMap((match) => llamadasDeJson(match[1].trim(), nombresValidos))
  );
  if (etiquetas.length > 0) return etiquetas;

  const directas = llamadasDeJson(raw, nombresValidos);
  if (directas.length > 0) return directas;

  return deduplicar(
    objetosJson(raw).flatMap((objeto) =>
      llamadasDeJson(objeto, nombresValidos)
    )
  );
}

interface RespuestaOpenAI {
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
}

export async function chat(req: IAChatRequestBody): Promise<IAChatResponse> {
  const espacio = resolverEspacio(req.model);

  const payload: Record<string, unknown> = {
    model: espacio.id,
    messages: toMessages(req.messages),
    stream: false,
    temperature: 0.2,
    // El Space usa este valor como `max_new_tokens`. Con 1024 una respuesta
    // con muchas tool calls se cortaba a mitad del JSON y la app recibía
    // argumentos vacíos sin poder distinguirlo de un error del modelo.
    max_tokens: 2048,
  };
  if (req.tools.length > 0) {
    payload.tools = req.tools;
    payload.tool_choice = "auto";
  }

  const res = await fetchConTimeout(
    `${espacio.url}/v1/chat/completions`,
    {
      method: "POST",
      headers: cabecerasSpace({ "Content-Type": "application/json" }),
      body: JSON.stringify(payload),
    },
    IA_CHAT_TIMEOUT_MS
  );

  if (!res.ok) {
    const texto = await res.text().catch(() => "");
    throw errorHttp("HF Space", res, texto);
  }

  const data = (await res.json()) as RespuestaOpenAI;
  const message = data.choices?.[0]?.message;
  const content = String(message?.content ?? "");
  const nombresValidos = new Set(
    req.tools.map((tool) => tool.function.name)
  );

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
    content,
    toolCalls:
      toolCalls.length > 0
        ? toolCalls
        : parseTextoToToolCalls(content, nombresValidos),
    model: data.model ?? espacio.id,
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

export { ErrorProveedor };
