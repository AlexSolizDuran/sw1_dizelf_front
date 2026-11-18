import {
  IA_CHAT_TIMEOUT_MS,
  OPENROUTER_API_KEYS,
  OPENROUTER_BASE_URL,
} from "../config";
import { ErrorProveedor, errorHttp, fetchConTimeout } from "../server/errors";
import { PLAN_JSON_SCHEMA } from "./esquema";
import { construirReparacion, SYSTEM_PROMPT_PLANIFICADOR } from "./prompt";

/**
 * Llamada multimodal a OpenRouter para generar el plan.
 *
 * Se hace directo y no a través de `IAChatRequestBody` porque ese contrato es
 * de texto (`content: string`) y acá el mensaje de usuario lleva texto e imagen
 * en el mismo turno.
 */

export interface ReparacionPlan {
  textoPrevio: string;
  problemas: string[];
}

export interface PeticionPlan {
  modelo: string;
  prompt: string;
  imagenDataUrl?: string;
  reparacion?: ReparacionPlan;
}

export interface RespuestaPlan {
  texto: string;
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
}

type MensajeMultimodal =
  | { role: "system"; content: string }
  | {
      role: "user";
      content:
        | string
        | Array<
            | { type: "text"; text: string }
            | { type: "image_url"; image_url: { url: string } }
          >;
    }
  | { role: "assistant"; content: string };

function construirMensajes(peticion: PeticionPlan): MensajeMultimodal[] {
  const contenidoUsuario: MensajeMultimodal = peticion.imagenDataUrl
    ? {
        role: "user",
        content: [
          { type: "text", text: peticion.prompt },
          { type: "image_url", image_url: { url: peticion.imagenDataUrl } },
        ],
      }
    : { role: "user", content: peticion.prompt };

  const mensajes: MensajeMultimodal[] = [
    { role: "system", content: SYSTEM_PROMPT_PLANIFICADOR },
    contenidoUsuario,
  ];

  if (peticion.reparacion) {
    mensajes.push(
      { role: "assistant", content: peticion.reparacion.textoPrevio },
      {
        role: "user",
        content: construirReparacion(
          peticion.reparacion.textoPrevio,
          peticion.reparacion.problemas
        ),
      }
    );
  }

  return mensajes;
}

interface Intento {
  respuesta: RespuestaPlan;
}

async function intentarUnaVez(
  peticion: PeticionPlan,
  conEsquema: boolean
): Promise<Intento> {
  const payload: Record<string, unknown> = {
    model: peticion.modelo,
    messages: construirMensajes(peticion),
    temperature: 0.2,
    // Los modelos de razonamiento (el gratuito incluido) gastan el presupuesto
    // de salida pensando y dejan `content` vacío. Se acota el razonamiento y se
    // deja margen para el JSON, que es largo.
    max_tokens: 6000,
    reasoning: { max_tokens: 1_200, exclude: true },
    stream: false,
  };

  if (conEsquema) {
    payload.response_format = {
      type: "json_schema",
      json_schema: {
        name: "plan_proyecto",
        // `strict: true` exige que todos los campos estén en `required`, y el
        // plan tiene opcionales. Zod valida la salida igual, así que se pide
        // el esquema sin strict para que funcione en todos los proveedores.
        strict: false,
        schema: PLAN_JSON_SCHEMA,
      },
    };
    payload.provider = { require_parameters: true };
  }

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
              process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
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
        choices?: Array<{ message?: { content?: string | null } }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      return {
        respuesta: {
          texto: data.choices?.[0]?.message?.content ?? "",
          modelo: data.model ?? peticion.modelo,
          tokensEntrada: data.usage?.prompt_tokens ?? 0,
          tokensSalida: data.usage?.completion_tokens ?? 0,
        },
      };
    } catch (error: unknown) {
      if (
        error instanceof ErrorProveedor &&
        error.motivo !== "429" &&
        error.motivo !== "5xx"
      ) {
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
    new ErrorProveedor(
      "4xx",
      "OpenRouter no respondió con ninguna de las claves configuradas."
    )
  );
}

/**
 * Pide el plan al modelo.
 *
 * Primero intenta con salida estructurada (`json_schema`). Si el modelo no la
 * soporta, OpenRouter responde 4xx y se reintenta una vez sin ese parámetro:
 * el system prompt ya exige JSON puro y `extraerJson` limpia el markdown.
 */
export async function llamarPlanificador(
  peticion: PeticionPlan
): Promise<RespuestaPlan> {
  if (OPENROUTER_API_KEYS.length === 0) {
    throw new ErrorProveedor(
      "4xx",
      "Falta OPENROUTER_API_KEY en el servidor. Configurala para generar proyectos con IA."
    );
  }

  try {
    const { respuesta } = await intentarUnaVez(peticion, true);
    return respuesta;
  } catch (error: unknown) {
    if (!(error instanceof ErrorProveedor) || error.motivo !== "4xx") {
      throw error;
    }
    const { respuesta } = await intentarUnaVez(peticion, false);
    return respuesta;
  }
}
