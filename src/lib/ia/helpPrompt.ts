import { HELP_ENTRIES, normalizar } from "@/lib/ayuda/knowledge";

export interface HelpProjectItem {
  /** El id del backend es string (clave del proyecto). */
  proyectoId: string;
  nombre: string;
  miRol?: string;
}

/** Catálogo cerrado: nada fuera de esta lista se ejecuta en el navegador. */
export type HelpToolName =
  | "crear_proyecto"
  | "abrir_proyecto"
  | "ir_a_proyectos"
  | "invitar_colaborador"
  | "explicar";

export const HELP_TOOL_NAMES: readonly HelpToolName[] = [
  "crear_proyecto",
  "abrir_proyecto",
  "ir_a_proyectos",
  "invitar_colaborador",
  "explicar",
];

export interface HelpAiResult {
  tool: HelpToolName;
  args: Record<string, unknown>;
  text: string;
  projectId: string | null;
  helpIds: string[];
}

const TOOL_CATALOG = [
  `- crear_proyecto {"nombre": string} — crea un proyecto nuevo. Solo si la persona lo pide como orden ("crea un proyecto llamado casa"). El nombre va sin caracteres raros.`,
  `- abrir_proyecto {"proyectoId": string} — navega al editor de un proyecto de la lista. No modifica el plano.`,
  `- ir_a_proyectos {} — navega a la pantalla Mis Proyectos.`,
  `- invitar_colaborador {"proyectoId": string, "identificador": string, "rol": "LECTOR" | "EDITOR"} — invita por correo o usuario. Solo el creador puede. Nunca inventes el identificador ni el proyecto.`,
  `- explicar {"helpIds": string[]} — responde una duda con la base de conocimiento. Es la opción por defecto.`,
].join("\n");

/**
 * Prompt del chat de ayuda. Debe devolver **un solo objeto JSON**.
 *
 * Importante: este asistente no recibe herramientas de escena ni contexto del
 * plano. Solo conoce la lista de proyectos y la base de conocimiento.
 */
export function buildHelpSystemPrompt(
  projects: HelpProjectItem[],
  pagina?: string
): string {
  const knowledge = HELP_ENTRIES.map(
    (entrada) => `- [${entrada.id}] ${entrada.titulo} — "${entrada.pregunta}"`
  ).join("\n");

  const projectList =
    projects.length > 0
      ? projects
          .map(
            (proyecto) =>
              `- ${proyecto.proyectoId}: ${proyecto.nombre}${proyecto.miRol ? ` (${proyecto.miRol})` : ""}`
          )
          .join("\n")
      : "La persona todavía no tiene proyectos.";

  return `Eres el asistente de ayuda de DIZELF, una aplicación web para diseñar planos arquitectónicos en 2D y 3D. Explicas cómo usar la aplicación y, cuando corresponde, ejecutas una acción de navegación o de gestión.

# Límite infranqueable
No puedes leer, describir ni modificar el contenido de ningún plano. No tienes herramientas de escena: si te preguntan por muros concretos, medidas de un plano o cambios en el dibujo, explica cómo hacerlo en el editor o sugiere usar el Asistente de escena. Nunca inventes datos del plano.

# Página donde está la persona
${pagina ?? "/proyectos"}

# Proyectos actuales de la persona
${projectList}

# Herramientas disponibles
${TOOL_CATALOG}

# Reglas
- Una sola herramienta por respuesta.
- Si solo preguntan cómo se hace algo, usa \`explicar\` con los ids relevantes.
- Si piden una acción ("crea…", "abre…", "invita…", "llévame…"), usa la herramienta concreta.
- Para invitar necesitas proyecto, identificador y rol. Si falta alguno, no inventes: deja el campo vacío y pide el dato en "text".
- Si un nombre de proyecto coincide de forma clara con la lista, usa su id; si es ambiguo, deja projectId en null y pide que elija.
- Nunca inventes ids de proyecto, usuarios ni ids de la base de conocimiento.
- Responde en español neutro, breve, con markdown ligero (**negrita**, \`codigo\`, listas con "-").
- "text" es la respuesta visible: no repitas el JSON ni expliques que eres un modelo.

# Base de conocimiento (id — tema)
${knowledge}

# Formato de respuesta
Responde ÚNICAMENTE con un objeto JSON válido, sin markdown ni texto fuera:
{"tool":"crear_proyecto|abrir_proyecto|ir_a_proyectos|invitar_colaborador|explicar","args":{...},"text":"respuesta breve en español","projectId":"id-o-null","helpIds":["id_de_knowledge", ...]}`;
}

function textoPorDefecto(tool: HelpToolName): string {
  switch (tool) {
    case "crear_proyecto":
      return "Creo el proyecto y abro su editor.";
    case "abrir_proyecto":
      return "Abriendo el proyecto…";
    case "ir_a_proyectos":
      return "Te llevo a Mis Proyectos.";
    case "invitar_colaborador":
      return "Preparo la invitación al proyecto.";
    default:
      return "Te ayudo con eso. Puedes preguntarme por proyectos, niveles, muebles, materiales o cualquier función de DIZELF.";
  }
}

function limpiarTexto(valor: string): string {
  return valor.replace(/\u0000/g, "").trim().slice(0, 4000);
}

/**
 * Parser tolerante: aguanta bloques ```json, texto suelto alrededor y
 * herramientas desconocidas. Nunca lanza.
 */
export function parseHelpJson(raw: string): HelpAiResult {
  const trimmed = limpiarTexto(raw ?? "");
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1].trim() : trimmed;
  const inicio = body.indexOf("{");
  const fin = body.lastIndexOf("}");
  const recorte =
    inicio === -1 || fin === -1 || fin < inicio ? body : body.slice(inicio, fin + 1);

  let parsed: unknown = null;
  try {
    parsed = JSON.parse(recorte);
  } catch {
    // JSON inválido: se devuelve el texto crudo como explicación.
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      tool: "explicar",
      args: {},
      text: trimmed || "No pude procesar la respuesta.",
      projectId: null,
      helpIds: [],
    };
  }

  const objeto = parsed as Record<string, unknown>;
  const herramienta = String(objeto.tool ?? objeto.herramienta ?? "");
  const tool = (HELP_TOOL_NAMES as readonly string[]).includes(herramienta)
    ? (herramienta as HelpToolName)
    : "explicar";
  const args =
    typeof objeto.args === "object" && objeto.args !== null && !Array.isArray(objeto.args)
      ? (objeto.args as Record<string, unknown>)
      : {};

  const idCrudo = objeto.projectId ?? args.proyectoId;
  const proyectoId =
    typeof idCrudo === "string" && idCrudo.trim() !== "" && idCrudo !== "null"
      ? idCrudo.trim()
      : typeof idCrudo === "number" && Number.isFinite(idCrudo)
        ? String(idCrudo)
        : null;

  const texto =
    typeof objeto.text === "string" && objeto.text.trim() !== ""
      ? limpiarTexto(objeto.text)
      : textoPorDefecto(tool);

  const helpIds = Array.isArray(objeto.helpIds)
    ? objeto.helpIds
        .filter((id): id is string => typeof id === "string")
        .filter((id) => HELP_ENTRIES.some((entrada) => entrada.id === id))
    : [];

  return { tool, args, text: texto, projectId: proyectoId, helpIds };
}

/* ── Intenciones deterministas ───────────────────────────────────────────────
   Las órdenes claras se resuelven sin red. Es lo que hace que "crea un
   proyecto llamado casa" funcione aunque el proveedor de IA esté caído. */

export type QuickIntent =
  | { intent: "crear_proyecto"; nombre: string | null }
  | { intent: "abrir_proyecto"; nombre: string | null }
  | { intent: "ir_a_proyectos" }
  | {
      intent: "invitar_colaborador";
      identificador: string;
      rol: "EDITOR" | "LECTOR";
      nombreProyecto: string | null;
    };

export function esPregunta(texto: string): boolean {
  if (texto.includes("?")) return true;
  const normal = normalizar(texto);
  return /^(como|que|cual|donde|cuando|por que|para que|puedo|se puede|hay|existe|tenes|tienes|sabes|me explicas|explicame)\b/.test(
    normal
  );
}

function limpiarNombre(valor: string): string | null {
  const nombre = valor
    .replace(/["“”']/g, "")
    .replace(/\b(por favor|gracias|ahora|ya)\b/gi, "")
    .replace(/[.,;:]+$/g, "")
    .trim();
  return nombre === "" ? null : nombre.slice(0, 60);
}

function nombreDeProyecto(texto: string): string | null {
  const patrones = [
    /llamad[oa]\s+([^.,;]+)/i,
    /con nombre\s+([^.,;]+)/i,
    /proyecto\s*["“]([^"”]+)["”]/i,
    /proyecto\s+(?:de\s+)?([^.,;]+)$/i,
  ];
  for (const patron of patrones) {
    const coincidencia = texto.match(patron);
    if (!coincidencia) continue;
    const nombre = limpiarNombre(coincidencia[1]);
    if (nombre) return nombre;
  }
  return null;
}

/**
 * Detecta una orden inequívoca. Devuelve `null` ante una pregunta o una frase
 * ambigua: en ese caso decide la IA (o la búsqueda local).
 */
export function detectQuickIntent(texto: string): QuickIntent | null {
  const limpio = texto.trim();
  if (limpio === "" || esPregunta(limpio)) return null;
  const normal = normalizar(limpio);

  if (/^(mis|ver mis)\s+proyectos$/.test(normal)) {
    return { intent: "ir_a_proyectos" };
  }
  if (/^(ir|ve|vete|ll[eé]vame|volver|volvamos|and[aá])\s+a\s+(mis\s+)?proyectos\b/.test(normal)) {
    return { intent: "ir_a_proyectos" };
  }

  if (/^(crea|crear|creame|crea me|genera|haz|hacer|arm[aá]|empezar)\b/.test(normal) && normal.includes("proyecto")) {
    return { intent: "crear_proyecto", nombre: nombreDeProyecto(limpio) };
  }

  if (/^(abre|abrir|abreme|abrime|entra|entrar|ingresa|ingresar)\b/.test(normal) && normal.includes("proyecto")) {
    return { intent: "abrir_proyecto", nombre: nombreDeProyecto(limpio) };
  }

  const invitacion = limpio.match(
    /^(?:invita|invitar|invitame|agrega|agregar)\s+(?:a\s+)?([^\s,]+)(?:\s+(?:al|en el)\s+proyecto\s+([^,]+?))?(?:\s+como\s+.*)?$/i
  );
  if (invitacion) {
    const identificador = limpiarNombre(invitacion[1]);
    if (identificador) {
      const nombreProyecto = invitacion[2] ? limpiarNombre(invitacion[2]) : null;
      const rol: "EDITOR" | "LECTOR" = /lector|solo lectura|mirar|ver\b/.test(normal)
        ? "LECTOR"
        : /editor|editar|escribir/.test(normal)
          ? "EDITOR"
          : "LECTOR";
      return {
        intent: "invitar_colaborador",
        identificador,
        rol,
        nombreProyecto,
      };
    }
  }

  return null;
}
