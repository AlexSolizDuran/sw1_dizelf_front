"use client";

import {
  type AnyNode,
  type AnyNodeId,
  type BuildingNode,
  type LevelNode,
  BuildingNode as BuildingSchema,
  CeilingNode,
  DoorNode as DoorSchema,
  LevelNode as LevelSchema,
  SlabNode,
  WallNode as WallSchema,
  WindowNode as WindowSchema,
  ZoneNode,
  pauseSpaceDetection,
  resumeSpaceDetection,
  runAsSingleSceneHistoryStep,
  useScene,
} from "@pascal-app/core";
import { useViewer } from "@pascal-app/viewer";
import { z } from "zod";
import type { AiTool } from "../types";
import { fail, ok } from "../types";
import {
  EPSILON,
  MIN_POLYGON_AREA,
  MIN_WALL_LENGTH,
  childrenOfType,
  effectiveWallHeight,
  findLevel,
  isSimplePolygon,
  normalizePolygon,
  polygonArea,
  polygonPerimeter,
  round,
  sameSegment,
  wallLength,
} from "./helpers";

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

const createLevelInput = z.object({
  buildingId: z
    .string()
    .optional()
    .describe("Edificio padre. Si se omite, usa el primero de la escena."),
  name: z.string().min(1).max(80).optional(),
  level: z
    .number()
    .int()
    .min(0)
    .max(200)
    .optional()
    .describe("Número de nivel. Si se omite, usa el siguiente."),
  select: z
    .boolean()
    .default(false)
    .describe("Si es true, deja el nivel nuevo seleccionado en el editor."),
});

export type CreateLevelInput = z.infer<typeof createLevelInput>;

export const createLevelTool: AiTool<CreateLevelInput> = {
  name: "create_level",
  description:
    "Crea un nivel dentro de un edificio. Si la escena no tiene edificio, crea uno debajo del terreno. No crea muros ni ambientes.",
  input: createLevelInput,
  risk: "write",
  async run(args) {
    const blocked = ensureWritable();
    if (blocked) return blocked;

    const nodes = useScene.getState().nodes;

    let building: BuildingNode | null = null;
    if (args.buildingId) {
      const candidate = nodes[args.buildingId as AnyNodeId];
      if (!candidate || candidate.type !== "building") {
        return fail(
          "BUILDING_NOT_FOUND",
          `No existe el edificio "${args.buildingId}".`,
          "Usá get_scene_summary para listar los edificios."
        );
      }
      building = candidate;
    } else {
      building =
        Object.values(nodes).find(
          (node): node is BuildingNode => node.type === "building"
        ) ?? null;
    }

    const site = Object.values(nodes).find((node) => node.type === "site");
    if (!building && !site) {
      return fail(
        "SITE_NOT_FOUND",
        "La escena no tiene terreno ni edificio.",
        "Cargá una escena base antes de crear niveles."
      );
    }

    const levels = Object.values(nodes).filter(
      (node): node is LevelNode => node.type === "level"
    );
    const nextLevel =
      args.level ??
      (levels.length > 0
        ? Math.max(...levels.map((level) => level.level)) + 1
        : 0);
    const name = args.name ?? `Nivel ${nextLevel + 1}`;

    const createdBuilding = building
      ? null
      : BuildingSchema.parse({ name: "Edificio", children: [] });
    const parentBuildingId = (building?.id ??
      createdBuilding?.id) as AnyNodeId | undefined;
    if (!parentBuildingId) {
      return fail("BUILDING_REQUIRED", "No se pudo resolver el edificio padre.");
    }

    const level = LevelSchema.parse({
      name,
      level: nextLevel,
      children: [],
      parentId: parentBuildingId,
    });

    runAsSingleSceneHistoryStep(useScene, () => {
      useScene.getState().applyNodeChanges({
        create: [
          ...(createdBuilding
            ? [
                {
                  node: createdBuilding as AnyNode,
                  parentId: site!.id as AnyNodeId,
                },
              ]
            : []),
          { node: level as AnyNode, parentId: parentBuildingId },
        ],
      });
    });

    if (args.select) {
      useViewer.getState().setSelection({
        buildingId: parentBuildingId as BuildingNode["id"],
        levelId: level.id as LevelNode["id"],
        zoneId: null,
        selectedIds: [],
      });
    }

    return ok({
      levelId: level.id,
      buildingId: parentBuildingId,
      name,
      level: nextLevel,
    });
  },
};

const wallInput = z.object({
  start: z.tuple([z.number(), z.number()]),
  end: z.tuple([z.number(), z.number()]),
  height: z.number().min(0.1).max(10).default(2.5),
  thickness: z.number().min(0.02).max(2).default(0.15),
  curveOffset: z.number().min(-20).max(20).optional(),
});

const createWallsInput = z.object({
  levelId: z
    .string()
    .optional()
    .describe("Nivel donde se crean los muros. Si se omite, usa el activo."),
  walls: z.array(wallInput).min(1).max(50),
});

export type CreateWallsInput = z.infer<typeof createWallsInput>;

function zoneIdsOnLevel(
  nodes: Record<AnyNodeId, AnyNode>,
  levelId: AnyNodeId
): Set<string> {
  return new Set(
    Object.values(nodes)
      .filter((node) => node.type === "zone" && node.parentId === levelId)
      .map((node) => node.id)
  );
}

export const createWallsTool: AiTool<CreateWallsInput> = {
  name: "create_walls",
  description:
    "Crea uno o varios muros en un nivel, en una sola operación de undo. No crea puertas ni ventanas. Si los muros cierran un polígono, la detección automática puede crear el ambiente, la losa y el techo.",
  input: createWallsInput,
  risk: "write",
  async run(args, ctx) {
    const blocked = ensureWritable();
    if (blocked) return blocked;

    const nodes = useScene.getState().nodes;
    const level = findLevel(nodes, args.levelId ?? ctx.levelId);
    if (!level) {
      return fail(
        "LEVEL_NOT_FOUND",
        "No se encontró el nivel para crear los muros.",
        "Usá get_scene_summary para obtener un levelId."
      );
    }

    const levelId = level.id as AnyNodeId;
    const existingWalls = childrenOfType(nodes, levelId, "wall");
    const planned: { start: [number, number]; end: [number, number] }[] = [];

    for (let index = 0; index < args.walls.length; index++) {
      const wall = args.walls[index];
      const length = Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
      if (length < MIN_WALL_LENGTH) {
        return fail(
          "WALL_TOO_SHORT",
          `El muro ${index + 1} mide ${round(length)} m.`,
          `El mínimo es ${MIN_WALL_LENGTH} m.`
        );
      }

      const duplicate =
        existingWalls.some((existing) =>
          sameSegment(existing.start, existing.end, wall.start, wall.end)
        ) ||
        planned.some((other) =>
          sameSegment(other.start, other.end, wall.start, wall.end)
        );

      if (duplicate) {
        return fail(
          "DUPLICATE_WALL",
          `El muro ${index + 1} ya existe entre esos puntos.`,
          "Reutilizá el muro existente o cambiá las coordenadas."
        );
      }

      planned.push({ start: wall.start, end: wall.end });
    }

    const roomsBefore = zoneIdsOnLevel(nodes, levelId);
    const wallCount = existingWalls.length;
    const walls = args.walls.map((input, index) =>
      WallSchema.parse({
        name: `Muro ${wallCount + index + 1}`,
        start: input.start,
        end: input.end,
        height: input.height,
        thickness: input.thickness,
        ...(input.curveOffset !== undefined
          ? { curveOffset: input.curveOffset }
          : {}),
      })
    );

    runAsSingleSceneHistoryStep(useScene, () => {
      useScene.getState().applyNodeChanges({
        create: walls.map((wall) => ({
          node: wall as AnyNode,
          parentId: levelId,
        })),
      });
    });

    const afterNodes = useScene.getState().nodes;
    const roomsAfter = zoneIdsOnLevel(afterNodes, levelId);
    const newRoomIds = [...roomsAfter].filter((id) => !roomsBefore.has(id));

    return ok(
      {
        levelId,
        wallIds: walls.map((wall) => wall.id),
        newRoomIds,
        walls: walls.map((wall) => ({
          id: wall.id,
          length: round(wallLength(wall)),
          height: wall.height,
          thickness: wall.thickness,
        })),
      },
      newRoomIds.length > 0
        ? ["Se detectaron ambientes nuevos a partir de los muros cerrados."]
        : undefined
    );
  },
};

const createRoomInput = z.object({
  levelId: z
    .string()
    .optional()
    .describe("Nivel donde se crea el ambiente. Si se omite, usa el activo."),
  name: z.string().min(1).max(80).describe("Nombre del ambiente, por ejemplo Dormitorio 1."),
  polygon: z
    .array(z.tuple([z.number(), z.number()]))
    .min(3)
    .max(64)
    .describe("Vértices del ambiente en planta [x, z], en orden. No repetir el primero al final."),
  height: z.number().min(0.5).max(10).default(2.5),
  thickness: z.number().min(0.02).max(2).default(0.15),
  createSlab: z.boolean().default(true),
  createCeiling: z.boolean().default(true),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .describe("Color de la zona en formato #rrggbb."),
});

export type CreateRoomInput = z.infer<typeof createRoomInput>;

export const createRoomTool: AiTool<CreateRoomInput> = {
  name: "create_room",
  description:
    "Crea un ambiente cerrado de forma atómica: muros, zone, losa y techo, con un solo undo. Pausa la detección automática para no duplicar superficies. No crea puertas ni ventanas; usar add_opening después.",
  input: createRoomInput,
  risk: "write",
  async run(args, ctx) {
    const blocked = ensureWritable();
    if (blocked) return blocked;

    const nodes = useScene.getState().nodes;
    const level = findLevel(nodes, args.levelId ?? ctx.levelId);
    if (!level) {
      return fail(
        "LEVEL_NOT_FOUND",
        "No se encontró el nivel para crear el ambiente.",
        "Usá get_scene_summary para obtener un levelId."
      );
    }

    const levelId = level.id as AnyNodeId;
    const polygon = normalizePolygon(args.polygon);

    if (polygon.length < 3) {
      return fail(
        "INVALID_POLYGON",
        "El polígono necesita al menos 3 vértices distintos.",
        "Pasá los puntos en orden, sin repetir el primero al final."
      );
    }

    if (!isSimplePolygon(polygon)) {
      return fail(
        "SELF_INTERSECTING_POLYGON",
        "El polígono se cruza a sí mismo.",
        "Revisá el orden de los vértices: deben recorrer el contorno sin cruzarse."
      );
    }

    const area = polygonArea(polygon);
    if (area < MIN_POLYGON_AREA) {
      return fail(
        "POLYGON_TOO_SMALL",
        `El ambiente tiene ${round(area)} m².`,
        `El mínimo es ${MIN_POLYGON_AREA} m².`
      );
    }

    const existingWalls = childrenOfType(nodes, levelId, "wall");
    for (let index = 0; index < polygon.length; index++) {
      const start = polygon[index];
      const end = polygon[(index + 1) % polygon.length];
      if (Math.hypot(end[0] - start[0], end[1] - start[1]) < MIN_WALL_LENGTH) {
        return fail(
          "WALL_TOO_SHORT",
          `El lado ${index + 1} del polígono es demasiado corto.`,
          `El mínimo es ${MIN_WALL_LENGTH} m.`
        );
      }
      if (
        existingWalls.some((wall) =>
          sameSegment(wall.start, wall.end, start, end)
        )
      ) {
        return fail(
          "DUPLICATE_WALL",
          `El lado ${index + 1} ya existe como muro.`,
          "Usá create_walls para completar un ambiente existente o cambiá el polígono."
        );
      }
    }

    const wallCount = existingWalls.length;
    const walls = polygon.map((start, index) => {
      const end = polygon[(index + 1) % polygon.length];
      return WallSchema.parse({
        name: `Muro ${wallCount + index + 1}`,
        start,
        end,
        height: args.height,
        thickness: args.thickness,
      });
    });

    const zone = ZoneNode.parse({
      name: args.name,
      polygon,
      autoFromWalls: true,
      boundaryWallIds: walls.map((wall) => wall.id),
      parentId: levelId,
      ...(args.color ? { color: args.color } : {}),
    });

    const slab = args.createSlab
      ? SlabNode.parse({
          name: `${args.name} - piso`,
          polygon,
          autoFromWalls: true,
          parentId: levelId,
        })
      : null;

    const ceiling = args.createCeiling
      ? CeilingNode.parse({
          name: `${args.name} - techo`,
          polygon,
          height: args.height,
          autoFromWalls: true,
          parentId: levelId,
        })
      : null;

    pauseSpaceDetection();
    try {
      runAsSingleSceneHistoryStep(useScene, () => {
        useScene.getState().applyNodeChanges({
          create: [
            ...walls.map((wall) => ({
              node: wall as AnyNode,
              parentId: levelId,
            })),
            { node: zone as AnyNode, parentId: levelId },
            ...(slab ? [{ node: slab as AnyNode, parentId: levelId }] : []),
            ...(ceiling
              ? [{ node: ceiling as AnyNode, parentId: levelId }]
              : []),
          ],
        });
      });
    } finally {
      resumeSpaceDetection();
    }

    return ok({
      levelId,
      roomId: zone.id,
      name: args.name,
      wallIds: walls.map((wall) => wall.id),
      slabId: slab?.id ?? null,
      ceilingId: ceiling?.id ?? null,
      area_m2: round(area),
      perimeter_m: round(polygonPerimeter(polygon)),
      polygon,
    });
  },
};

const DOOR_TYPES = [
  "hinged",
  "double",
  "french",
  "folding",
  "pocket",
  "barn",
  "sliding",
  "garage-sectional",
  "garage-rollup",
  "garage-tiltup",
] as const;

const WINDOW_TYPES = [
  "fixed",
  "sliding",
  "casement",
  "awning",
  "hopper",
  "single-hung",
  "double-hung",
  "bay",
  "bow",
  "louvered",
] as const;

const addOpeningInput = z.object({
  wallId: z.string().describe("ID del muro que recibe la abertura."),
  kind: z.enum(["door", "window"]),
  name: z.string().min(1).max(80).optional(),
  distanceFromStart: z
    .number()
    .min(0)
    .optional()
    .describe("Centro de la abertura, medido en metros desde el inicio del muro. Por defecto, el centro."),
  width: z.number().min(0.2).max(6).optional(),
  height: z.number().min(0.2).max(6).optional(),
  side: z.enum(["front", "back"]).default("front"),
  sill: z
    .number()
    .min(0)
    .max(3)
    .default(0.9)
    .describe("Altura del alféizar; solo se usa en ventanas."),
  doorType: z.enum(DOOR_TYPES).optional(),
  doorCategory: z.enum(["interior", "garage"]).optional(),
  windowType: z.enum(WINDOW_TYPES).optional(),
});

export type AddOpeningInput = z.infer<typeof addOpeningInput>;

export const addOpeningTool: AiTool<AddOpeningInput> = {
  name: "add_opening",
  description:
    "Agrega una puerta o ventana a un muro existente. La posición se mide en metros desde el inicio del muro y se valida que entre sin superponerse con otras aberturas.",
  input: addOpeningInput,
  risk: "write",
  async run(args) {
    const blocked = ensureWritable();
    if (blocked) return blocked;

    const nodes = useScene.getState().nodes;
    const wall = nodes[args.wallId as AnyNodeId];
    if (!wall || wall.type !== "wall") {
      return fail(
        "WALL_NOT_FOUND",
        `No existe el muro "${args.wallId}".`,
        "Usá get_level para listar los muros del nivel."
      );
    }

    if (Math.abs(wall.curveOffset ?? 0) > EPSILON) {
      return fail(
        "CURVED_WALL_UNSUPPORTED",
        "Las aberturas sobre muros curvos no están soportadas por esta tool.",
        "Usá un muro recto o creá la abertura manualmente en el editor."
      );
    }

    const length = wallLength(wall);
    const wallHeight = effectiveWallHeight(wall);
    const width = args.width ?? (args.kind === "door" ? 0.9 : 1.5);
    const height = args.height ?? (args.kind === "door" ? 2.1 : 1.5);
    const distance = args.distanceFromStart ?? length / 2;
    const margin = 0.05;
    const half = width / 2;

    if (distance - half < margin || distance + half > length - margin) {
      return fail(
        "OPENING_OUT_OF_WALL",
        `La abertura no entra en el muro: el muro mide ${round(length)} m y la abertura ${round(width)} m.`,
        "Ajustá distanceFromStart o el ancho."
      );
    }

    if (args.kind === "window" && args.sill + height > wallHeight - margin) {
      return fail(
        "OPENING_TOO_TALL",
        `La ventana no entra en la altura del muro (${round(wallHeight)} m).`,
        "Reducí height o sill."
      );
    }

    if (args.kind === "door" && height > wallHeight - margin) {
      return fail(
        "OPENING_TOO_TALL",
        `La puerta no entra en la altura del muro (${round(wallHeight)} m).`,
        "Reducí height."
      );
    }

    const siblingIds = "children" in wall && Array.isArray(wall.children)
      ? wall.children
      : [];
    for (const siblingId of siblingIds) {
      const sibling = nodes[siblingId as AnyNodeId];
      if (!sibling || (sibling.type !== "door" && sibling.type !== "window")) {
        continue;
      }
      const siblingHalf = sibling.width / 2;
      if (Math.abs(sibling.position[0] - distance) < half + siblingHalf + 0.02) {
        return fail(
          "OPENING_OVERLAP",
          `La abertura se superpone con "${sibling.name ?? sibling.id}".`,
          "Movela a otra posición del muro."
        );
      }
    }

    const rotation: [number, number, number] = [
      0,
      args.side === "front" ? 0 : Math.PI,
      0,
    ];
    const openingCount = Object.values(nodes).filter(
      (node) => node.type === args.kind && node.parentId === wall.id
    ).length;
    const name =
      args.name ??
      `${args.kind === "door" ? "Puerta" : "Ventana"} ${openingCount + 1}`;

    const opening =
      args.kind === "door"
        ? DoorSchema.parse({
            name,
            position: [distance, height / 2, 0],
            rotation,
            side: args.side,
            wallId: wall.id,
            parentId: wall.id,
            width,
            height,
            ...(args.doorType ? { doorType: args.doorType } : {}),
            ...(args.doorCategory ? { doorCategory: args.doorCategory } : {}),
          })
        : WindowSchema.parse({
            name,
            position: [distance, args.sill + height / 2, 0],
            rotation,
            side: args.side,
            wallId: wall.id,
            parentId: wall.id,
            width,
            height,
            ...(args.windowType ? { windowType: args.windowType } : {}),
          });

    runAsSingleSceneHistoryStep(useScene, () => {
      useScene.getState().applyNodeChanges({
        create: [{ node: opening as AnyNode, parentId: wall.id as AnyNodeId }],
      });
    });

    return ok({
      openingId: opening.id,
      kind: args.kind,
      wallId: wall.id,
      name,
      distanceFromStart: round(distance),
      width,
      height,
      side: args.side,
      ...(args.kind === "window" ? { sill: args.sill } : {}),
    });
  },
};
