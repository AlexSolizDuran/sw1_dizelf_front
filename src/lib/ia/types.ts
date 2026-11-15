import type { ConocimientoUsado } from "./conocimiento/esquema";

export type IAProvider = "hf-space" | "openrouter" | "huggingface";

export type ModoIA = "plan" | "build";

export interface IAToolFunction {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface IAToolDef {
  type: "function";
  function: IAToolFunction;
}

export interface IAToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface IAChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: IAToolCall[];
}

export interface IAChatRequestBody {
  provider: IAProvider;
  model: string;
  messages: IAChatMessage[];
  tools: IAToolDef[];
  httpReferer?: string;
  /** Proveedor que la cadena debe saltear en esta petición. */
  evitarProveedor?: IAProvider;
}

export interface FallbackIA {
  proveedor: IAProvider;
  modelo: string;
  motivo: "timeout" | "red" | "429" | "5xx" | "respuesta-invalida";
  /** Cuántos intentos se agruparon en esta entrada. */
  veces?: number;
}

export interface IAChatResponse {
  content: string;
  toolCalls: IAToolCall[];
  model?: string;
  proveedorUsado?: IAProvider;
  modeloUsado?: string;
  fallbacks?: FallbackIA[];
  /**
   * Motivo por el que terminó la generación según el proveedor.
   * `"length"` significa que se agotó el presupuesto de salida y la llamada
   * puede haber llegado cortada.
   */
  finishReason?: string;
  /** Tokens medidos por el proveedor. Sirve para ver el presupuesto real. */
  usage?: { entrada: number; salida: number };
}

export type TurnEventKind = "inicio" | "modelo" | "tool" | "sistema" | "cierre";

export type TurnEventStatus =
  | "ok"
  | "propuesta"
  | "repetida"
  | "error"
  | "info";

/**
 * Un paso del turno tal como se muestra en la subventana de actividad.
 *
 * `TurnTrace` sigue existiendo para los chips compactos; este evento guarda el
 * detalle que esos chips no pueden mostrar (argumentos, resultado, tiempos).
 * Los textos largos llegan ya recortados: se persisten en localStorage.
 */
export interface TurnEvent {
  id: string;
  kind: TurnEventKind;
  /** -1 = preparación o cierre del turno. */
  round: number;
  at: number;
  durationMs?: number;
  title?: string;
  texto?: string;
  toolName?: string;
  args?: string;
  riesgo?: "read" | "write" | "destructive";
  status?: TurnEventStatus;
  error?: string;
  hint?: string;
  resultado?: string;
  validacion?: { errores: number; advertencias: number };
  tokens?: { entrada: number; salida: number };
  proveedor?: IAProvider;
  modelo?: string;
  finishReason?: string;
}

export interface TurnTrace {
  round: number;
  toolName: string;
  ok: boolean;
  error?: string;
  /** Detalle que explica el error (qué campo, qué rango). */
  hint?: string;
  /** Argumentos tal como llegaron cuando no se pudieron parsear. */
  argsRaw?: string;
  proposed?: boolean;
  /** Se descartó por repetir una propuesta ya vista en el turno. */
  duplicate?: boolean;
}

export interface PendingProposal {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  round: number;
  risk: "write" | "destructive";
  /**
   * IDs que creó la tool durante el preview del turno.
   *
   * La aprobación reejecuta el lote sobre la escena real y esos IDs cambian:
   * se usan para reescribir los argumentos de los pasos siguientes que los
   * referencian (por ejemplo el `wallId` de una abertura).
   */
  creados?: string[];
  /** Validación del borrador al momento de proponer la tool. */
  validacion?: {
    errores: number;
    advertencias: number;
    detalle: string[];
    faltantes?: Array<{
      roomId?: string;
      roomName: string;
      falta: "door" | "window";
    }>;
  };
}

export interface ContextoInfo {
  tokensEstimados: number;
  ventana: number;
  presupuestoEntrada: number;
  turnos: number;
  aviso?: string;
}

export interface AgentResult {
  finalContent: string;
  trace: TurnTrace[];
  pendingProposals?: PendingProposal[];
  hitlRequired?: boolean;
  contexto?: ContextoInfo;
  proveedorUsado?: IAProvider;
  modeloUsado?: string;
  fallbacks?: FallbackIA[];
  /** Tarjetas que se inyectaron como contexto en este turno. */
  conocimiento?: ConocimientoUsado;
  /**
   * El proveedor cortó al menos una respuesta por presupuesto de salida.
   * La UI lo muestra para no culpar al modelo de una llamada incompleta.
   */
  respuestaTruncada?: boolean;
}

export interface HealthResult {
  ok: boolean;
  error?: string;
}
