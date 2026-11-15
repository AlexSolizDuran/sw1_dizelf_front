"use client";

import { z } from "zod";
import type { AiTool } from "../tool-types";
import { normalizarEsquema } from "./schema";
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
  createRoomsTool,
  createWallsTool,
} from "./create";
import {
  createColumnTool,
  createFenceTool,
  createRoofTool,
  createShelfTool,
  createStairTool,
} from "./structures";
import { paintSurfaceTool, placeItemTool } from "./objects";
import { deleteNodeTool, updateNodeTool } from "./edit";
import { duplicateLevelTool, duplicateNodeTool } from "./duplicate";
import { focusNodeTool, selectLevelTool } from "./view";
import { validateSceneTool } from "./validate";

/**
 * Las 24 tools del asistente.
 *
 * Lectura primero, escritura después. Todas las tools de escritura son
 * transaccionales: una llamada = un paso de undo. Las de lectura y navegación
 * nunca tocan la escena.
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
  createRoomsTool,
  addOpeningTool,
  createColumnTool,
  createFenceTool,
  createShelfTool,
  createStairTool,
  createRoofTool,
  placeItemTool,
  paintSurfaceTool,
  updateNodeTool,
  deleteNodeTool,
  duplicateNodeTool,
  duplicateLevelTool,
  selectLevelTool,
  focusNodeTool,
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
      parameters: normalizarEsquema(parameters) as Record<string, unknown>,
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
  createRoomsTool,
  addOpeningTool,
  createColumnTool,
  createFenceTool,
  createShelfTool,
  createStairTool,
  createRoofTool,
  placeItemTool,
  paintSurfaceTool,
  updateNodeTool,
  deleteNodeTool,
  duplicateNodeTool,
  duplicateLevelTool,
  selectLevelTool,
  focusNodeTool,
  validateSceneTool,
};
