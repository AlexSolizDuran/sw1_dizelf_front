import type { z } from "zod";

export type ToolRisk = "read" | "write" | "destructive";

export type ToolResult =
  | {
      ok: true;
      data: unknown;
      warnings?: string[];
    }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        hint?: string;
        details?: unknown;
      };
    };

export interface ToolContext {
  proyectoId: string;
  puedeEditar: boolean;
  /** Nivel activo del editor; evita obligar al modelo a repetirlo. */
  levelId: string | null;
}

export interface AiTool<I> {
  name: string;
  description: string;
  input: z.ZodType<I>;
  risk: ToolRisk;
  run(args: I, ctx: ToolContext): Promise<ToolResult>;
}

export function ok(data: unknown, warnings?: string[]): ToolResult {
  return warnings && warnings.length > 0
    ? { ok: true, data, warnings }
    : { ok: true, data };
}

export function fail(
  code: string,
  message: string,
  hint?: string,
  details?: unknown
): ToolResult {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(hint ? { hint } : {}),
      ...(details !== undefined ? { details } : {}),
    },
  };
}
