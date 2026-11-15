import { ALL_TOOLS, TOOL_DEFINITIONS } from "./tools";
import type { IAToolDef, ModoIA } from "./types";

type ToolRisk = "read" | "write" | "destructive";

const RIESGO_POR_TOOL = new Map<string, ToolRisk>(
  ALL_TOOLS.map((tool) => [tool.name, tool.risk as ToolRisk])
);

const DEFINICIONES = TOOL_DEFINITIONS as unknown as IAToolDef[];

export function riesgoDeTool(nombre: string): ToolRisk | null {
  return RIESGO_POR_TOOL.get(nombre) ?? null;
}

export function esToolDeLectura(nombre: string): boolean {
  return RIESGO_POR_TOOL.get(nombre) === "read";
}

/**
 * Grupos de tools.
 *
 * El Space gratuito corre el modelo en CPU: el prefill ronda los 24 tokens/s,
 * así que mandar las 24 definiciones (≈5k tokens) cuesta más de tres minutos
 * en el primer turno. Cada grupo lleva como máximo diez tools y, entre todos,
 * cubren las 24: la conversación puede usar cualquier tool, solo que no todas
 * viajan en la misma petición.
 */
export type GrupoTools =
  | "plano"
  | "construccion"
  | "estructuras"
  | "edicion"
  | "catalogo"
  | "navegacion";

export const GRUPOS: Record<GrupoTools, readonly string[]> = {
  plano: [
    "get_scene_summary",
    "get_level",
    "get_node",
    "search_catalog",
    "search_materials",
    "validate_scene",
  ],
  construccion: [
    "get_scene_summary",
    "get_level",
    "create_level",
    "create_walls",
    "create_room",
    "create_rooms",
    "add_opening",
    "update_node",
    "delete_node",
    "validate_scene",
  ],
  estructuras: [
    "get_scene_summary",
    "get_level",
    "create_column",
    "create_stair",
    "create_roof",
    "create_fence",
    "create_shelf",
    "update_node",
    "delete_node",
    "validate_scene",
  ],
  edicion: [
    "get_scene_summary",
    "get_level",
    "get_node",
    "update_node",
    "delete_node",
    "duplicate_node",
    "duplicate_level",
    "paint_surface",
    "focus_node",
    "validate_scene",
  ],
  catalogo: [
    "get_scene_summary",
    "get_level",
    "search_catalog",
    "search_materials",
    "place_item",
    "paint_surface",
    "update_node",
    "validate_scene",
  ],
  navegacion: [
    "get_scene_summary",
    "get_level",
    "get_node",
    "select_level",
    "focus_node",
    "validate_scene",
  ],
};

/** El orden importa: gana la primera regla que coincida. */
const REGLAS: ReadonlyArray<{ grupo: GrupoTools; patron: RegExp }> = [
  {
    grupo: "estructuras",
    patron:
      /\b(columna|columnas|viga|vigas|escalera|escaleras|peldaño|peldaños|techo|techos|cubierta|cubiertas|cerco|cercos|cerca|cercas|estante|estantes|repisa|repisas|roof|stair|column|fence|shelf)/i,
  },
  {
    grupo: "catalogo",
    patron:
      /\b(mueble|muebles|amuebl\w*|silla|sillas|mesa|mesas|sofá|sofa|sofás|sofas|cama|camas|lámpara|lampara|lámparas|lamparas|material|materiales|catálogo|catalogo|pintura|pintar|pinta|color|colores)/i,
  },
  {
    grupo: "edicion",
    patron:
      /\b(borra|borrar|elimina|eliminar|duplica|duplicar|copia|copiar|mueve|mover|cambia|cambiar|edita|editar|renombra|renombrar|actualiza|actualizar|modifica|modificar)/i,
  },
  {
    grupo: "navegacion",
    patron:
      /\b(navega|navegar|ir a|ve a|vamos a|enfoca|enfocar|selecciona|seleccionar|muéstrame|muestrame|vista|zoom)/i,
  },
];

/** Elige el grupo según lo que pide la persona en este turno. */
export function grupoPorTexto(texto: string): GrupoTools {
  const normalizado = (texto ?? "").trim();
  if (normalizado.length === 0) return "construccion";
  for (const regla of REGLAS) {
    if (regla.patron.test(normalizado)) return regla.grupo;
  }
  return "construccion";
}

/**
 * Tools que se ofrecen al modelo según el modo.
 *
 * En `plan` (o sin permiso de edición) solo viajan las de lectura: el candado
 * real está en el loop, esto es la primera barrera.
 */
export function toolsParaModo(modo: ModoIA, puedeEditar: boolean): IAToolDef[] {
  if (!puedeEditar || modo === "plan") {
    return toolsPorNombres(GRUPOS.plano);
  }
  return DEFINICIONES;
}

/**
 * Subconjunto acotado para una petición real. Nunca supera diez tools.
 */
export function toolsParaSolicitud(
  modo: ModoIA,
  puedeEditar: boolean,
  texto: string
): IAToolDef[] {
  if (!puedeEditar || modo === "plan") {
    return toolsPorNombres(GRUPOS.plano);
  }
  return toolsPorNombres(GRUPOS[grupoPorTexto(texto)]);
}

export function toolsPorNombres(nombres: readonly string[]): IAToolDef[] {
  const set = new Set(nombres);
  return DEFINICIONES.filter((def) => set.has(def.function.name));
}

export const TOOL_NAMES: ReadonlySet<string> = new Set(
  ALL_TOOLS.map((tool) => tool.name)
);
