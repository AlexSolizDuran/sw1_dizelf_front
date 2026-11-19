import {
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
  type AnyNode,
  nodeRegistry,
} from "@pascal-app/core"
import { fieldLabel } from "./labels"

export type FieldKind = "number" | "text" | "bool" | "enum" | "color" | "metric"

export type Path = (string | number)[]

export type FieldSpec = {
  /** Dot-free path into the node. Absent for derived read-only fields. */
  path?: Path
  label: string
  kind: FieldKind
  unit?: string
  min?: number
  max?: number
  step?: number
  precision?: number
  /** Display multiplier (radians → degrees). */
  scale?: number
  /** Write multiplier, the inverse of `scale`. */
  inverse?: number
  options?: readonly string[]
  /** Valores sugeridos para campos editables: se puede elegir o escribir otro. */
  suggestions?: readonly string[]
  /** Resolve enum options from the kind's Zod schema. */
  fromSchema?: boolean
  /**
   * Valor a mostrar cuando el nodo no trae el campo (`.optional()` sin default).
   * Es el mismo que usa el visor para dibujar, así el panel no miente ni
   * muestra una fila vacía.
   */
  fallback?: number | string
  /** Dynamic range around the current value when no min/max is declared. */
  span?: number
  metric?: (node: AnyNode) => number | string
  visibleIf?: (node: AnyNode) => boolean
}

export type FieldGroup = {
  id: string
  label: string
  fields: FieldSpec[]
}

const num = (
  path: Path,
  label: string,
  extra: Partial<FieldSpec> = {},
): FieldSpec => ({ path, label, kind: "number", step: 0.01, precision: 3, ...extra })

const txt = (path: Path, label: string, extra: Partial<FieldSpec> = {}): FieldSpec => ({
  path,
  label,
  kind: "text",
  ...extra,
})

const bool = (path: Path, label: string): FieldSpec => ({ path, label, kind: "bool" })

const metric = (
  label: string,
  fn: (node: AnyNode) => number | string,
  unit?: string,
): FieldSpec => ({ label, kind: "metric", metric: fn, unit })

/** Sugerencias compartidas: el campo sigue aceptando cualquier valor. */
const ESCALA_01 = ["0", "0.25", "0.5", "0.75", "1"] as const
const PALETA_COLORES = [
  "#ffffff",
  "#f2f2f2",
  "#d9d9d9",
  "#9e9e9e",
  "#616161",
  "#000000",
  "#c8a97e",
  "#8b5e3c",
  "#b0bec5",
  "#90a4ae",
] as const
const ANCHOS_VENTANA = ["0.6", "0.8", "0.9", "1.2", "1.5", "1.8", "2.4"] as const
const ALTOS_VENTANA = ["0.6", "0.9", "1.2", "1.5", "1.8", "2.1"] as const
const ANTEPECHOS = ["0", "0.45", "0.9", "1.1", "1.5"] as const
const VUELOS = ["0", "0.05", "0.1", "0.2"] as const

/* ── Lectura / escritura por path ──────────────────────────────────────── */

export function readPath(source: unknown, path: Path): unknown {
  let cursor: unknown = source
  for (const key of path) {
    if (cursor == null) return undefined
    cursor = (cursor as Record<string | number, unknown>)[key]
  }
  return cursor
}

/** Clona `node` aplicando `value` en `path`. Devuelve el subárbol raíz. */
function writePath(node: unknown, path: Path, value: unknown): unknown {
  if (path.length === 0) return value
  const [head, ...rest] = path
  if (typeof head === "number") {
    const arr = Array.isArray(node) ? [...(node as unknown[])] : []
    arr[head] = writePath(arr[head], rest, value)
    return arr
  }
  const obj =
    node && typeof node === "object" ? { ...(node as Record<string, unknown>) } : {}
  obj[head] = writePath(obj[head], rest, value)
  return obj
}

/** `{ position: [1, 2, 3] }`-style patch for a single field write. */
export function patchFor(node: AnyNode, spec: FieldSpec, rawValue: unknown) {
  if (!spec.path || spec.path.length === 0) return {}
  const value = spec.inverse && typeof rawValue === "number" ? rawValue * spec.inverse : rawValue
  const next = writePath(node, spec.path, value) as Record<string, unknown>
  const root = spec.path[0]
  return { [root]: next[root] }
}

/* ── Métricas derivadas ───────────────────────────────────────────────── */

type Pt = readonly [number, number]

function pointsOf(node: AnyNode): Pt[] {
  const poly = (node as { polygon?: unknown }).polygon
  if (Array.isArray(poly)) return poly as Pt[]
  const inner = (poly as { points?: unknown } | undefined)?.points
  return Array.isArray(inner) ? (inner as Pt[]) : []
}

export function polygonArea(points: Pt[]): number {
  if (points.length < 3) return 0
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.abs(sum) / 2
}

export function polygonPerimeter(points: Pt[]): number {
  if (points.length < 2) return 0
  let sum = 0
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]
    const [x2, y2] = points[(i + 1) % points.length]
    sum += Math.hypot(x2 - x1, y2 - y1)
  }
  return sum
}

function spanLength(node: AnyNode): number | null {
  const n = node as { start?: Pt; end?: Pt }
  if (!Array.isArray(n.start) || !Array.isArray(n.end)) return null
  return Math.hypot(n.end[0] - n.start[0], n.end[1] - n.start[1])
}

const areaMetric = metric("Superficie", (n) => polygonArea(pointsOf(n)), "m²")
const perimeterMetric = metric("Perímetro", (n) => polygonPerimeter(pointsOf(n)), "m")
const spanMetric = metric("Largo (cuerda)", (n) => spanLength(n) ?? 0, "m")

/* ── Zod: clasificación e introspección genérica ──────────────────────── */

type ZodDef = Record<string, unknown>

/** Envolturas que hay que atravesar para llegar al tipo real. */
const ZOD_WRAPPERS = new Set([
  "optional",
  "nullable",
  "default",
  "prefault",
  "catch",
  "readonly",
  "nonoptional",
  "pipe",
  "branded",
])

function unwrapZod(zod: unknown): { zod: ZodDef; def: ZodDef } | null {
  let cursor = zod as ZodDef | null
  for (let depth = 0; depth < 8 && cursor; depth++) {
    const def = (cursor._zod as { def?: ZodDef } | undefined)?.def
    if (!def) return null
    const type = def.type
    if (typeof type === "string" && ZOD_WRAPPERS.has(type)) {
      cursor = (def.innerType ?? def.in ?? def.out ?? null) as ZodDef | null
      continue
    }
    return { zod: cursor, def }
  }
  return null
}

function zodTypeName(zod: unknown): string | null {
  const unwrapped = unwrapZod(zod)
  if (unwrapped) return typeof unwrapped.def.type === "string" ? unwrapped.def.type : null
  const legacy = (zod as { _def?: { typeName?: string } } | null)?._def?.typeName
  return legacy ? legacy.replace(/^Zod/, "").toLowerCase() : null
}

export function unwrapZodEnum(zod: unknown): string[] | null {
  const unwrapped = unwrapZod(zod)
  if (!unwrapped || unwrapped.def.type !== "enum") {
    const legacy = (zod as { options?: unknown[]; _def?: { values?: unknown[] } } | null)
    if (Array.isArray(legacy?.options)) return legacy.options.map(String)
    if (Array.isArray(legacy?._def?.values)) return legacy._def.values.map(String)
    return null
  }
  const entries = unwrapped.def.entries
  if (entries && typeof entries === "object") return Object.values(entries).map(String)
  const values = unwrapped.def.values
  if (Array.isArray(values)) return values.map(String)
  return null
}

/**
 * Forma de un `ZodObject` (Zod v4). Devuelve null si el valor no es un objeto
 * Zod: los campos de un schema NO son propiedades del objeto Zod, así que
 * `schema.material.preset` es `undefined` aunque el path exista.
 */
function zodObjectShape(zod: unknown): Record<string, unknown> | null {
  const unwrapped = unwrapZod(zod)
  if (!unwrapped) return null
  const def = unwrapped.def
  if (def.type !== "object") return null
  const shape = def.shape ?? (unwrapped.zod as { shape?: unknown }).shape
  return shape && typeof shape === "object" ? (shape as Record<string, unknown>) : null
}

/** Schema del tipo de nodo, tal cual lo registra el paquete. */
function schemaShapeFor(kind: string): Record<string, unknown> | null {
  try {
    const def = nodeRegistry.get(kind)
    const shape = (def as { schema?: { shape?: Record<string, unknown> } })?.schema?.shape
    return shape ?? null
  } catch {
    return null
  }
}

/**
 * Resuelve un path contra el schema atravesando objetos anidados.
 *
 * Recorría el schema con `readPath`, que solo funciona con objetos planos: por
 * eso `material.preset`, `material.properties.color` y compañía quedaban sin
 * opciones y el select se dibujaba como un texto muerto.
 */
function zodAtPath(kind: string, path: Path): unknown {
  const shape = schemaShapeFor(kind)
  if (!shape) return undefined

  let cursor: unknown = shape
  for (const key of path) {
    if (typeof key !== "string") return undefined
    const record =
      zodObjectShape(cursor) ??
      (cursor && typeof cursor === "object" ? (cursor as Record<string, unknown>) : null)
    if (!record) return undefined
    cursor = record[key]
    if (cursor === undefined) return undefined
  }
  return cursor
}

export function enumOptionsFor(kind: string, path: Path): string[] | null {
  return unwrapZodEnum(zodAtPath(kind, path))
}

/** Default declarado en el schema (`.default(...)`), si lo hay. */
function zodDefaultValue(zod: unknown): unknown {
  let cursor = zod as Record<string, unknown> | null
  for (let depth = 0; depth < 8 && cursor; depth++) {
    const def = (cursor._zod as { def?: Record<string, unknown> } | undefined)?.def
    if (!def) return undefined
    if (def.type === "default" || def.type === "prefault") {
      const valor = def.defaultValue
      return typeof valor === "function" ? (valor as () => unknown)() : valor
    }
    cursor = (def.innerType ?? def.in ?? null) as Record<string, unknown> | null
  }
  return undefined
}

/** Valor por defecto que aplica el visor cuando el nodo no tiene el campo. */
export function schemaDefaultFor(kind: string, path: Path): unknown {
  return zodDefaultValue(zodAtPath(kind, path))
}

/* ── Grupos comunes ───────────────────────────────────────────────────── */

const identityGroup = (): FieldGroup => ({
  id: "identidad",
  label: "Identidad",
  fields: [txt(["name"], "Nombre"), bool(["visible"], "Visible")],
})

const materialGroup = (): FieldGroup => ({
  id: "apariencia",
  label: "Apariencia",
  fields: [
    {
      path: ["material", "preset"],
      label: "Acabado",
      kind: "enum",
      options: [] as string[],
      fromSchema: true,
      // Sin material asignado el nodo no tiene preset: el visor usa el suyo.
      fallback: "custom",
    },
    txt(["material", "properties", "color"], "Color", {
      kind: "color",
      suggestions: PALETA_COLORES,
    }),
    num(["material", "properties", "roughness"], "Rugosidad", {
      min: 0,
      max: 1,
      step: 0.01,
      precision: 2,
      suggestions: ESCALA_01,
    }),
    num(["material", "properties", "metalness"], "Metalicidad", {
      min: 0,
      max: 1,
      step: 0.01,
      precision: 2,
      suggestions: ESCALA_01,
    }),
    num(["material", "properties", "opacity"], "Opacidad", {
      min: 0,
      max: 1,
      step: 0.01,
      precision: 2,
      suggestions: ESCALA_01,
    }),
  ],
})

const idMetric = metric("ID", (n) => n.id)

/* ── Catálogo por tipo de nodo ────────────────────────────────────────── */

type Catalog = FieldGroup[]

const CATALOG: Record<string, Catalog> = {
  wall: [
    {
      id: "dimensiones",
      label: "Geometría",
      fields: [
        // `thickness` y `height` son opcionales en el schema: sin fallback la
        // fila quedaba en "—" y parecía que el muro no tenía esos valores.
        num(["thickness"], "Espesor", {
          unit: "m",
          min: 0.05,
          max: 0.6,
          fallback: DEFAULT_WALL_THICKNESS,
        }),
        num(["height"], "Altura", {
          unit: "m",
          min: 0.1,
          max: 8,
          step: 0.05,
          fallback: DEFAULT_WALL_HEIGHT,
        }),
        num(["curveOffset"], "Curvatura", { unit: "m", min: -3, max: 3, step: 0.05, fallback: 0 }),
        spanMetric,
        num(["start", 0], "Inicio X", { unit: "m" }),
        num(["start", 1], "Inicio Z", { unit: "m" }),
        num(["end", 0], "Fin X", { unit: "m" }),
        num(["end", 1], "Fin Z", { unit: "m" }),
      ],
    },
    materialGroup(),
  ],
  slab: [
    {
      id: "geometria",
      label: "Geometría",
      fields: [num(["elevation"], "Elevación", { unit: "m", min: -2, max: 4 }), areaMetric, perimeterMetric],
    },
    {
      id: "flags",
      label: "Opciones",
      fields: [bool(["autoFromWalls"], "Auto desde muros")],
    },
    materialGroup(),
  ],
  ceiling: [
    {
      id: "geometria",
      label: "Geometría",
      fields: [num(["height"], "Altura", { unit: "m", min: 0, max: 8, step: 0.05 }), areaMetric],
    },
    {
      id: "flags",
      label: "Opciones",
      fields: [bool(["autoFromWalls"], "Auto desde muros")],
    },
    materialGroup(),
  ],
  zone: [
    {
      id: "geometria",
      label: "Geometría",
      fields: [
        areaMetric,
        perimeterMetric,
        metric("Muros de borde", (n) => {
          const ids = (n as unknown as { boundaryWallIds?: unknown[] }).boundaryWallIds
          return Array.isArray(ids) ? ids.length : 0
        }),
      ],
    },
    {
      id: "apariencia",
      label: "Apariencia",
      fields: [
        txt(["color"], "Color", { kind: "color", suggestions: PALETA_COLORES }),
      ],
    },
  ],
  column: [
    {
      id: "dimensiones",
      label: "Dimensiones",
      fields: [
        num(["height"], "Altura", { unit: "m", min: 0.1, max: 20, step: 0.05 }),
        num(["width"], "Ancho", { unit: "m", min: 0.02, max: 3 }),
        num(["depth"], "Profundidad", { unit: "m", min: 0.02, max: 3 }),
        num(["radius"], "Radio", { unit: "m", min: 0.01, max: 3 }),
        num(["baseHeight"], "Altura de base", { unit: "m", min: 0, max: 3 }),
        num(["capitalHeight"], "Altura de capitel", { unit: "m", min: 0, max: 3 }),
      ],
    },
    {
      id: "estilo",
      label: "Estilo",
      fields: [
        { path: ["style"], label: "Estilo", kind: "enum", fromSchema: true },
        { path: ["crossSection"], label: "Sección", kind: "enum", fromSchema: true },
      ],
    },
    materialGroup(),
  ],
  item: [
    {
      id: "dimensiones",
      label: "Dimensiones",
      fields: [
        num(["asset", "dimensions", 0], "Ancho", { unit: "m" }),
        num(["asset", "dimensions", 1], "Alto", { unit: "m" }),
        num(["asset", "dimensions", 2], "Profundidad", { unit: "m" }),
        num(["scale", 0], "Escala X", { step: 0.01, precision: 3, min: 0.01, max: 20 }),
        num(["scale", 1], "Escala Y", { step: 0.01, precision: 3, min: 0.01, max: 20 }),
        num(["scale", 2], "Escala Z", { step: 0.01, precision: 3, min: 0.01, max: 20 }),
      ],
    },
    {
      id: "estilo",
      label: "Estilo",
      fields: [
        { path: ["side"], label: "Cara", kind: "enum", fromSchema: true },
      ],
    },
  ],
  door: [
    {
      id: "dimensiones",
      label: "Dimensiones",
      fields: [
        num(["width"], "Ancho", { unit: "m", min: 0.2, max: 6 }),
        num(["height"], "Altura", { unit: "m", min: 0.2, max: 6, step: 0.05 }),
        num(["swingAngle"], "Apertura", { unit: "°", min: 0, max: 180, step: 1, precision: 0 }),
      ],
    },
    {
      id: "estilo",
      label: "Estilo",
      fields: [
        { path: ["doorType"], label: "Tipo", kind: "enum", fromSchema: true },
        { path: ["swingDirection"], label: "Sentido", kind: "enum", fromSchema: true },
        { path: ["side"], label: "Cara", kind: "enum", fromSchema: true },
        bool(["panicBar"], "Barra antipánico"),
      ],
    },
    materialGroup(),
  ],
  window: [
    {
      id: "dimensiones",
      label: "Dimensiones",
      fields: [
        num(["width"], "Ancho", {
          unit: "m",
          min: 0.1,
          max: 8,
          suggestions: ANCHOS_VENTANA,
        }),
        num(["height"], "Altura", {
          unit: "m",
          min: 0.1,
          max: 8,
          step: 0.05,
          suggestions: ALTOS_VENTANA,
        }),
        // `WindowNode.sill` es un BOOLEANO (mostrar o no el antepecho), no una
        // medida: como número la fila salía vacía y escribirla corrompía el nodo.
        bool(["sill"], "Antepecho"),
        num(["sillThickness"], "Espesor antepecho", {
          unit: "m",
          min: 0.01,
          max: 0.3,
          step: 0.01,
          suggestions: ANTEPECHOS,
        }),
        // El prototipo declaraba `sillHeight`, que no existe en WindowNode:
        // el campo quedaba en blanco y no se podía escribir. Lo correcto es
        // `sillDepth`, cuánto vuela la ventana por delante de la pared.
        num(["sillDepth"], "Vuelo", {
          unit: "m",
          min: 0,
          max: 2,
          step: 0.05,
          suggestions: VUELOS,
        }),
      ],
    },
    {
      id: "estilo",
      label: "Estilo",
      fields: [
        { path: ["windowType"], label: "Tipo", kind: "enum", fromSchema: true },
        { path: ["casementStyle"], label: "Hoja", kind: "enum", fromSchema: true },
        { path: ["side"], label: "Cara", kind: "enum", fromSchema: true },
      ],
    },
    materialGroup(),
  ],
  stair: [
    {
      id: "dimensiones",
      label: "Dimensiones",
      fields: [
        num(["totalRise"], "Desnivel", { unit: "m", min: 0.1, max: 20, step: 0.05 }),
        num(["stepCount"], "Escalones", { step: 1, precision: 0, min: 1, max: 80 }),
        num(["width"], "Ancho", { unit: "m", min: 0.4, max: 4 }),
        num(["thickness"], "Espesor", { unit: "m", min: 0.02, max: 0.6 }),
        num(["railingHeight"], "Baranda", { unit: "m", min: 0, max: 2, step: 0.05 }),
      ],
    },
    {
      id: "estilo",
      label: "Estilo",
      fields: [{ path: ["stairType"], label: "Tipo", kind: "enum", fromSchema: true }],
    },
    materialGroup(),
  ],
  "stair-segment": [
    { id: "estilo", label: "Estilo", fields: [{ path: ["segmentType"], label: "Tipo", kind: "enum", fromSchema: true }] },
  ],
  shelf: [
    {
      id: "dimensiones",
      label: "Dimensiones",
      fields: [
        num(["width"], "Ancho", { unit: "m", min: 0.1, max: 6 }),
        num(["depth"], "Profundidad", { unit: "m", min: 0.05, max: 2 }),
        num(["height"], "Altura", { unit: "m", min: 0.1, max: 6, step: 0.05 }),
        num(["thickness"], "Espesor", { unit: "m", min: 0.005, max: 0.2, step: 0.005 }),
        num(["rows"], "Filas", { step: 1, precision: 0, min: 0, max: 20 }),
        num(["columns"], "Columnas", { step: 1, precision: 0, min: 0, max: 20 }),
      ],
    },
    {
      id: "opciones",
      label: "Opciones",
      fields: [bool(["withBack"], "Con fondo"), bool(["withSides"], "Con laterales"), bool(["withBottom"], "Con base")],
    },
    materialGroup(),
  ],
  elevator: [
    {
      id: "dimensiones",
      label: "Dimensiones",
      fields: [
        num(["width"], "Ancho cabina", { unit: "m", min: 0.5, max: 5 }),
        num(["depth"], "Profundidad", { unit: "m", min: 0.5, max: 5 }),
        num(["cabHeight"], "Altura cabina", { unit: "m", min: 1.2, max: 4, step: 0.05 }),
        num(["shaftWidth"], "Ancho hueco", { unit: "m", min: 0.6, max: 6 }),
        num(["shaftDepth"], "Profundidad hueco", { unit: "m", min: 0.6, max: 6 }),
        num(["doorWidth"], "Ancho puerta", { unit: "m", min: 0.4, max: 3 }),
        num(["doorHeight"], "Alto puerta", { unit: "m", min: 1.2, max: 3, step: 0.05 }),
      ],
    },
    materialGroup(),
  ],
  // `roof.material` es un MaterialSchema (un objeto), no un enum: el catálogo
  // pedía opciones en `material` y no había ninguna. Se usa el grupo completo.
  roof: [materialGroup()],
  "roof-segment": [{ id: "dimensiones", label: "Dimensiones", fields: [num(["slope"], "Pendiente", { unit: "°", min: 0, max: 90, step: 1, precision: 0 })] }],
  fence: [
    {
      id: "dimensiones",
      label: "Dimensiones",
      fields: [
        num(["height"], "Altura", { unit: "m", min: 0.2, max: 4, step: 0.05 }),
        num(["thickness"], "Espesor", { unit: "m", min: 0.01, max: 0.4 }),
        num(["postSpacing"], "Separación de postes", { unit: "m", min: 0.2, max: 4, step: 0.05 }),
        num(["postSize"], "Tamaño de poste", { unit: "m", min: 0.02, max: 0.4 }),
        num(["baseHeight"], "Altura de zócalo", { unit: "m", min: 0, max: 2, step: 0.05 }),
        spanMetric,
      ],
    },
    {
      id: "estilo",
      label: "Estilo",
      fields: [
        { path: ["style"], label: "Estilo", kind: "enum", fromSchema: true },
        txt(["color"], "Color", {
          kind: "color",
          suggestions: PALETA_COLORES,
        }),
      ],
    },
  ],
  building: [
    { id: "info", label: "Nodo", fields: [txt(["name"], "Nombre"), metric("Nivel", () => 0)] },
  ],
  level: [
    {
      id: "info",
      label: "Nivel",
      fields: [num(["level"], "Índice", { step: 1, precision: 0, min: -20, max: 200 }), metric("Altura", (n) => numOf(n, "height"), "m")],
    },
  ],
  site: [{ id: "geometria", label: "Geometría", fields: [areaMetric, perimeterMetric] }],
}

function numOf(node: AnyNode, key: string): number {
  const value = (node as unknown as Record<string, unknown>)[key]
  return typeof value === "number" ? value : 0
}

/* ── Fallback genérico desde el schema Zod ────────────────────────────── */

const SKIP_KEYS = new Set([
  "object",
  "id",
  "type",
  "parentId",
  "children",
  // Ya está en el grupo Identidad; sin esto se repetía en «Avanzado».
  "visible",
  "camera",
  "metadata",
  "slots",
  "holeMetadata",
  "asset",
  "material",
  "materialPreset",
  "interiorMaterial",
  "exteriorMaterial",
  "start",
  "end",
  "polygon",
  "holes",
  "path",
  "tangents",
  "wallId",
  "hostId",
  "assetId",
  "fromLevelId",
  "toLevelId",
  "boundaryWallIds",
  "servedLevelIds",
  "faceBands",
  "skirting",
  "crown",
  "chairRail",
  "skirtingInterior",
  "skirtingExterior",
  "crownInterior",
  "crownExterior",
  "chairRailInterior",
  "chairRailExterior",
])

function zodScalarType(zod: unknown): "number" | "boolean" | "enum" | null {
  if (unwrapZodEnum(zod) !== null) return "enum"
  const type = zodTypeName(zod)
  if (type === "number" || type === "int") return "number"
  if (type === "boolean" || type === "bool") return "boolean"
  return null
}

function genericGroup(node: AnyNode): FieldGroup | null {
  const def = nodeRegistry.get(node.type)
  const shape = (def as { schema?: { shape?: Record<string, unknown> } })?.schema?.shape
  if (!shape) return null

  const fields: FieldSpec[] = []
  for (const [key, zod] of Object.entries(shape)) {
    if (SKIP_KEYS.has(key)) continue
    const scalar = zodScalarType(zod)
    if (scalar === "number") {
      fields.push(num([key], fieldLabel(key), { step: 0.01, precision: 3 }))
    } else if (scalar === "boolean") {
      fields.push(bool([key], fieldLabel(key)))
    } else if (scalar === "enum") {
      fields.push({ path: [key], label: fieldLabel(key), kind: "enum", fromSchema: true })
    }
  }
  return fields.length > 0 ? { id: "avanzado", label: "Avanzado", fields } : null
}

/* ── API pública ──────────────────────────────────────────────────────── */

export function groupsForNode(node: AnyNode): { curated: FieldGroup[]; rest: FieldGroup[] } {
  const curated: FieldGroup[] = []

  // Sin grupo de Transformación: la posición y la rotación no se editan con
  // números acá, se manejan con el gizmo del visor (los handles `move-cross` y
  // `rotate` de cada nodo) y con la acción Mover del pie del panel.
  curated.push(identityGroup())

  const forKind = CATALOG[node.type] ?? []
  curated.push(...forKind.filter((group) => group.fields.every((f) => !f.visibleIf || f.visibleIf(node))))

  const curatedKeys = new Set(forKind.flatMap((group) => group.fields.map((f) => f.path?.[0] ?? "")))
  const rest: FieldGroup[] = []
  const extra = genericGroup(node)
  if (extra) {
    const remaining = extra.fields.filter((f) => !curatedKeys.has(f.path?.[0] ?? ""))
    if (remaining.length > 0) rest.push({ ...extra, fields: remaining })
  }
  rest.push({ id: "meta", label: "Nodo", fields: [idMetric] })

  return { curated, rest }
}

export function optionsFor(node: AnyNode, spec: FieldSpec): string[] {
  const opciones: string[] = [...(spec.options ?? [])]

  if (spec.fromSchema && spec.path) {
    for (const delEsquema of enumOptionsFor(node.type, spec.path) ?? []) {
      if (!opciones.includes(delEsquema)) opciones.push(delEsquema)
    }
  }

  // Un valor legacy que ya no está en el enum tiene que poder seguir viéndose
  // y seleccionándose: si no, el select aparece vacío al abrir el panel.
  const actual = spec.path ? readPath(node, spec.path) : undefined
  if (typeof actual === "string" && actual && !opciones.includes(actual)) {
    opciones.push(actual)
  }

  return opciones
}

export function displayValue(node: AnyNode, spec: FieldSpec): number | string {
  if (spec.kind === "metric") return spec.metric ? spec.metric(node) : "—"
  const raw = spec.path ? readPath(node, spec.path) : undefined
  if (typeof raw === "number") return spec.scale ? raw * spec.scale : raw
  if (typeof raw === "boolean") return raw ? "sí" : "no"

  if (raw == null) {
    // Campo opcional sin escribir: se muestra el valor con el que el visor lo
    // dibuja (default del schema o fallback del catálogo), no una raya.
    const porDefecto = spec.path ? schemaDefaultFor(node.type, spec.path) : undefined
    const valor = porDefecto ?? spec.fallback
    if (typeof valor === "number") return spec.scale ? valor * spec.scale : valor
    if (typeof valor === "string") return valor
  }

  if (raw == null) return "—"
  if (Array.isArray(raw)) return `${raw.length}`
  if (typeof raw === "object") return "{…}"
  return String(raw)
}

export function formatValue(spec: FieldSpec, value: number | string): string {
  if (typeof value === "string") return value
  const precision = spec.precision ?? 3
  return value.toFixed(precision)
}

