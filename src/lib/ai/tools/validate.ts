"use client";

import {
  type AnyNodeId,
  type DoorNode,
  type LevelNode,
  type WallNode,
  type WindowNode,
  type ZoneNode,
  detectSpacesForLevel,
  useScene,
  validateBuildJson,
} from "@pascal-app/core";
import { z } from "zod";
import type { AiTool } from "../types";
import { fail, ok } from "../types";
import {
  childrenOfType,
  effectiveWallHeight,
  findLevel,
  polygonArea,
  round,
  wallLength,
} from "./helpers";

const validateSceneInput = z.object({
  levelId: z
    .string()
    .optional()
    .describe("Nivel a validar. Si se omite, valida toda la escena."),
});

export type ValidateSceneInput = z.infer<typeof validateSceneInput>;

type Issue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  nodeId?: string;
};

export const validateSceneTool: AiTool<ValidateSceneInput> = {
  name: "validate_scene",
  description:
    "Valida la escena y devuelve errores y advertencias: esquema, muros inválidos, aberturas fuera de muro, solapamientos, polígonos y ambientes detectados. Usar después de una serie de cambios.",
  input: validateSceneInput,
  risk: "read",
  async run(args) {
    const store = useScene.getState();
    const nodes = store.nodes;
    const level = args.levelId ? findLevel(nodes, args.levelId) : null;

    if (args.levelId && !level) {
      return fail(
        "LEVEL_NOT_FOUND",
        `No existe el nivel "${args.levelId}".`,
        "Usá get_scene_summary para obtener un levelId válido."
      );
    }

    const validation = validateBuildJson({
      nodes,
      rootNodeIds: store.rootNodeIds,
      installedPlugins: store.installedPlugins,
    });

    const errors: Issue[] = validation.errors.map((issue) => ({
      severity: "error",
      code: issue.code,
      message: issue.message,
      ...(issue.nodeId ? { nodeId: issue.nodeId } : {}),
    }));
    const warnings: Issue[] = validation.warnings.map((issue) => ({
      severity: "warning",
      code: issue.code,
      message: issue.message,
      ...(issue.nodeId ? { nodeId: issue.nodeId } : {}),
    }));

    const levels = Object.values(nodes)
      .filter((node): node is LevelNode => node.type === "level")
      .filter((candidate) => !level || candidate.id === level.id);

    const levelReports: Array<Record<string, unknown>> = [];

    for (const currentLevel of levels) {
      const levelId = currentLevel.id as AnyNodeId;
      const walls = childrenOfType(nodes, levelId, "wall");
      const zones = childrenOfType(nodes, levelId, "zone");
      const wallById = new Map<string, WallNode>(
        walls.map((wall) => [wall.id, wall])
      );

      for (const wall of walls) {
        const length = wallLength(wall);
        if (length < 0.05) {
          errors.push({
            severity: "error",
            code: "wall_too_short",
            message: `El muro ${wall.name ?? wall.id} mide ${round(length)} m.`,
            nodeId: wall.id,
          });
        }
        if ((wall.height ?? effectiveWallHeight(wall)) <= 0) {
          errors.push({
            severity: "error",
            code: "wall_invalid_height",
            message: `El muro ${wall.name ?? wall.id} tiene altura inválida.`,
            nodeId: wall.id,
          });
        }
        if ((wall.thickness ?? 0.1) <= 0) {
          errors.push({
            severity: "error",
            code: "wall_invalid_thickness",
            message: `El muro ${wall.name ?? wall.id} tiene espesor inválido.`,
            nodeId: wall.id,
          });
        }
      }

      for (let i = 0; i < walls.length; i++) {
        for (let j = i + 1; j < walls.length; j++) {
          const a = walls[i];
          const b = walls[j];
          if (
            (a.start[0] === b.start[0] && a.start[1] === b.start[1] &&
              a.end[0] === b.end[0] && a.end[1] === b.end[1]) ||
            (a.start[0] === b.end[0] && a.start[1] === b.end[1] &&
              a.end[0] === b.start[0] && a.end[1] === b.start[1])
          ) {
            warnings.push({
              severity: "warning",
              code: "duplicate_wall",
              message: `Los muros ${a.id} y ${b.id} comparten los mismos extremos.`,
              nodeId: b.id,
            });
          }
        }
      }

      const openings: Array<DoorNode | WindowNode> = [];
      for (const wall of walls) {
        for (const childId of wall.children ?? []) {
          const child = nodes[childId as AnyNodeId];
          if (child?.type === "door" || child?.type === "window") {
            openings.push(child);
          }
        }
      }

      for (const opening of openings) {
        const wall = opening.wallId
          ? wallById.get(opening.wallId)
          : undefined;
        if (!wall) {
          errors.push({
            severity: "error",
            code: "opening_without_wall",
            message: `La abertura ${opening.name ?? opening.id} no tiene un muro válido.`,
            nodeId: opening.id,
          });
          continue;
        }

        const length = wallLength(wall);
        const wallHeight = effectiveWallHeight(wall);
        const half = opening.width / 2;
        if (opening.position[0] - half < -0.001 || opening.position[0] + half > length + 0.001) {
          errors.push({
            severity: "error",
            code: "opening_out_of_wall",
            message: `La abertura ${opening.name ?? opening.id} se sale del muro.`,
            nodeId: opening.id,
          });
        }

        const top =
          opening.type === "window"
            ? opening.position[1] + opening.height / 2
            : opening.height;
        if (top > wallHeight + 0.001) {
          errors.push({
            severity: "error",
            code: "opening_too_tall",
            message: `La abertura ${opening.name ?? opening.id} supera la altura del muro.`,
            nodeId: opening.id,
          });
        }
      }

      for (let i = 0; i < openings.length; i++) {
        for (let j = i + 1; j < openings.length; j++) {
          const a = openings[i];
          const b = openings[j];
          if (a.wallId !== b.wallId) continue;
          const distance = Math.abs(a.position[0] - b.position[0]);
          if (distance < (a.width + b.width) / 2 - 0.001) {
            warnings.push({
              severity: "warning",
              code: "openings_overlap",
              message: `Las aberturas ${a.id} y ${b.id} se superponen en el mismo muro.`,
              nodeId: b.id,
            });
          }
        }
      }

      for (const zone of zones) {
        validatePolygon(zone, "zone", errors);
        for (const boundaryWallId of zone.boundaryWallIds ?? []) {
          if (!wallById.has(boundaryWallId)) {
            warnings.push({
              severity: "warning",
              code: "zone_missing_boundary_wall",
              message: `La zone ${zone.name ?? zone.id} referencia un muro que ya no existe.`,
              nodeId: zone.id,
            });
          }
        }
      }

      const slabs = childrenOfType(nodes, levelId, "slab");
      const ceilings = childrenOfType(nodes, levelId, "ceiling");
      for (const slab of slabs) validatePolygon(slab, "slab", errors);
      for (const ceiling of ceilings) validatePolygon(ceiling, "ceiling", errors);

      let detectedSpaces = 0;
      if (walls.length > 0) {
        try {
          detectedSpaces = detectSpacesForLevel(currentLevel.id, walls).spaces.length;
        } catch {
          warnings.push({
            severity: "warning",
            code: "space_detection_failed",
            message: `No se pudieron detectar ambientes en ${currentLevel.name ?? currentLevel.id}.`,
            nodeId: currentLevel.id,
          });
        }
      }

      if (detectedSpaces > zones.length) {
        warnings.push({
          severity: "warning",
          code: "zones_missing",
          message: `${detectedSpaces} espacio(s) cerrado(s) no tienen zone en ${currentLevel.name ?? currentLevel.id}.`,
          nodeId: currentLevel.id,
        });
      }

      levelReports.push({
        levelId: currentLevel.id,
        name: currentLevel.name ?? `Nivel ${currentLevel.level + 1}`,
        walls: walls.length,
        zones: zones.length,
        openings: openings.length,
        slabs: slabs.length,
        ceilings: ceilings.length,
        detectedSpaces,
      });
    }

    const limitedErrors = errors.slice(0, 50);
    const limitedWarnings = warnings.slice(0, 50);

    return ok({
      ok: errors.length === 0,
      errorCount: errors.length,
      warningCount: warnings.length,
      errors: limitedErrors,
      warnings: limitedWarnings,
      ...(errors.length > limitedErrors.length ||
      warnings.length > limitedWarnings.length
        ? { truncated: true }
        : {}),
      schemaIssueCount: validation.schemaIssueCount,
      stats: {
        ...validation.stats,
        levels: levelReports.length,
      },
      levels: levelReports,
    });
  },
};

function validatePolygon(
  node: ZoneNode | { id: string; type: string; name?: string; polygon: [number, number][] },
  label: string,
  errors: Issue[]
) {
  const points = node.polygon;
  if (!Array.isArray(points) || points.length < 3) {
    errors.push({
      severity: "error",
      code: `${label}_invalid_polygon`,
      message: `El nodo ${node.name ?? node.id} no tiene un polígono válido.`,
      nodeId: node.id,
    });
    return;
  }
  if (polygonArea(points) < 0.01) {
    errors.push({
      severity: "error",
      code: `${label}_empty_area`,
      message: `El nodo ${node.name ?? node.id} tiene área cero.`,
      nodeId: node.id,
    });
  }
}
