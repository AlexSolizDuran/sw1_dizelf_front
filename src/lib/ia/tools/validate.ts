"use client";

import { useScene } from "@pascal-app/core";
import { z } from "zod";
import type { AiTool } from "../tool-types";
import { fail, ok } from "../tool-types";
import { validarEscena } from "../validacion-escena";

const validateSceneInput = z.object({
  levelId: z
    .string()
    .optional()
    .describe("Nivel a validar. Si se omite, valida toda la escena."),
});

export type ValidateSceneInput = z.infer<typeof validateSceneInput>;

export const validateSceneTool: AiTool<ValidateSceneInput> = {
  name: "validate_scene",
  description:
    "Valida la escena y devuelve errores y advertencias: esquema, muros inválidos, aberturas fuera de muro, solapamientos, polígonos y ambientes detectados. Usar después de una serie de cambios.",
  input: validateSceneInput,
  risk: "read",
  async run(args) {
    const store = useScene.getState();

    const reporte = validarEscena({
      nodes: store.nodes,
      rootNodeIds: store.rootNodeIds,
      installedPlugins: store.installedPlugins,
      levelId: args.levelId ?? null,
    });

    if (!reporte) {
      return fail(
        "LEVEL_NOT_FOUND",
        `No existe el nivel "${args.levelId}".`,
        "Usá get_scene_summary para obtener un levelId válido."
      );
    }

    return ok({
      ok: reporte.ok,
      errorCount: reporte.errorCount,
      warningCount: reporte.warningCount,
      errors: reporte.errors,
      warnings: reporte.warnings,
      ...(reporte.truncated ? { truncated: true } : {}),
      schemaIssueCount: reporte.schemaIssueCount,
      stats: {
        ...reporte.stats,
        levels: reporte.levels.length,
      },
      levels: reporte.levels,
    });
  },
};
