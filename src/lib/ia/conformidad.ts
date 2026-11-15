import { extractToolCallsFromContent } from "./agentLoop";
import { IA_CHAT_TIMEOUT_MS } from "./config";
import { solicitarChat } from "./proxy";
import { toolsPorNombres } from "./tool-calls";
import type { IAProvider, IAToolCall } from "./types";

/**
 * Prueba de conformidad.
 *
 * Es una sonda del cliente, no un endpoint: usa el mismo proxy que el chat y
 * las definiciones reales de herramientas. Se cachea 10 minutos por
 * proveedor + modelo para no pagar la prueba en cada apertura del panel.
 */

export type EstadoConformidad = "verde" | "amarillo" | "rojo";

export interface ResultadoConformidad {
  estado: EstadoConformidad;
  proveedor: IAProvider;
  modelo: string;
  detalle: string;
  probadoEn: string;
}

export const PROMPT_CONFORMIDAD =
  "Usá la herramienta get_scene_summary para leer el resumen del plano. No respondas con texto: llamá a la herramienta.";

export const CONFORMIDAD_TTL_MS = 10 * 60 * 1000;

const PREFIJO_CACHE = "dizelf.ia.conformidad:";
const memoria = new Map<string, ResultadoConformidad>();
const HERRAMIENTAS_SONDA = ["get_scene_summary", "get_level"] as const;

function clave(proveedor: IAProvider, modelo: string): string {
  return `${PREFIJO_CACHE}${proveedor}:${modelo}`;
}

function esResultado(valor: unknown): valor is ResultadoConformidad {
  if (typeof valor !== "object" || valor === null) return false;
  const crudo = valor as Record<string, unknown>;
  return (
    (crudo.estado === "verde" ||
      crudo.estado === "amarillo" ||
      crudo.estado === "rojo") &&
    typeof crudo.proveedor === "string" &&
    typeof crudo.modelo === "string" &&
    typeof crudo.detalle === "string" &&
    typeof crudo.probadoEn === "string"
  );
}

function vigente(resultado: ResultadoConformidad, ahora: number): boolean {
  const fecha = Date.parse(resultado.probadoEn);
  if (Number.isNaN(fecha)) return false;
  return ahora - fecha < CONFORMIDAD_TTL_MS;
}

export function leerConformidadCache(
  proveedor: IAProvider,
  modelo: string,
  ahora = Date.now()
): ResultadoConformidad | null {
  const llave = clave(proveedor, modelo);
  const enMemoria = memoria.get(llave);
  if (enMemoria && vigente(enMemoria, ahora)) return enMemoria;
  memoria.delete(llave);

  if (typeof window === "undefined") return null;
  try {
    const crudo = window.sessionStorage.getItem(llave);
    if (!crudo) return null;
    const parsed: unknown = JSON.parse(crudo);
    if (!esResultado(parsed) || !vigente(parsed, ahora)) {
      window.sessionStorage.removeItem(llave);
      return null;
    }
    memoria.set(llave, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export function guardarConformidadCache(resultado: ResultadoConformidad): void {
  const llave = clave(resultado.proveedor, resultado.modelo);
  memoria.set(llave, resultado);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(llave, JSON.stringify(resultado));
  } catch {
    // sin sessionStorage la caché en memoria alcanza
  }
}

export function invalidarConformidad(proveedor: IAProvider, modelo: string): void {
  const llave = clave(proveedor, modelo);
  memoria.delete(llave);
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(llave);
  } catch {
    // nada que invalidar
  }
}

function nombresValidos(calls: IAToolCall[]): string[] {
  return calls
    .map((call) => call.function?.name?.trim() ?? "")
    .filter((nombre) => nombre !== "");
}

export function clasificarConformidad(input: {
  proveedor: IAProvider;
  modelo: string;
  toolCalls: IAToolCall[];
  content: string;
  probadoEn?: string;
}): ResultadoConformidad {
  const probadoEn = input.probadoEn ?? new Date().toISOString();
  const nativos = nombresValidos(input.toolCalls);
  if (nativos.length > 0) {
    return {
      estado: "verde",
      proveedor: input.proveedor,
      modelo: input.modelo,
      detalle: `tool_calls nativos: ${nativos.join(", ")}.`,
      probadoEn,
    };
  }

  const recuperadas = nombresValidos(
    extractToolCallsFromContent(input.content ?? "")
  );
  if (recuperadas.length > 0) {
    return {
      estado: "amarillo",
      proveedor: input.proveedor,
      modelo: input.modelo,
      detalle: `Sin tool_calls nativos; el parser de texto recuperó: ${recuperadas.join(", ")}.`,
      probadoEn,
    };
  }

  return {
    estado: "rojo",
    proveedor: input.proveedor,
    modelo: input.modelo,
    detalle: "No produjo ninguna herramienta válida; sirve solo para consulta.",
    probadoEn,
  };
}

export interface OpcionesConformidad {
  proveedor: IAProvider;
  modelo: string;
  timeoutMs?: number;
  forzar?: boolean;
  ahora?: number;
  signal?: AbortSignal;
}

/** Nunca lanza: un fallo de red o del proveedor se clasifica como rojo. */
export async function probarConformidad(
  opciones: OpcionesConformidad
): Promise<ResultadoConformidad> {
  const ahora = opciones.ahora ?? Date.now();
  if (!opciones.forzar) {
    const cacheado = leerConformidadCache(opciones.proveedor, opciones.modelo, ahora);
    if (cacheado) return cacheado;
  }

  let resultado: ResultadoConformidad;
  try {
    const respuesta = await solicitarChat(
      {
        provider: opciones.proveedor,
        model: opciones.modelo,
        messages: [
          {
            role: "system",
            content:
              "Sos el asistente de DIZELF, un editor de planos arquitectónicos. Cuando la petición pida una acción, llamá a la herramienta disponible en vez de describirla.",
          },
          { role: "user", content: PROMPT_CONFORMIDAD },
        ],
        tools: toolsPorNombres(HERRAMIENTAS_SONDA),
      },
      {
        timeoutMs: opciones.timeoutMs ?? IA_CHAT_TIMEOUT_MS,
        signal: opciones.signal,
      }
    );

    resultado = clasificarConformidad({
      proveedor: opciones.proveedor,
      modelo: opciones.modelo,
      toolCalls: respuesta.toolCalls,
      content: respuesta.content,
      probadoEn: new Date(ahora).toISOString(),
    });
  } catch (error: unknown) {
    resultado = {
      estado: "rojo",
      proveedor: opciones.proveedor,
      modelo: opciones.modelo,
      detalle:
        error instanceof Error
          ? `La sonda falló: ${error.message}`
          : "La sonda falló.",
      probadoEn: new Date(ahora).toISOString(),
    };
  }

  guardarConformidadCache(resultado);
  return resultado;
}

export function formatearConformidad(
  resultado: ResultadoConformidad | null
): { etiqueta: string; detalle: string; estado: EstadoConformidad | null } {
  if (!resultado) {
    return {
      etiqueta: "Sin probar",
      detalle: "Todavía no se probó si este modelo puede usar herramientas.",
      estado: null,
    };
  }
  if (resultado.estado === "verde") {
    return {
      etiqueta: "Edita con tools",
      detalle: resultado.detalle,
      estado: "verde",
    };
  }
  if (resultado.estado === "amarillo") {
    return {
      etiqueta: "Tools por texto",
      detalle: resultado.detalle,
      estado: "amarillo",
    };
  }
  return {
    etiqueta: "Solo consulta",
    detalle: resultado.detalle,
    estado: "rojo",
  };
}
