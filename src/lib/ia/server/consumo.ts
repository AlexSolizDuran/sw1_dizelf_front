import { after } from "next/server";
import type { NextRequest } from "next/server";
import { estimarTokens } from "../context";
import type {
  IAChatMessage,
  IAChatResponse,
  IAProvider,
  IAToolDef,
} from "../types";
import {
  COOKIE_SESION,
  baseUrlBackend,
  leerTokenSesion,
} from "./session";

/**
 * Registro de consumo del proxy de IA.
 *
 * El proveedor ya devuelve `usage` con `prompt_tokens` (que incluye system
 * prompt, historial y tools) y `completion_tokens`. Si no lo devuelve, se
 * estima con `chars / 4` sobre el payload real que se envió.
 *
 * La escritura va en `after()`: el usuario recibe la respuesta del chat sin
 * esperar el round trip al backend. Si el backend falla, se pierde esa fila y
 * se deja un warning; el chat nunca se rompe por el registro.
 */

export type OrigenConsumo = "escena" | "ayuda" | "proyecto";

export interface DatosConsumo {
  origen: OrigenConsumo;
  proveedor: IAProvider;
  modelo: string;
  tokensEntrada: number;
  tokensSalida: number;
}

const TIMEOUT_REGISTRO_MS = 3_000;
const MAX_TOKENS_POR_LLAMADA = 2_000_000;

function normalizarTokens(valor: number): number {
  if (!Number.isFinite(valor) || valor < 0) return 0;
  return Math.min(Math.trunc(valor), MAX_TOKENS_POR_LLAMADA);
}

/**
 * Calcula el delta de una llamada.
 *
 * `usage` es la fuente de verdad. Solo si viene ausente o en cero se estima:
 * algunos proveedores devuelven `usage` con ambos contadores en 0 aunque la
 * respuesta tenga contenido.
 */
export function calcularConsumo(input: {
  respuesta: IAChatResponse;
  mensajes: IAChatMessage[];
  tools: IAToolDef[];
}): Pick<DatosConsumo, "tokensEntrada" | "tokensSalida"> {
  const usage = input.respuesta.usage;
  if (usage && (usage.entrada > 0 || usage.salida > 0)) {
    return {
      tokensEntrada: normalizarTokens(usage.entrada),
      tokensSalida: normalizarTokens(usage.salida),
    };
  }

  const tokensEntrada =
    estimarTokens(JSON.stringify(input.mensajes)) +
    estimarTokens(JSON.stringify(input.tools));
  const tokensSalida =
    estimarTokens(input.respuesta.content) +
    estimarTokens(JSON.stringify(input.respuesta.toolCalls ?? []));

  return {
    tokensEntrada: normalizarTokens(tokensEntrada),
    tokensSalida: normalizarTokens(tokensSalida),
  };
}

/**
 * Encola el registro para después de enviar la respuesta al navegador.
 *
 * Se reenvía la cookie del usuario: el backend vuelve a validar el JWT y saca
 * el `usuarioId` de ahí. El cuerpo nunca incluye un id de usuario.
 */
export function registrarConsumoDiferido(
  request: NextRequest,
  datos: DatosConsumo
): void {
  const token = leerTokenSesion(request);
  if (!token) return;

  const url = `${baseUrlBackend()}/ia/consumo`;

  after(async () => {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${COOKIE_SESION}=${token}`,
        },
        body: JSON.stringify(datos),
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_REGISTRO_MS),
      });

      if (!res.ok) {
        console.warn(
          `[api/ia:consumo] backend respondió HTTP ${res.status} ` +
            `(origen=${datos.origen} proveedor=${datos.proveedor})`
        );
      }
    } catch (error: unknown) {
      console.warn(
        `[api/ia:consumo] no se pudo registrar el consumo: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  });
}
