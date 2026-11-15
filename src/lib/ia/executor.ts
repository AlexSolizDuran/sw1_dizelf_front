"use client";

import { useScene } from "@pascal-app/core";
import type { ToolContext, ToolResult } from "./tool-types";
import { fail } from "./tool-types";
import { TOOL_BY_NAME } from "./tools";

function parseArguments(raw: unknown): unknown {
  if (typeof raw !== "string") return raw ?? {};
  const trimmed = raw.trim();
  if (trimmed.length === 0) return {};
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

function formatIssues(issues: { path: PropertyKey[]; message: string }[]): string[] {
  return issues.slice(0, 12).map((issue) => {
    const path = issue.path
      .map((part) => (typeof part === "number" ? `[${part}]` : String(part)))
      .join(".");
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/**
 * Ejecuta una tool por nombre.
 *
 * Contrato:
 *  - valida argumentos con Zod (`INVALID_ARGS`);
 *  - valida permisos antes de tocar la escena (`READ_ONLY`);
 *  - normaliza cualquier excepción a `TOOL_ERROR`;
 *  - devuelve resultados compactos, nunca la escena completa.
 */
export async function executeTool(
  name: string,
  rawArgs: unknown,
  ctx: ToolContext
): Promise<ToolResult> {
  const tool = TOOL_BY_NAME.get(name);
  if (!tool) {
    return fail(
      "TOOL_NOT_FOUND",
      `No existe la tool "${name}".`,
      "Usá solo las tools declaradas en TOOL_DEFINITIONS."
    );
  }

  if (tool.risk !== "read") {
    if (!ctx.puedeEditar) {
      return fail(
        "READ_ONLY",
        "El usuario no tiene permiso para editar este proyecto.",
        "No intentes escribir. Podés seguir usando las tools de lectura."
      );
    }
    if (useScene.getState().readOnly) {
      return fail(
        "READ_ONLY",
        "La escena está en solo lectura.",
        "No intentes escribir. Podés seguir usando las tools de lectura."
      );
    }
  }

  const parsed = tool.input.safeParse(parseArguments(rawArgs));
  if (!parsed.success) {
    return fail(
      "INVALID_ARGS",
      `Argumentos inválidos para ${name}.`,
      formatIssues(parsed.error.issues).join(" | ")
    );
  }

  try {
    return await tool.run(parsed.data, ctx);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(
      "TOOL_ERROR",
      `La tool ${name} falló: ${message}`,
      "Corregí los argumentos o consultá la escena antes de reintentar."
    );
  }
}

export { TOOL_DEFINITIONS, TOOL_NAMES, ALL_TOOLS } from "./tools";
export type { ToolContext, ToolResult } from "./tool-types";
