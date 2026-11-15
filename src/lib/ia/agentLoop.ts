"use client";

import { useScene } from "@pascal-app/core";
import { executeTool, type ToolContext } from "./executor";
import { construirContextoInfo, estimarTokens } from "./context";
import { abrirPreview, cerrarPreview } from "./preview";
import {
  resumirValidacion,
  validarEscena,
  type AberturaFaltante,
} from "./validacion-escena";
import { perfilDeProveedor } from "./providers";
import { solicitarChat } from "./proxy";
import { pedirConocimiento } from "./conocimiento/cliente";
import { construirBloqueConocimiento } from "./conocimiento/contexto";
import {
  construirConsulta,
  construirDiagnostico,
} from "./conocimiento/diagnostico";
import { decidirConocimiento } from "./conocimiento/intencion";
import type { ConocimientoUsado } from "./conocimiento/esquema";
import {
  TOOL_NAMES,
  esToolDeLectura,
  riesgoDeTool,
  toolsParaSolicitud,
} from "./tool-calls";
import {
  IA_MAX_NUDGES,
  IA_MAX_TOOL_ROUNDS,
  IA_PROVIDER_LABEL,
  IA_TURN_DEADLINE_MS,
} from "./config";
import type {
  AgentResult,
  ContextoInfo,
  FallbackIA,
  IAChatMessage,
  IAProvider,
  IAToolCall,
  ModoIA,
  PendingProposal,
  TurnEvent,
  TurnEventStatus,
  TurnTrace,
} from "./types";

export interface AgentLoopParams {
  provider: IAProvider;
  model: string;
  systemPrompt: string;
  userMessage: string;
  history: IAChatMessage[];
  modo: ModoIA;
  puedeEditar: boolean;
  ctx: ToolContext;
  onTurn?: (turn: TurnTrace) => void;
  /** Detalle completo de cada paso, para la subventana de actividad. */
  onEvent?: (event: TurnEvent) => void;
  signal?: AbortSignal;
}

/**
 * Resultado de parsear los argumentos de una tool.
 *
 * La distinción importa: un JSON roto no es un modelo que se equivocó de
 * campo, es una respuesta cortada. Antes ambos casos terminaban en `{}` y Zod
 * respondía "falta kind", que ocultaba la causa real.
 */
type ArgsParseados =
  | { ok: true; valor: unknown }
  | { ok: false; crudo: string };

function parseArgs(args: string | undefined): ArgsParseados {
  if (args === undefined || args === null || args === "") {
    return { ok: true, valor: {} };
  }
  try {
    return { ok: true, valor: JSON.parse(args) as unknown };
  } catch {
    return { ok: false, crudo: args };
  }
}

/** Recorte para trazas: una línea, sin repetir el JSON entero. */
function recortarTexto(texto: string, maximo = 240): string {
  const limpio = texto.replace(/\s+/g, " ").trim();
  return limpio.length <= maximo ? limpio : `${limpio.slice(0, maximo - 1)}…`;
}

/** JSON legible y acotado: la actividad se guarda en localStorage. */
function recortarJson(valor: unknown, maximo = 1000): string {
  let texto: string;
  try {
    texto = JSON.stringify(valor, null, 2) ?? String(valor);
  } catch {
    texto = String(valor);
  }
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
}

/** Los dos códigos donde conviene reintentar con argumentos más chicos. */
function esErrorDeArgumentos(codigo: string | undefined): boolean {
  return codigo === "INVALID_ARGS" || codigo === "ARGUMENTS_TRUNCATED";
}

function serializarEstable(valor: unknown): string {
  if (valor === null || typeof valor !== "object") {
    return JSON.stringify(valor) ?? "null";
  }
  if (Array.isArray(valor)) {
    return `[${valor.map(serializarEstable).join(",")}]`;
  }
  const objeto = valor as Record<string, unknown>;
  return `{${Object.keys(objeto)
    .sort()
    .map((clave) => `${JSON.stringify(clave)}:${serializarEstable(objeto[clave])}`)
    .join(",")}}`;
}

function resultadoToolOk(data: unknown, warnings?: string[]): string {
  const base =
    typeof data === "object" && data !== null
      ? (data as Record<string, unknown>)
      : { data };
  return JSON.stringify({
    ok: true,
    ...base,
    ...(warnings && warnings.length > 0 ? { warnings } : {}),
  });
}

function resultadoToolError(result: {
  error: { code: string; message: string; hint?: string; details?: unknown };
}): string {
  return JSON.stringify({ ok: false, error: result.error });
}

/**
 * Recupera tool calls que algunos modelos débiles escriben como texto en vez
 * de usar el campo nativo `tool_calls`.
 *
 * Los 7B suelen responder con bloques JSON "casi válidos": comentarios `//`,
 * comas finales, un wrapper `{"tool_calls":[...]}` o `{"tool":"...","args":{}}`.
 * `JSON.parse` estricto los descartaba y el turno terminaba en narración, así
 * que acá se limpia y se toleran esas variantes.
 */
export function extractToolCallsFromContent(content: string): IAToolCall[] {
  if (!content || typeof content !== "string") return [];

  const limpiado = quitarComasFinales(quitarComentarios(content));

  const llamadas: IAToolCall[] = [];
  const vistas = new Set<string>();
  let contador = 0;

  const agregar = (lista: IAToolCall[]) => {
    for (const llamada of lista) {
      const clave = `${llamada.function.name}|${llamada.function.arguments}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      llamadas.push({
        ...llamada,
        id: `fallback-${Date.now()}-${contador++}`,
      });
    }
  };

  // Bloques de código y etiquetas <tool_call> primero: suelen traer la llamada
  // limpia, sin la prosa alrededor.
  const bloques = [
    ...[...limpiado.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map(
      (match) => match[1]
    ),
    ...[...limpiado.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi)].map(
      (match) => match[1]
    ),
  ];
  for (const bloque of bloques) agregar(parsearLlamadas(bloque));
  if (llamadas.length > 0) return llamadas;

  const texto = limpiado.replace(/<\/?tool_call>/gi, " ");

  // El texto completo puede ser un objeto o un arreglo de llamadas.
  agregar(parsearLlamadas(texto));
  if (llamadas.length > 0) return llamadas;

  // Último recurso: cada objeto balanceado del texto.
  for (const objeto of objetosBalanceados(texto)) {
    agregar(parsearLlamadas(objeto));
  }
  return llamadas;
}

function quitarComentarios(texto: string): string {
  let salida = "";
  let enCadena = false;
  let escape = false;

  for (let i = 0; i < texto.length; i++) {
    const caracter = texto[i];
    const siguiente = texto[i + 1];

    if (enCadena) {
      salida += caracter;
      if (escape) escape = false;
      else if (caracter === "\\") escape = true;
      else if (caracter === '"') enCadena = false;
      continue;
    }

    if (caracter === '"') {
      enCadena = true;
      salida += caracter;
      continue;
    }

    if (caracter === "/" && siguiente === "/") {
      i += 2;
      while (i < texto.length && texto[i] !== "\n") i++;
      salida += "\n";
      continue;
    }

    if (caracter === "/" && siguiente === "*") {
      i += 2;
      while (
        i < texto.length &&
        !(texto[i] === "*" && texto[i + 1] === "/")
      ) {
        i++;
      }
      i++;
      salida += " ";
      continue;
    }

    salida += caracter;
  }

  return salida;
}

function quitarComasFinales(texto: string): string {
  let salida = "";
  let enCadena = false;
  let escape = false;

  for (let i = 0; i < texto.length; i++) {
    const caracter = texto[i];

    if (enCadena) {
      salida += caracter;
      if (escape) escape = false;
      else if (caracter === "\\") escape = true;
      else if (caracter === '"') enCadena = false;
      continue;
    }

    if (caracter === '"') {
      enCadena = true;
      salida += caracter;
      continue;
    }

    if (caracter === ",") {
      let j = i + 1;
      while (j < texto.length && /\s/.test(texto[j])) j++;
      if (texto[j] === "}" || texto[j] === "]") continue;
    }

    salida += caracter;
  }

  return salida;
}

function objetosBalanceados(texto: string): string[] {
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

function parsearLlamadas(texto: string): IAToolCall[] {
  const limpio = texto.trim();
  if (!limpio) return [];
  try {
    return llamadasDeObjeto(JSON.parse(limpio));
  } catch {
    return [];
  }
}

function llamadasDeObjeto(valor: unknown): IAToolCall[] {
  if (Array.isArray(valor)) {
    return valor.flatMap((item) => llamadasDeObjeto(item));
  }
  if (valor === null || typeof valor !== "object") return [];

  const objeto = valor as Record<string, unknown>;
  const wrapper = objeto.tool_calls ?? objeto.toolCalls;
  if (Array.isArray(wrapper)) {
    return wrapper.flatMap((item) => llamadasDeObjeto(item));
  }

  const funcion =
    objeto.function !== null &&
    typeof objeto.function === "object" &&
    !Array.isArray(objeto.function)
      ? (objeto.function as Record<string, unknown>)
      : null;

  const nombreCrudo = objeto.name ?? objeto.tool ?? funcion?.name;
  const nombre = typeof nombreCrudo === "string" ? nombreCrudo.trim() : "";
  if (!nombre || !TOOL_NAMES.has(nombre)) return [];

  const argsCrudos =
    objeto.arguments ??
    objeto.args ??
    objeto.parameters ??
    objeto.input ??
    funcion?.arguments ??
    funcion?.args ??
    funcion?.parameters;

  let args: Record<string, unknown> = {};
  if (typeof argsCrudos === "string") {
    const limpio = quitarComasFinales(quitarComentarios(argsCrudos)).trim();
    if (limpio) {
      try {
        const interna = JSON.parse(limpio) as unknown;
        if (
          interna !== null &&
          typeof interna === "object" &&
          !Array.isArray(interna)
        ) {
          args = interna as Record<string, unknown>;
        }
      } catch {
        // se deja args vacío para que la validación dé un error claro
      }
    }
  } else if (
    argsCrudos !== null &&
    typeof argsCrudos === "object" &&
    !Array.isArray(argsCrudos)
  ) {
    args = argsCrudos as Record<string, unknown>;
  } else {
    // Llamada "plana": {"name":"add_opening","kind":"door","roomName":"Sala"}.
    const excluir = new Set([
      "name",
      "tool",
      "type",
      "id",
      "function",
      "arguments",
      "args",
      "parameters",
      "input",
      "tool_calls",
      "toolCalls",
    ]);
    for (const [clave, item] of Object.entries(objeto)) {
      if (!excluir.has(clave)) args[clave] = item;
    }
  }

  return [
    {
      id: `fallback-${Date.now()}-0`,
      type: "function",
      function: { name: nombre, arguments: JSON.stringify(args) },
    },
  ];
}

/**
 * ¿El texto contiene una tool call escrita como texto y sin ejecutar?
 *
 * Es una señal estructural (JSON de llamada), no una interpretación de la
 * intención del pedido: un resumen que menciona `level_default` no debe
 * confundirse con una llamada pendiente.
 */
function pareceLlamadaPendiente(texto: string): boolean {
  if (/<tool_call>/i.test(texto)) return true;
  if (/"tool_calls"\s*:/i.test(texto)) return true;
  return /"name"\s*:/i.test(texto) && /"arguments"\s*:/i.test(texto);
}

/** Lista compacta de aberturas faltantes, con el nombre del ambiente. */
function listaFaltantes(
  faltantes: AberturaFaltante[],
  limite = 8
): string {
  const items = faltantes
    .slice(0, limite)
    .map(
      (falta) =>
        `${falta.falta === "door" ? "puerta" : "ventana"} en "${falta.roomName}"`
    );
  if (faltantes.length > limite) {
    items.push(`y ${faltantes.length - limite} más`);
  }
  return items.join(", ");
}

interface NudgeOpciones {
  /** El proveedor cortó la respuesta anterior por presupuesto de salida. */
  truncada?: boolean;
  /** Hubo un error de argumentos: conviene mostrar la forma exacta. */
  ejemplo?: boolean;
}

/**
 * Nudge corto y accionable.
 *
 * La versión anterior repetía la lista completa de faltantes y una parrafada
 * de instrucciones en cada intento. Con un 7B eso suma contexto justo cuando
 * el presupuesto es el problema: ahora dice qué falta, por qué se cortó (si se
 * cortó) y, cuando hubo error de argumentos, la forma exacta de la llamada.
 */
function mensajeNudge(
  faltantes: AberturaFaltante[],
  opciones: NudgeOpciones = {}
): string {
  const partes = ["En esta ronda no llamaste a ninguna herramienta."];
  if (opciones.truncada) {
    partes.push(
      "La respuesta anterior se cortó por límite de longitud: mandá menos llamadas por respuesta."
    );
  }
  const lista = listaFaltantes(faltantes, 6);
  if (lista) partes.push(`Faltan: ${lista}.`);
  if (opciones.ejemplo) {
    partes.push(
      'Forma exacta, sin texto alrededor: {"name":"add_opening","arguments":{"roomName":"Dormitorio 1","kind":"door","width":0.9,"height":2.1}}'
    );
  } else if (lista) {
    partes.push(
      "Usá roomName del resumen y agregalas en la misma respuesta; no inventes IDs."
    );
  }
  partes.push("Si ya está todo, respondé en una frase, sin JSON.");
  return partes.join(" ");
}

/** Agrupa reintentos idénticos para no mostrar doce chips del mismo 429. */
function resumirFallbacks(fallbacks: FallbackIA[]): FallbackIA[] {
  const agrupados = new Map<string, FallbackIA>();
  for (const fallback of fallbacks) {
    const clave = `${fallback.proveedor}|${fallback.modelo}|${fallback.motivo}`;
    const previo = agrupados.get(clave);
    if (previo) previo.veces = (previo.veces ?? 1) + 1;
    else agrupados.set(clave, { ...fallback, veces: 1 });
  }
  return [...agrupados.values()];
}


/** Recorta pares de historial hasta entrar en el presupuesto del proveedor. */
function recortarHistorial(
  messages: IAChatMessage[],
  presupuesto: number
): IAChatMessage[] {
  let lista = messages;
  while (
    estimarTokens(JSON.stringify(lista)) > presupuesto &&
    lista.length > 3
  ) {
    const quitar = lista[1]?.role === "user" ? 2 : 1;
    lista = [lista[0], ...lista.slice(1 + quitar)];
  }
  return lista;
}

/**
 * Cierre determinístico cuando el modelo insiste con la misma llamada fallida.
 *
 * El texto lo escribe la app y no el modelo: un 7B contesta "mis disculpas,
 * vamos de nuevo" y no dice qué falló ni qué hacer.
 */
function mensajeDeCorte(motivo: {
  code: string;
  message: string;
  hint?: string;
}): string {
  if (motivo.code === "READ_ONLY") {
    return "No puedo modificar el plano en modo Plan. Pasá a Build y pedímelo de nuevo.";
  }
  return `${motivo.message}${motivo.hint ? ` ${motivo.hint}` : ""} Frené el turno para no repetir el mismo intento.`;
}

export async function runAgentLoop(params: AgentLoopParams): Promise<AgentResult> {
  const tools = toolsParaSolicitud(
    params.modo,
    params.puedeEditar,
    params.userMessage
  );
  const editable = params.puedeEditar && params.modo === "build";
  const perfil = perfilDeProveedor(params.provider);
  const presupuesto = Math.max(
    512,
    perfil.contextWindow - perfil.maxOutput
  );

  // El conocimiento se recupera antes de llamar al modelo: entra como contexto,
  // no como tool. En Plan siempre; en Build solo si hay pregunta o pedido mixto.
  const decision = decidirConocimiento({
    modo: params.modo,
    puedeEditar: params.puedeEditar,
    texto: params.userMessage,
  });
  let conocimiento: ConocimientoUsado | undefined;
  const secciones: string[] = [];

  if (decision.usar) {
    const diagnostico = construirDiagnostico(params.ctx.levelId);
    if (diagnostico.texto) {
      secciones.push(
        `HECHOS DEL PLANO (calculados por la app; no los recalcules)\n${diagnostico.texto}`
      );
    }

    const consulta = construirConsulta(diagnostico, params.userMessage);
    const recuperado = await pedirConocimiento(
      consulta,
      decision.limite,
      params.signal
    );
    if (recuperado && recuperado.tarjetas.length > 0) {
      const bloque = construirBloqueConocimiento(recuperado.tarjetas);
      if (bloque) secciones.push(bloque);
      conocimiento = recuperado;
    }
  }

  const systemPrompt =
    secciones.length > 0
      ? `${params.systemPrompt}\n\n${secciones.join("\n\n")}`
      : params.systemPrompt;

  let messages: IAChatMessage[] = recortarHistorial(
    [
      { role: "system", content: systemPrompt },
      ...params.history,
      { role: "user", content: params.userMessage },
    ],
    presupuesto
  );
  const contexto: ContextoInfo = construirContextoInfo({
    systemPrompt: params.systemPrompt,
    messages,
    tools,
    ventana: perfil.contextWindow,
    maxOutput: perfil.maxOutput,
    turnos: params.history.filter((m) => m.role === "user").length,
  });

  const trace: TurnTrace[] = [];
  const propuestas: PendingProposal[] = [];
  const vistas = new Set<string>();
  let previewAbierto = false;

  // Actividad del turno para la subventana: un evento por paso, con el detalle
  // que los chips no muestran. No reemplaza a `onTurn`.
  let eventoSeq = 0;
  const emitir = (evento: Omit<TurnEvent, "id" | "at">) => {
    params.onEvent?.({
      ...evento,
      id: `ev-${Date.now()}-${eventoSeq++}`,
      at: Date.now(),
    });
  };
  const emitirTool = (evento: {
    round: number;
    toolName: string;
    status: TurnEventStatus;
    args?: string;
    riesgo?: "read" | "write" | "destructive";
    error?: string;
    hint?: string;
    resultado?: string;
    validacion?: { errores: number; advertencias: number };
    durationMs?: number;
  }) => emitir({ kind: "tool", ...evento });

  emitir({
    kind: "inicio",
    round: -1,
    title: "Preparación",
    texto: [
      editable ? "Build: puede proponer cambios" : "Solo lectura: no escribe",
      `${tools.length} tools ofrecidas`,
      `${contexto.turnos} ${contexto.turnos === 1 ? "turno" : "turnos"} de historial`,
      `≈${contexto.tokensEstimados} tokens de entrada`,
      ...(conocimiento && conocimiento.tarjetas.length > 0
        ? [`${conocimiento.tarjetas.length} tarjetas de conocimiento`]
        : []),
    ].join(" · "),
  });

  /**
   * Freno de reintentos.
   *
   * Un 7B en CPU no lee el error: se disculpa y repite la misma llamada, a
   * veces con un decimal cambiado, hasta gastar las rondas. Si la misma tool
   * falla dos veces por lo mismo, el turno se cierra con el motivo real en vez
   * de devolver la última disculpa del modelo.
   */
  const freno: {
    motivo: { code: string; message: string; hint?: string } | null;
    clave: string;
    veces: number;
  } = { motivo: null, clave: "", veces: 0 };

  /** Último error de tool: alimenta el nudge y el mensaje de cierre. */
  let ultimoCodigoError: string | undefined;

  const anotarFallo = (
    nombre: string,
    error: { code?: string; message: string; hint?: string }
  ) => {
    ultimoCodigoError = error.code ?? "TOOL_FAILED";
    const clave = `${nombre}:${error.code ?? error.message}`;
    if (clave === freno.clave) freno.veces += 1;
    else {
      freno.clave = clave;
      freno.veces = 1;
    }
    if (freno.veces >= 2) {
      freno.motivo = {
        code: error.code ?? "TOOL_FAILED",
        message: error.message,
        ...(error.hint ? { hint: error.hint } : {}),
      };
    }
  };

  const soltarFreno = () => {
    freno.clave = "";
    freno.veces = 0;
  };

  /**
   * Validación del borrador, sin que el modelo tenga que pedirla.
   * Se acota al nivel activo (o a toda la escena si no hay uno) para no pagar
   * la detección de espacios de todos los niveles en cada escritura.
   */
  const validacionDelBorrador = () => {
    const store = useScene.getState();
    const base = {
      nodes: store.nodes,
      rootNodeIds: store.rootNodeIds,
      installedPlugins: store.installedPlugins,
    };
    const reporte =
      validarEscena({ ...base, levelId: params.ctx.levelId }) ??
      validarEscena(base);
    return reporte
      ? resumirValidacion(reporte)
      : { errores: 0, advertencias: 0, detalle: [], faltantes: [] };
  };
  let ultimoContenido = "";
  let nudgesHechos = 0;
  let faltantes: AberturaFaltante[] = [];
  let deadlineVencido = false;
  const inicioTurno = Date.now();
  let proveedorUsado: IAProvider | undefined;
  let modeloUsado: string | undefined;
  const fallbacks: FallbackIA[] = [];
  let ultimoError: unknown = null;
  /** Al menos una respuesta vino con `finish_reason: "length"`. */
  let respuestaTruncada = false;
  /**
   * Proveedor que la cadena debe saltear. Se fija una sola vez, cuando el
   * modelo insiste con el mismo error de argumentos: en vez de cerrar el turno
   * se le da una ronda al respaldo.
   */
  let evitarProveedor: IAProvider | undefined;

  const maxRondas = Math.max(1, IA_MAX_TOOL_ROUNDS);

  try {
    for (let round = 0; round < maxRondas; round++) {
      if (Date.now() - inicioTurno >= IA_TURN_DEADLINE_MS) {
        deadlineVencido = true;
        emitir({
          kind: "sistema",
          round,
          title: "Se agotó el tiempo del turno",
          texto: `Límite de ${Math.round(IA_TURN_DEADLINE_MS / 1000)} s alcanzado antes de terminar.`,
        });
        break;
      }
      const inicioRonda = Date.now();
      const respuesta = await solicitarChat(
        {
          provider: params.provider,
          model: params.model,
          messages,
          tools,
          ...(evitarProveedor ? { evitarProveedor } : {}),
        },
        { signal: params.signal }
      );
      const duracionRonda = Date.now() - inicioRonda;

      proveedorUsado = respuesta.proveedorUsado ?? params.provider;
      modeloUsado = respuesta.modeloUsado ?? respuesta.model;
      if (respuesta.fallbacks && respuesta.fallbacks.length > 0) {
        fallbacks.push(...respuesta.fallbacks);
      }
      ultimoContenido = respuesta.content ?? "";

      // `length` no es lo mismo que "el modelo no quiso": se cortó. Se anota
      // para que el nudge lo diga y la UI no lo atribuya a una falla del modelo.
      const truncadaEstaRonda = respuesta.finishReason === "length";
      if (truncadaEstaRonda) respuestaTruncada = true;

      let toolCalls = respuesta.toolCalls ?? [];
      // Si el modelo copia objetos de datos y los convierte en llamadas
      // ("Patio", "Dormitorio 1"), se descartan antes de gastar una ronda. Si no
      // queda ninguna, el turno cierra con el texto en vez de repetir errores.
      toolCalls = toolCalls.filter((call) =>
        TOOL_NAMES.has(call.function?.name ?? "")
      );
      if (toolCalls.length === 0) {
        toolCalls = extractToolCallsFromContent(ultimoContenido);
        // La llamada escrita como texto no debe volver al historial: el modelo
        // la copiaría en el turno siguiente en vez de ejecutar la tool.
        if (toolCalls.length > 0) ultimoContenido = "";
      }

      if (respuesta.fallbacks && respuesta.fallbacks.length > 0) {
        emitir({
          kind: "sistema",
          round,
          title: "Respaldo del proveedor",
          texto: respuesta.fallbacks
            .map(
              (fallback) =>
                `${IA_PROVIDER_LABEL[fallback.proveedor]} (${fallback.motivo})`
            )
            .join(", "),
        });
      }

      emitir({
        kind: "modelo",
        round,
        durationMs: duracionRonda,
        title:
          toolCalls.length > 0
            ? `Llamó ${toolCalls.length} ${toolCalls.length === 1 ? "herramienta" : "herramientas"}`
            : "Respondió sin tools",
        ...(ultimoContenido.trim() !== ""
          ? { texto: recortarTexto(ultimoContenido, 600) }
          : {}),
        proveedor: respuesta.proveedorUsado ?? params.provider,
        ...(respuesta.modeloUsado ?? respuesta.model
          ? { modelo: respuesta.modeloUsado ?? respuesta.model }
          : {}),
        ...(respuesta.finishReason ? { finishReason: respuesta.finishReason } : {}),
        ...(respuesta.usage ? { tokens: respuesta.usage } : {}),
      });

      if (toolCalls.length === 0) {
        // El modelo decidió responder con texto: esa es la respuesta final.
        // La app no interpreta el pedido para exigir una tool; solo insiste
        // cuando hay una llamada escrita como texto que quedó sin ejecutar.
        const pendiente = pareceLlamadaPendiente(ultimoContenido);
        const extraPorArgumentos = esErrorDeArgumentos(ultimoCodigoError) ? 1 : 0;
        const puedeNudge =
          nudgesHechos < Math.max(0, IA_MAX_NUDGES) + extraPorArgumentos;
        if (puedeNudge && !deadlineVencido && pendiente) {
          nudgesHechos += 1;
          const nudge = mensajeNudge(faltantes, {
            truncada: truncadaEstaRonda,
            ejemplo: esErrorDeArgumentos(ultimoCodigoError),
          });
          emitir({
            kind: "sistema",
            round,
            title: "La app insiste (nudge)",
            texto: nudge,
          });
          messages.push({ role: "assistant", content: ultimoContenido });
          messages.push({ role: "user", content: nudge });
          continue;
        }

        return {
          finalContent:
            ultimoContenido.trim() ||
            "El modelo no devolvió una respuesta. Probá de nuevo o cambiá de modelo.",
          trace,
          ...(propuestas.length > 0
            ? { pendingProposals: propuestas, hitlRequired: true }
            : {}),
          contexto,
          proveedorUsado,
          modeloUsado,
          ...(conocimiento ? { conocimiento } : {}),
          ...(fallbacks.length > 0
            ? { fallbacks: resumirFallbacks(fallbacks) }
            : {}),
          ...(respuestaTruncada ? { respuestaTruncada: true } : {}),
        };
      }

      messages.push({
        role: "assistant",
        content: ultimoContenido,
        tool_calls: toolCalls,
      });

      for (const call of toolCalls) {
        const nombre = call.function?.name ?? "";
        const ofrecida = tools.some((def) => def.function.name === nombre);

        if (!ofrecida) {
          const error = `La herramienta "${nombre}" no está disponible en este turno.`;
          trace.push({ round, toolName: nombre, ok: false, error });
          emitirTool({
            round,
            toolName: nombre,
            status: "error",
            error,
            ...(call.function?.arguments
              ? { args: recortarTexto(call.function.arguments, 1000) }
              : {}),
          });
          params.onTurn?.(trace[trace.length - 1]);
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: nombre,
            content: JSON.stringify({ ok: false, error: { code: "TOOL_NOT_OFFERED", message: error } }),
          });
          continue;
        }

        if (!esToolDeLectura(nombre)) {
          if (!editable) {
            const error =
              "El turno es de solo lectura: no se pueden proponer cambios.";
            trace.push({ round, toolName: nombre, ok: false, error });
            emitirTool({
              round,
              toolName: nombre,
              status: "error",
              error: "Solo lectura: el turno no puede proponer cambios.",
              ...(call.function?.arguments
                ? { args: recortarTexto(call.function.arguments, 1000) }
                : {}),
            });
            params.onTurn?.(trace[trace.length - 1]);
            anotarFallo(nombre, { code: "READ_ONLY", message: error });
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: nombre,
              content: JSON.stringify({ ok: false, error: { code: "READ_ONLY", message: error } }),
            });
            continue;
          }

          const parseo = parseArgs(call.function?.arguments);
          if (!parseo.ok) {
            const error = `La llamada a ${nombre} llegó incompleta: el JSON de argumentos está cortado.`;
            const hint =
              "El proveedor agotó el presupuesto de salida. Repetí la llamada con menos argumentos o menos llamadas por respuesta.";
            trace.push({
              round,
              toolName: nombre,
              ok: false,
              error,
              hint,
              argsRaw: recortarTexto(parseo.crudo),
            });
            emitirTool({
              round,
              toolName: nombre,
              status: "error",
              error,
              hint,
              args: recortarTexto(parseo.crudo, 1000),
            });
            params.onTurn?.(trace[trace.length - 1]);
            anotarFallo(nombre, { code: "ARGUMENTS_TRUNCATED", message: error, hint });
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: nombre,
              content: JSON.stringify({
                ok: false,
                error: { code: "ARGUMENTS_TRUNCATED", message: error, hint },
              }),
            });
            continue;
          }
          const args = parseo.valor;
          const clave = `${nombre}:${serializarEstable(args)}`;
          if (vistas.has(clave)) {
            trace.push({
              round,
              toolName: nombre,
              ok: true,
              proposed: true,
              duplicate: true,
            });
            emitirTool({
              round,
              toolName: nombre,
              status: "repetida",
              args: recortarJson(args),
              riesgo: riesgoDeTool(nombre) ?? undefined,
            });
            params.onTurn?.(trace[trace.length - 1]);
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: nombre,
              content: JSON.stringify({
                ok: true,
                proposed: true,
                duplicate: true,
                tool: nombre,
                nota: "Ya registrada en este turno; no la repitas.",
              }),
            });
            continue;
          }

          // La escritura corre sobre el borrador del turno: el modelo ve el
          // resultado real y puede leerlo o corregirlo antes de cerrar.
          if (!previewAbierto) {
            abrirPreview();
            previewAbierto = true;
          }

          const previos = new Set(Object.keys(useScene.getState().nodes));
          const inicioTool = Date.now();
          const resultado = await executeTool(nombre, args, params.ctx);

          if (!resultado.ok) {
            trace.push({
              round,
              toolName: nombre,
              ok: false,
              error: resultado.error.message,
              ...(resultado.error.hint ? { hint: resultado.error.hint } : {}),
              // Con argumentos inválidos interesa ver qué mandó, no solo qué
              // faltó: es lo que permite distinguir un enum mal escrito de una
              // llamada vacía.
              ...(resultado.error.code === "INVALID_ARGS"
                ? { argsRaw: recortarTexto(serializarEstable(args)) }
                : {}),
            });
            emitirTool({
              round,
              toolName: nombre,
              status: "error",
              args: recortarJson(args),
              riesgo: riesgoDeTool(nombre) ?? undefined,
              error: resultado.error.message,
              ...(resultado.error.hint ? { hint: resultado.error.hint } : {}),
              durationMs: Date.now() - inicioTool,
            });
            params.onTurn?.(trace[trace.length - 1]);
            anotarFallo(nombre, resultado.error);
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: nombre,
              content: JSON.stringify({
                ok: false,
                preview: true,
                error: resultado.error,
              }),
            });
            continue;
          }

          soltarFreno();
          // Se registra recién acá: una llamada fallida debe poder repetirse
          // con los mismos argumentos sin quedar marcada como duplicada.
          vistas.add(clave);
          const validacion = validacionDelBorrador();
          faltantes = validacion.faltantes;
          const creados = Object.keys(useScene.getState().nodes).filter(
            (id) => !previos.has(id)
          );
          propuestas.push({
            id: call.id,
            toolName: nombre,
            args:
              typeof args === "object" && args !== null
                ? (args as Record<string, unknown>)
                : {},
            round,
            risk:
              (riesgoDeTool(nombre) as "write" | "destructive" | null) ?? "write",
            creados,
            validacion,
          });
          trace.push({ round, toolName: nombre, ok: true, proposed: true });
          emitirTool({
            round,
            toolName: nombre,
            status: "propuesta",
            args: recortarJson(args),
            riesgo: riesgoDeTool(nombre) ?? undefined,
            resultado: recortarJson(resultado.data),
            validacion: {
              errores: validacion.errores,
              advertencias: validacion.advertencias,
            },
            durationMs: Date.now() - inicioTool,
          });
          params.onTurn?.(trace[trace.length - 1]);
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: nombre,
            content: JSON.stringify({
              ok: true,
              proposed: true,
              preview: true,
              ...(typeof resultado.data === "object" && resultado.data !== null
                ? (resultado.data as Record<string, unknown>)
                : { data: resultado.data }),
              ...(resultado.warnings && resultado.warnings.length > 0
                ? { warnings: resultado.warnings }
                : {}),
              validacion,
              nota: "Aplicado en el borrador del turno. La persona aprueba o descarta el lote completo: podés leer el estado con las tools de lectura y corregir antes de cerrar.",
            }),
          });
          continue;
        }

        try {
          const parseoLectura = parseArgs(call.function?.arguments);
          if (!parseoLectura.ok) {
            const error = `La llamada a ${nombre} llegó incompleta: el JSON de argumentos está cortado.`;
            const hint =
              "El proveedor agotó el presupuesto de salida. Repetí la llamada con menos argumentos.";
            trace.push({
              round,
              toolName: nombre,
              ok: false,
              error,
              hint,
              argsRaw: recortarTexto(parseoLectura.crudo),
            });
            emitirTool({
              round,
              toolName: nombre,
              status: "error",
              error,
              hint,
              args: recortarTexto(parseoLectura.crudo, 1000),
            });
            params.onTurn?.(trace[trace.length - 1]);
            anotarFallo(nombre, { code: "ARGUMENTS_TRUNCATED", message: error, hint });
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: nombre,
              content: JSON.stringify({
                ok: false,
                error: { code: "ARGUMENTS_TRUNCATED", message: error, hint },
              }),
            });
            continue;
          }
          const inicioTool = Date.now();
          const result = await executeTool(nombre, parseoLectura.valor, params.ctx);
          if (result.ok) {
            soltarFreno();
            trace.push({ round, toolName: nombre, ok: true });
            emitirTool({
              round,
              toolName: nombre,
              status: "ok",
              args: recortarJson(parseoLectura.valor),
              riesgo: "read",
              resultado: recortarJson(result.data),
              durationMs: Date.now() - inicioTool,
            });
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: nombre,
              content: resultadoToolOk(result.data, result.warnings),
            });
          } else {
            trace.push({
              round,
              toolName: nombre,
              ok: false,
              error: result.error.message,
            });
            emitirTool({
              round,
              toolName: nombre,
              status: "error",
              args: recortarJson(parseoLectura.valor),
              riesgo: "read",
              error: result.error.message,
              ...(result.error.hint ? { hint: result.error.hint } : {}),
              durationMs: Date.now() - inicioTool,
            });
            anotarFallo(nombre, result.error);
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              name: nombre,
              content: resultadoToolError(result),
            });
          }
        } catch (error: unknown) {
          ultimoError = error;
          const mensaje = error instanceof Error ? error.message : String(error);
          trace.push({ round, toolName: nombre, ok: false, error: mensaje });
          emitirTool({
            round,
            toolName: nombre,
            status: "error",
            error: mensaje,
          });
          anotarFallo(nombre, { code: "TOOL_ERROR", message: mensaje });
          messages.push({
            role: "tool",
            tool_call_id: call.id,
            name: nombre,
            content: JSON.stringify({
              ok: false,
              error: { code: "TOOL_ERROR", message: mensaje },
            }),
          });
        }
        params.onTurn?.(trace[trace.length - 1]);
      }

      // El modelo insiste con la misma llamada fallida. Si el error es de
      // argumentos, todavía queda una carta: probar el respaldo con el mismo
      // historial (el error ya viajó al modelo, solo cambia quién responde).
      // Si el respaldo también falla, se corta con el motivo real.
      if (freno.motivo) {
        const quedanRondas = round + 1 < maxRondas;
        if (
          quedanRondas &&
          esErrorDeArgumentos(freno.motivo.code) &&
          evitarProveedor === undefined
        ) {
          evitarProveedor = proveedorUsado ?? params.provider;
          freno.motivo = null;
          freno.clave = "";
          freno.veces = 0;
          messages.push({
            role: "user",
            content:
              "La última llamada falló por argumentos inválidos. Repetila con los campos exactos del esquema; si no cabe, mandá menos llamadas por respuesta.",
          });
          continue;
        }
        emitir({
          kind: "sistema",
          round,
          title: "Corte por reintentos",
          texto: mensajeDeCorte(freno.motivo),
        });
        break;
      }
    }
  } finally {
    // Si el turno se aborta o falla, el borrador se descarta igual.
    if (previewAbierto) cerrarPreview();
  }

  return {
    finalContent: freno.motivo
      ? mensajeDeCorte(freno.motivo)
      : propuestas.length > 0
        ? ultimoContenido.trim() || "Propuesta lista para revisión."
        : deadlineVencido
          ? "El turno superó el tiempo máximo antes de terminar la propuesta. Probá con un pedido más corto o revisá el proveedor."
          : ultimoError
            ? "El asistente superó el límite de rondas de herramientas."
            : "Se alcanzó el límite de rondas y el modelo no entregó una respuesta final. Reformulá el pedido.",
    trace,
    ...(propuestas.length > 0
      ? { pendingProposals: propuestas, hitlRequired: true }
      : {}),
    contexto,
    proveedorUsado,
    modeloUsado,
    ...(conocimiento ? { conocimiento } : {}),
    ...(fallbacks.length > 0
      ? { fallbacks: resumirFallbacks(fallbacks) }
      : {}),
    ...(respuestaTruncada ? { respuestaTruncada: true } : {}),
  };
}

/**
 * Reescribe, en los argumentos de una propuesta, los IDs que otra propuesta
 * creó antes.
 *
 * El turno corre sobre un borrador: los IDs que el modelo vio (y usó para
 * encadenar, por ejemplo el `wallId` de una abertura) desaparecen cuando el
 * borrador se descarta. Al aprobar se reejecuta el lote, así que hay que
 * traducirlos a los IDs nuevos.
 */
function reescribirReferencias(
  valor: unknown,
  mapa: Map<string, string>
): unknown {
  if (mapa.size === 0) return valor;
  if (typeof valor === "string") return mapa.get(valor) ?? valor;
  if (Array.isArray(valor)) {
    return valor.map((item) => reescribirReferencias(item, mapa));
  }
  if (valor !== null && typeof valor === "object") {
    const salida: Record<string, unknown> = {};
    for (const [clave, item] of Object.entries(valor)) {
      salida[clave] = reescribirReferencias(item, mapa);
    }
    return salida;
  }
  return valor;
}

/** Empareja los IDs del preview con los que creó esta reejecución. */
function recordarIdsCreados(
  propuesta: PendingProposal,
  previos: Set<string>,
  mapa: Map<string, string>
): void {
  const esperados = propuesta.creados ?? [];
  if (esperados.length === 0) return;
  const nuevos = Object.keys(useScene.getState().nodes).filter(
    (id) => !previos.has(id)
  );
  // Misma tool, mismos argumentos: mismo orden de creación. Si no coincide la
  // cantidad, no se adivina y el paso siguiente recibe los IDs tal cual.
  if (nuevos.length !== esperados.length) return;
  esperados.forEach((viejo, indice) => {
    const nuevo = nuevos[indice];
    if (nuevo && nuevo !== viejo) mapa.set(viejo, nuevo);
  });
}

const retenidoEnHistorial = (antes: unknown[], despues: unknown[]): number => {
  for (let inicio = 0; inicio < antes.length; inicio += 1) {
    const cantidad = antes.length - inicio;
    if (cantidad > despues.length) continue;
    let iguales = true;
    for (let i = 0; i < cantidad; i += 1) {
      if (antes[inicio + i] !== despues[i]) {
        iguales = false;
        break;
      }
    }
    if (iguales) return cantidad;
  }
  return 0;
};

/**
 * Junta el lote aprobado en un solo paso de undo.
 *
 * Mismo criterio que `runAsSingleSceneHistoryStep`, pero aplicado después de
 * un lote async (cada tool espera a la anterior). Con Yjs el historial es un
 * `UndoManager` y su `setState` es un no-op: ahí el agrupado lo resuelve la
 * ventana de captura del propio manager, así que esto no rompe nada.
 */
function fusionarPasosDeAprobacion(antes: unknown[]): void {
  try {
    const temporal = useScene.temporal;
    const despues = temporal.getState().pastStates as unknown[];
    if (!Array.isArray(despues)) return;
    const retenidos = retenidoEnHistorial(antes, despues);
    const agregados = despues.length - retenidos;
    if (agregados <= 1) return;
    const primero = despues[retenidos];
    if (primero === undefined) return;
    temporal.setState({
      pastStates: [...despues.slice(0, retenidos), primero],
    } as never);
  } catch {
    // El agrupado del undo es best-effort: aplicar los cambios es lo importante.
  }
}

export async function aplicarPropuestas(
  pendientes: PendingProposal[],
  ctx: ToolContext
): Promise<{ trace: TurnTrace[]; applied: number; errors: string[] }> {
  const trace: TurnTrace[] = [];
  const errors: string[] = [];
  const mapaIds = new Map<string, string>();
  const historialAntes = [
    ...((useScene.temporal.getState().pastStates ?? []) as unknown[]),
  ];
  let applied = 0;

  for (const propuesta of pendientes) {
    const args = reescribirReferencias(propuesta.args, mapaIds);
    const previos = new Set(Object.keys(useScene.getState().nodes));
    const result = await executeTool(
      propuesta.toolName,
      args as Record<string, unknown>,
      ctx
    );
    if (result.ok) {
      applied += 1;
      recordarIdsCreados(propuesta, previos, mapaIds);
      trace.push({
        round: propuesta.round,
        toolName: propuesta.toolName,
        ok: true,
      });
    } else {
      errors.push(result.error.message);
      trace.push({
        round: propuesta.round,
        toolName: propuesta.toolName,
        ok: false,
        error: result.error.message,
      });
    }
  }

  fusionarPasosDeAprobacion(historialAntes);

  return { trace, applied, errors };
}
