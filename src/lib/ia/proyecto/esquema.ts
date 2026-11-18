import { z } from "zod";

/**
 * Contrato del plan de proyecto asistido.
 *
 * El modelo **no** devuelve un `SceneGraph`: devuelve una distribución de
 * ambientes que el editor ejecuta con `create_rooms`. Este archivo define la
 * forma del JSON que se le pide y la validación que debe pasar antes de tocar
 * la escena.
 *
 * V1: ambientes rectangulares (el normalizador convierte cualquier polígono a
 * su rectángulo envolvente), máximo 8 ambientes por nivel y 3 niveles.
 */

export const MAX_NIVELES = 3;
export const MAX_AMBIENTES_POR_NIVEL = 8;
export const MAX_ABERTURAS_POR_AMBIENTE = 8;
export const ALTURA_POR_DEFECTO = 2.5;

export const aberturaPlanSchema = z.object({
  tipo: z.enum(["puerta", "ventana"]),
  lado: z
    .number()
    .int()
    .min(0)
    .max(16)
    .describe("Lado del rectángulo donde va la abertura. El lado 1 es el primero del polígono."),
  ancho: z.number().min(0.4).max(6).optional(),
  alto: z.number().min(0.4).max(4).optional(),
});

export const ambientePlanSchema = z.object({
  nombre: z.string().trim().min(1).max(60),
  poligono: z
    .array(z.tuple([z.number(), z.number()]))
    .min(3)
    .max(8)
    .describe("Vértices en planta [x, z], en metros."),
  altura: z.number().min(0).max(4).optional(),
  aberturas: z.array(aberturaPlanSchema).max(MAX_ABERTURAS_POR_AMBIENTE).optional(),
});

export const nivelPlanSchema = z.object({
  nivel: z.number().int().min(0).max(MAX_NIVELES - 1).optional(),
  nombre: z.string().trim().max(60).optional(),
  ambientes: z.array(ambientePlanSchema).min(1).max(MAX_AMBIENTES_POR_NIVEL),
});

export const planProyectoSchema = z.object({
  nombreSugerido: z.string().trim().max(100).optional(),
  niveles: z.array(nivelPlanSchema).min(1).max(MAX_NIVELES),
  notas: z.string().trim().max(500).optional(),
});

export type AberturaPlan = z.infer<typeof aberturaPlanSchema>;
export type AmbientePlan = z.infer<typeof ambientePlanSchema>;
export type NivelPlan = z.infer<typeof nivelPlanSchema>;
export type PlanProyecto = z.infer<typeof planProyectoSchema>;

/**
 * JSON Schema que viaja en `response_format`.
 *
 * Se escribe a mano en vez de derivarlo de Zod porque el proveedor exige un
 * esquema estricto (`additionalProperties: false` y todo lo obligatorio) y
 * `zod-to-json-schema` no es dependencia del proyecto.
 */
export const PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["niveles"],
  properties: {
    nombreSugerido: { type: "string", maxLength: 100 },
    notas: { type: "string", maxLength: 500 },
    niveles: {
      type: "array",
      minItems: 1,
      maxItems: MAX_NIVELES,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["ambientes"],
        properties: {
          nivel: { type: "integer", minimum: 0, maximum: MAX_NIVELES - 1 },
          nombre: { type: "string", maxLength: 60 },
          ambientes: {
            type: "array",
            minItems: 1,
            maxItems: MAX_AMBIENTES_POR_NIVEL,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["nombre", "poligono"],
              properties: {
                nombre: { type: "string", maxLength: 60 },
                poligono: {
                  type: "array",
                  minItems: 4,
                  maxItems: 4,
                  items: {
                    type: "array",
                    minItems: 2,
                    maxItems: 2,
                    items: { type: "number" },
                  },
                },
                altura: { type: "number", minimum: 0, maximum: 4 },
                aberturas: {
                  type: "array",
                  maxItems: MAX_ABERTURAS_POR_AMBIENTE,
                  items: {
                    type: "object",
                    additionalProperties: false,
                    required: ["tipo", "lado"],
                    properties: {
                      tipo: { type: "string", enum: ["puerta", "ventana"] },
                      lado: { type: "integer", minimum: 1, maximum: 4 },
                      ancho: { type: "number", minimum: 0.4, maximum: 6 },
                      alto: { type: "number", minimum: 0.4, maximum: 4 },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
} as const;

/** Convierte los `issues` de Zod en mensajes legibles para la reparación. */
export function describirIssues(
  issues: readonly { path: PropertyKey[]; message: string }[]
): string[] {
  return issues.slice(0, 20).map((issue) => {
    const ruta = issue.path
      .map((parte) => (typeof parte === "number" ? `[${parte}]` : String(parte)))
      .join(".");
    return ruta ? `${ruta}: ${issue.message}` : issue.message;
  });
}

/** Lee la salida del modelo: acepta JSON puro o envuelto en markdown. */
export function extraerJson(texto: string): unknown {
  const limpio = texto
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(limpio);
  } catch {
    const inicio = limpio.indexOf("{");
    const fin = limpio.lastIndexOf("}");
    if (inicio === -1 || fin <= inicio) return null;
    try {
      return JSON.parse(limpio.slice(inicio, fin + 1));
    } catch {
      return null;
    }
  }
}
