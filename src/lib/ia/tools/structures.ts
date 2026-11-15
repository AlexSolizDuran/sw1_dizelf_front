"use client";

import {
  type AnyNode,
  type AnyNodeId,
  type LevelNode,
  COLUMN_PRESETS,
  ColumnNode,
  FenceNode,
  RoofNode,
  RoofSegmentNode,
  ShelfNode,
  StairNode,
  StairSegmentNode,
  runAsSingleSceneHistoryStep,
  syncAutoStairOpenings,
  useScene,
} from "@pascal-app/core";
import { z } from "zod";
import type { AiTool, ToolContext } from "../tool-types";
import { fail, ok } from "../tool-types";
import { MIN_WALL_LENGTH, findLevel, round } from "./helpers";

function ensureWritable() {
  if (useScene.getState().readOnly) {
    return fail(
      "READ_ONLY",
      "La escena está en solo lectura.",
      "No intentes escribir; informá que el usuario no tiene permiso."
    );
  }
  return null;
}

function resolveLevel(ctx: ToolContext, levelId?: string): LevelNode | null {
  return findLevel(useScene.getState().nodes, levelId ?? ctx.levelId);
}

const levelIdInput = z
  .string()
  .optional()
  .describe("Nivel donde se crea la estructura. Si se omite, usa el activo.");

const positionInput = z
  .tuple([z.number(), z.number(), z.number()])
  .describe("Posición [x, y, z] en metros; y es la base sobre el nivel.");

const createColumnInput = z.object({
  levelId: levelIdInput,
  name: z.string().min(1).max(80).optional(),
  position: positionInput,
  rotation: z
    .number()
    .default(0)
    .describe("Rotación sobre el eje Y, en radianes."),
  preset: z
    .string()
    .optional()
    .describe("Preset de columna de COLUMN_PRESETS (por ejemplo basicPillar)."),
  style: z.string().optional(),
  width: z.number().min(0.05).max(5).optional(),
  depth: z.number().min(0.05).max(5).optional(),
  height: z.number().min(0.2).max(20).optional(),
});

export type CreateColumnInput = z.infer<typeof createColumnInput>;

export const createColumnTool: AiTool<CreateColumnInput> = {
  name: "create_column",
  description:
    "Crea una columna en un nivel. Podés partir de un preset de COLUMN_PRESETS y sobrescribir dimensiones o estilo.",
  input: createColumnInput,
  risk: "write",
  async run(args, ctx) {
    const blocked = ensureWritable();
    if (blocked) return blocked;

    const level = resolveLevel(ctx, args.levelId);
    if (!level) {
      return fail(
        "LEVEL_NOT_FOUND",
        "No se encontró el nivel para crear la columna.",
        "Usá get_scene_summary para obtener un levelId."
      );
    }

    let presetValues: Record<string, unknown> = {};
    let presetLabel: string | undefined;
    if (args.preset) {
      const preset =
        COLUMN_PRESETS[args.preset as keyof typeof COLUMN_PRESETS];
      if (!preset) {
        return fail(
          "COLUMN_PRESET_NOT_FOUND",
          `No existe el preset de columna "${args.preset}".`,
          `Presets válidos: ${Object.keys(COLUMN_PRESETS).join(", ")}.`
        );
      }
      const { label, ...values } = preset;
      presetValues = values;
      presetLabel = label;
    }

    const columnCount = Object.values(useScene.getState().nodes).filter(
      (node) => node.type === "column" && node.parentId === level.id
    ).length;

    const column = ColumnNode.parse({
      ...presetValues,
      name: args.name ?? presetLabel ?? `Columna ${columnCount + 1}`,
      position: args.position,
      rotation: args.rotation,
      ...(args.style ? { style: args.style } : {}),
      ...(args.width !== undefined ? { width: args.width } : {}),
      ...(args.depth !== undefined ? { depth: args.depth } : {}),
      ...(args.height !== undefined ? { height: args.height } : {}),
    });

    runAsSingleSceneHistoryStep(useScene, () => {
      useScene.getState().applyNodeChanges({
        create: [{ node: column as AnyNode, parentId: level.id as AnyNodeId }],
      });
    });

    return ok({
      columnId: column.id,
      levelId: level.id,
      name: column.name,
      position: column.position,
      preset: args.preset ?? null,
    });
  },
};

const createFenceInput = z.object({
  levelId: levelIdInput,
  name: z.string().min(1).max(80).optional(),
  start: z.tuple([z.number(), z.number()]).describe("Punto inicial [x, z]."),
  end: z.tuple([z.number(), z.number()]).describe("Punto final [x, z]."),
  height: z.number().min(0.2).max(5).default(1.2),
  thickness: z.number().min(0.01).max(0.5).default(0.05),
  style: z.string().optional(),
});

export type CreateFenceInput = z.infer<typeof createFenceInput>;

export const createFenceTool: AiTool<CreateFenceInput> = {
  name: "create_fence",
  description:
    "Crea un cerco recto entre dos puntos [x, z] de un nivel. Para cercos curvos usá dos puntos y editá el trazado en el editor.",
  input: createFenceInput,
  risk: "write",
  async run(args, ctx) {
    const blocked = ensureWritable();
    if (blocked) return blocked;

    const level = resolveLevel(ctx, args.levelId);
    if (!level) {
      return fail(
        "LEVEL_NOT_FOUND",
        "No se encontró el nivel para crear el cerco.",
        "Usá get_scene_summary para obtener un levelId."
      );
    }

    const length = Math.hypot(
      args.end[0] - args.start[0],
      args.end[1] - args.start[1]
    );
    if (length < MIN_WALL_LENGTH) {
      return fail(
        "FENCE_TOO_SHORT",
        `El cerco mide ${round(length)} m.`,
        `El mínimo es ${MIN_WALL_LENGTH} m.`
      );
    }

    const fenceCount = Object.values(useScene.getState().nodes).filter(
      (node) => node.type === "fence" && node.parentId === level.id
    ).length;

    const fence = FenceNode.parse({
      name: args.name ?? `Cerco ${fenceCount + 1}`,
      start: args.start,
      end: args.end,
      height: args.height,
      thickness: args.thickness,
      ...(args.style ? { style: args.style } : {}),
    });

    runAsSingleSceneHistoryStep(useScene, () => {
      useScene.getState().applyNodeChanges({
        create: [{ node: fence as AnyNode, parentId: level.id as AnyNodeId }],
      });
    });

    return ok({
      fenceId: fence.id,
      levelId: level.id,
      name: fence.name,
      length: round(length),
    });
  },
};

const createShelfInput = z.object({
  levelId: levelIdInput,
  name: z.string().min(1).max(80).optional(),
  position: positionInput,
  rotation: z
    .tuple([z.number(), z.number(), z.number()])
    .default([0, 0, 0]),
  width: z.number().min(0.2).max(10).default(1),
  depth: z.number().min(0.1).max(3).default(0.5),
  height: z.number().min(0.2).max(5).default(1.8),
  style: z.string().optional(),
  rows: z.number().int().min(1).max(20).default(3),
  columns: z.number().int().min(1).max(20).default(2),
});

export type CreateShelfInput = z.infer<typeof createShelfInput>;

export const createShelfTool: AiTool<CreateShelfInput> = {
  name: "create_shelf",
  description:
    "Crea una estantería con filas y columnas configurables. Los materiales por slot se ajustan después con paint_surface.",
  input: createShelfInput,
  risk: "write",
  async run(args, ctx) {
    const blocked = ensureWritable();
    if (blocked) return blocked;

    const level = resolveLevel(ctx, args.levelId);
    if (!level) {
      return fail(
        "LEVEL_NOT_FOUND",
        "No se encontró el nivel para crear la estantería.",
        "Usá get_scene_summary para obtener un levelId."
      );
    }

    const shelfCount = Object.values(useScene.getState().nodes).filter(
      (node) => node.type === "shelf" && node.parentId === level.id
    ).length;

    const shelf = ShelfNode.parse({
      name: args.name ?? `Estante ${shelfCount + 1}`,
      position: args.position,
      rotation: args.rotation,
      width: args.width,
      depth: args.depth,
      height: args.height,
      rows: args.rows,
      columns: args.columns,
      ...(args.style ? { style: args.style } : {}),
    });

    runAsSingleSceneHistoryStep(useScene, () => {
      useScene.getState().applyNodeChanges({
        create: [{ node: shelf as AnyNode, parentId: level.id as AnyNodeId }],
      });
    });

    return ok({
      shelfId: shelf.id,
      levelId: level.id,
      name: shelf.name,
      dimensions: [shelf.width, shelf.height, shelf.depth],
    });
  },
};

const createStairInput = z.object({
  levelId: levelIdInput,
  name: z.string().min(1).max(80).optional(),
  toLevelId: z
    .string()
    .optional()
    .describe(
      "Nivel de destino. Si se omite, usa el siguiente nivel de la escena."
    ),
  position: positionInput,
  rotation: z
    .number()
    .default(0)
    .describe("Rotación sobre el eje Y, en radianes."),
  stairType: z.enum(["straight", "spiral", "curved"]).default("straight"),
  width: z.number().min(0.5).max(5).default(1),
  totalRise: z.number().min(0.2).max(20).optional(),
  stepCount: z.number().int().min(2).max(100).optional(),
  thickness: z.number().min(0.05).max(1).default(0.2),
});

export type CreateStairInput = z.infer<typeof createStairInput>;

export const createStairTool: AiTool<CreateStairInput> = {
  name: "create_stair",
  description:
    "Crea una escalera con su tramo y sincroniza los huecos en la losa y el techo. Requiere un nivel de destino; si no se indica, usa el siguiente nivel.",
  input: createStairInput,
  risk: "write",
  async run(args, ctx) {
    const blocked = ensureWritable();
    if (blocked) return blocked;

    const nodes = useScene.getState().nodes;
    const level = resolveLevel(ctx, args.levelId);
    if (!level) {
      return fail(
        "LEVEL_NOT_FOUND",
        "No se encontró el nivel de origen de la escalera.",
        "Usá get_scene_summary para obtener un levelId."
      );
    }

    const levels = Object.values(nodes).filter(
      (node): node is LevelNode => node.type === "level"
    );

    let toLevel: LevelNode | null = null;
    if (args.toLevelId) {
      const candidate = nodes[args.toLevelId as AnyNodeId];
      if (!candidate || candidate.type !== "level") {
        return fail(
          "LEVEL_NOT_FOUND",
          `No existe el nivel de destino "${args.toLevelId}".`,
          "Usá get_scene_summary para listar los niveles."
        );
      }
      toLevel = candidate;
    } else {
      toLevel =
        levels
          .filter((candidate) => candidate.level > level.level)
          .sort((a, b) => a.level - b.level)[0] ?? null;
    }

    if (!toLevel) {
      return fail(
        "DESTINATION_LEVEL_REQUIRED",
        "No hay un nivel de destino para la escalera.",
        "Creá el nivel superior o pasá toLevelId explícitamente."
      );
    }
    if (toLevel.id === level.id) {
      return fail(
        "INVALID_STAIR_LEVELS",
        "El nivel de origen y el de destino no pueden ser el mismo.",
        "Pasá un toLevelId distinto."
      );
    }

    const levelDelta = Math.max(1, toLevel.level - level.level);
    const totalRise = args.totalRise ?? round(levelDelta * 2.8);
    const stepCount =
      args.stepCount ?? Math.max(3, Math.round(totalRise / 0.18));

    const stairCount = Object.values(nodes).filter(
      (node) => node.type === "stair" && node.parentId === level.id
    ).length;
    const name = args.name ?? `Escalera ${stairCount + 1}`;

    const stair = StairNode.parse({
      name,
      position: args.position,
      rotation: args.rotation,
      stairType: args.stairType,
      width: args.width,
      totalRise,
      stepCount,
      thickness: args.thickness,
      fromLevelId: level.id,
      toLevelId: toLevel.id,
      slabOpeningMode: "destination",
    });

    const segment = StairSegmentNode.parse({
      name: `${name} - tramo`,
      parentId: stair.id,
      position: [0, 0, 0],
      rotation: 0,
      stepCount,
    });

    let openingsUpdated = 0;

    runAsSingleSceneHistoryStep(useScene, () => {
      useScene.getState().applyNodeChanges({
        create: [
          { node: stair as AnyNode, parentId: level.id as AnyNodeId },
          {
            node: segment as AnyNode,
            parentId: stair.id as AnyNodeId,
          },
        ],
      });

      const openingUpdates = syncAutoStairOpenings(
        useScene.getState().nodes
      );
      openingsUpdated = openingUpdates.length;
      if (openingUpdates.length > 0) {
        useScene.getState().updateNodes(
          openingUpdates as {
            id: AnyNodeId;
            data: Partial<AnyNode>;
          }[]
        );
      }
    });

    return ok({
      stairId: stair.id,
      segmentId: segment.id,
      fromLevelId: level.id,
      toLevelId: toLevel.id,
      totalRise,
      stepCount,
      openingsUpdated,
    });
  },
};

const createRoofInput = z.object({
  levelId: levelIdInput,
  name: z.string().min(1).max(80).optional(),
  roofType: z
    .enum(["flat", "hip", "gable", "shed", "gambrel", "dutch", "mansard"])
    .default("gable"),
  position: positionInput,
  rotation: z
    .number()
    .default(0)
    .describe("Rotación sobre el eje Y, en radianes."),
  width: z.number().min(0.5).max(50).default(6),
  depth: z.number().min(0.5).max(50).default(6),
  pitch: z
    .number()
    .min(0)
    .max(1.5)
    .default(0.6)
    .describe("Pendiente en radianes."),
  wallHeight: z.number().min(0.05).max(10).default(0.3),
});

export type CreateRoofInput = z.infer<typeof createRoofInput>;

export const createRoofTool: AiTool<CreateRoofInput> = {
  name: "create_roof",
  description:
    "Crea una cubierta con un paño principal. Ideal para cubrir un ambiente ya construido; la posición es el centro de la cubierta.",
  input: createRoofInput,
  risk: "write",
  async run(args, ctx) {
    const blocked = ensureWritable();
    if (blocked) return blocked;

    const level = resolveLevel(ctx, args.levelId);
    if (!level) {
      return fail(
        "LEVEL_NOT_FOUND",
        "No se encontró el nivel para crear la cubierta.",
        "Usá get_scene_summary para obtener un levelId."
      );
    }

    const roofCount = Object.values(useScene.getState().nodes).filter(
      (node) => node.type === "roof" && node.parentId === level.id
    ).length;
    const name = args.name ?? `Cubierta ${roofCount + 1}`;

    const roof = RoofNode.parse({
      name,
      position: args.position,
      rotation: args.rotation,
    });

    const segment = RoofSegmentNode.parse({
      name: `${name} - paño`,
      parentId: roof.id,
      position: [0, 0, 0],
      rotation: 0,
      roofType: args.roofType,
      width: args.width,
      depth: args.depth,
      pitch: args.pitch,
      wallHeight: args.wallHeight,
    });

    runAsSingleSceneHistoryStep(useScene, () => {
      useScene.getState().applyNodeChanges({
        create: [
          { node: roof as AnyNode, parentId: level.id as AnyNodeId },
          {
            node: segment as AnyNode,
            parentId: roof.id as AnyNodeId,
          },
        ],
      });
    });

    return ok({
      roofId: roof.id,
      segmentId: segment.id,
      levelId: level.id,
      name,
      roofType: args.roofType,
      dimensions: [args.width, args.depth],
    });
  },
};
