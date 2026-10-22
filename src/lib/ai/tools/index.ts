"use client";

import { z } from "zod";
import type { AiTool } from "../types";
import {
  getLevelTool,
  getNodeTool,
  getSceneSummaryTool,
  searchCatalogTool,
  searchMaterialsTool,
} from "./read";
import {
  addOpeningTool,
  createLevelTool,
  createRoomTool,
  createWallsTool,
} from "./create";
import {
  createMaterialTool,
  paintSurfaceTool,
  placeItemTool,
} from "./objects";
import { deleteNodeTool, updateNodeTool } from "./edit";
import { validateSceneTool } from "./validate";

/**
 * Las 15 tools del asistente.
 *
 * Lectura primero, escritura después. Todas las tools de escritura son
 * transaccionales: una llamada = un paso de undo. Las de lectura nunca tocan
 * la escena.
 */
export const ALL_TOOLS: AiTool<any>[] = [
  getSceneSummaryTool,
  getLevelTool,
  getNodeTool,
  searchCatalogTool,
  searchMaterialsTool,
  createLevelTool,
  createWallsTool,
  createRoomTool,
  addOpeningTool,
  placeItemTool,
  paintSurfaceTool,
  createMaterialTool,
  updateNodeTool,
  deleteNodeTool,
  validateSceneTool,
];

export const TOOL_BY_NAME = new Map(
  ALL_TOOLS.map((tool) => [tool.name, tool] as const)
);

export const TOOL_NAMES = ALL_TOOLS.map((tool) => tool.name);

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export const TOOL_DEFINITIONS: ToolDefinition[] = ALL_TOOLS.map((tool) => {
  const { $schema: _schema, ...parameters } = z.toJSONSchema(tool.input, {
    target: "draft-2020-12",
    io: "input",
  }) as Record<string, unknown>;

  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters,
    },
  };
});

export function getTool(name: string): AiTool<unknown> | null {
  return (TOOL_BY_NAME.get(name) as AiTool<unknown> | undefined) ?? null;
}

export {
  getSceneSummaryTool,
  getLevelTool,
  getNodeTool,
  searchCatalogTool,
  searchMaterialsTool,
  createLevelTool,
  createWallsTool,
  createRoomTool,
  addOpeningTool,
  placeItemTool,
  paintSurfaceTool,
  createMaterialTool,
  updateNodeTool,
  deleteNodeTool,
  validateSceneTool,
};
