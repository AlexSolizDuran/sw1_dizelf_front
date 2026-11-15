"use client";

import {
  type AnyNode,
  type AnyNodeId,
  type WallNode,
  runAsSingleSceneHistoryStep,
  useScene,
} from "@pascal-app/core";
import { z } from "zod";
import type { AiTool } from "../tool-types";
import { fail, ok } from "../tool-types";
import {
  MIN_POLYGON_AREA,
  MIN_WALL_LENGTH,
  compactNode,
  descendants,
  effectiveWallHeight,
  isSimplePolygon,
  normalizePolygon,
  polygonArea,
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

const STAIR_TYPES = ["straight", "spiral", "curved"] as const;

const ROOF_TYPES = [
  "flat",
  "hip",
  "gable",
  "shed",
  "gambrel",
  "dutch",
  "mansard",
] as const;

const updatePatchInput = z
  .object({
    name: z.string().min(1).max(80).optional(),
    visible: z.boolean().optional(),
    height: z.number().min(0.05).max(20).optional(),
    thickness: z.number().min(0.01).max(3).optional(),
    start: z.tuple([z.number(), z.number()]).optional(),
    end: z.tuple([z.number(), z.number()]).optional(),
    curveOffset: z.number().min(-20).max(20).optional(),
    position: z.tuple([z.number(), z.number(), z.number()]).optional(),
    rotation: z
      .union([
        z.number(),
        z.tuple([z.number(), z.number(), z.number()]),
      ])
      .optional(),
    scale: z.tuple([z.number(), z.number(), z.number()]).optional(),
    width: z.number().min(0.05).max(20).optional(),
    depth: z.number().min(0.05).max(20).optional(),
    sill: z.number().min(0).max(3).optional(),
    side: z.enum(["front", "back"]).optional(),
    doorType: z.enum(DOOR_TYPES).optional(),
    doorCategory: z.enum(["interior", "garage"]).optional(),
    windowType: z.enum(WINDOW_TYPES).optional(),
    stairType: z.enum(STAIR_TYPES).optional(),
    stepCount: z.number().int().min(2).max(100).optional(),
    totalRise: z.number().min(0.2).max(20).optional(),
    fromLevelId: z.string().optional(),
    toLevelId: z.string().optional(),
    roofType: z.enum(ROOF_TYPES).optional(),
    pitch: z.number().min(0).max(1.5).optional(),
    wallHeight: z.number().min(0.05).max(10).optional(),
    style: z.string().optional(),
    rows: z.number().int().min(1).max(20).optional(),
    columns: z.number().int().min(1).max(20).optional(),
    polygon: z.array(z.tuple([z.number(), z.number()])).min(3).max(64).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    autoFromWalls: z.boolean().optional(),
    elevation: z.number().min(-2).max(20).optional(),
    level: z.number().int().min(0).max(200).optional(),
    materialPreset: z.string().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "El patch no puede estar vacío."
  );

const updateNodeInput = z.object({
  nodeId: z.string().describe("ID exacto del nodo a modificar."),
  patch: updatePatchInput,
});

export type UpdateNodeInput = z.infer<typeof updateNodeInput>;

const COMMON_FIELDS = ["name", "visible"] as const;

/**
 * Campos que acepta cada tipo. Evita que un patch válido para un muro se
 * aplique a una ventana y Zod lo descarte en silencio: si la clave no está
 * acá, la tool devuelve `UNSUPPORTED_PATCH`.
 */
const PATCH_FIELDS_BY_TYPE: Record<string, ReadonlySet<string>> = {
  wall: new Set([
    ...COMMON_FIELDS,
    "start",
    "end",
    "height",
    "thickness",
    "curveOffset",
  ]),
  zone: new Set([...COMMON_FIELDS, "polygon", "color", "autoFromWalls"]),
  slab: new Set([
    ...COMMON_FIELDS,
    "polygon",
    "elevation",
    "autoFromWalls",
    "materialPreset",
  ]),
  ceiling: new Set([
    ...COMMON_FIELDS,
    "polygon",
    "height",
    "autoFromWalls",
    "materialPreset",
  ]),
  door: new Set([
    ...COMMON_FIELDS,
    "width",
    "height",
    "side",
    "position",
    "rotation",
    "doorType",
    "doorCategory",
  ]),
  window: new Set([
    ...COMMON_FIELDS,
    "width",
    "height",
    "sill",
    "side",
    "position",
    "rotation",
    "windowType",
  ]),
  item: new Set([...COMMON_FIELDS, "position", "rotation", "scale"]),
  column: new Set([
    ...COMMON_FIELDS,
    "position",
    "rotation",
    "width",
    "depth",
    "height",
    "style",
    "materialPreset",
  ]),
  fence: new Set([
    ...COMMON_FIELDS,
    "start",
    "end",
    "height",
    "thickness",
    "style",
    "materialPreset",
  ]),
  shelf: new Set([
    ...COMMON_FIELDS,
    "position",
    "rotation",
    "width",
    "depth",
    "height",
    "style",
    "rows",
    "columns",
    "materialPreset",
  ]),
  stair: new Set([
    ...COMMON_FIELDS,
    "position",
    "rotation",
    "width",
    "totalRise",
    "stepCount",
    "thickness",
    "stairType",
    "fromLevelId",
    "toLevelId",
    "materialPreset",
  ]),
  roof: new Set([...COMMON_FIELDS, "position", "rotation", "materialPreset"]),
  "roof-segment": new Set([
    ...COMMON_FIELDS,
    "position",
    "rotation",
    "roofType",
    "width",
    "depth",
    "pitch",
    "wallHeight",
    "materialPreset",
  ]),
  elevator: new Set([
    ...COMMON_FIELDS,
    "position",
    "rotation",
    "width",
    "depth",
  ]),
  spawn: new Set([...COMMON_FIELDS, "position", "rotation"]),
  level: new Set([...COMMON_FIELDS, "level"]),
  building: new Set([...COMMON_FIELDS]),
};

function invalidPatchFields(node: AnyNode, patch: Record<string, unknown>) {
  const allowed = PATCH_FIELDS_BY_TYPE[node.type];
  if (!allowed) return null;
  return Object.keys(patch).filter((key) => !allowed.has(key));
}

export const updateNodeTool: AiTool<UpdateNodeInput> = {
  name: "update_node",
  description:
    "Modifica propiedades de un nodo existente según su tipo: nombre/visibilidad, geometría de muros y cercos, posición/rotación/escala, dimensiones de aberturas y columnas, polígonos de zonas/losas/techos, peldaños de escaleras y pendiente de cubiertas. No cambia el tipo ni el padre.",
  input: updateNodeInput,
  risk: "write",
  async run(args) {
    const blocked = ensureWritable();
    if (blocked) return blocked;

    const nodes = useScene.getState().nodes;
    const node = nodes[args.nodeId as AnyNodeId];
    if (!node) {
      return fail(
        "NODE_NOT_FOUND",
        `No existe el nodo "${args.nodeId}".`,
        "Usá get_level o get_node para obtener un ID válido."
      );
    }

    const patch = args.patch as Record<string, unknown>;
    const invalid = invalidPatchFields(node, patch);
    if (invalid === null) {
      return fail(
        "UNSUPPORTED_NODE",
        `El tipo "${node.type}" no se puede editar con esta tool.`,
        "Usá una tool específica o editá el nodo en el editor."
      );
    }
    if (invalid.length > 0) {
      return fail(
        "UNSUPPORTED_PATCH",
        `El nodo "${node.type}" no acepta: ${invalid.join(", ")}.`,
        `Campos válidos: ${[
          ...(PATCH_FIELDS_BY_TYPE[node.type] ?? []),
        ].join(", ")}.`
      );
    }

    const nextPatch: Record<string, unknown> = { ...patch };
    const warnings: string[] = [];

    if (node.type === "wall") {
      const start =
        (patch.start as [number, number] | undefined) ?? node.start;
      const end = (patch.end as [number, number] | undefined) ?? node.end;
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);

      if (length < MIN_WALL_LENGTH) {
        return fail(
          "WALL_TOO_SHORT",
          "El muro quedaría demasiado corto.",
          `El mínimo es ${MIN_WALL_LENGTH} m.`
        );
      }

      const duplicate = Object.values(nodes).some(
        (other) =>
          other.type === "wall" &&
          other.id !== node.id &&
          other.parentId === node.parentId &&
          sameSegment(other.start, other.end, start, end)
      );
      if (duplicate) {
        return fail(
          "DUPLICATE_WALL",
          "Ya existe otro muro entre esos dos puntos.",
          "Cambiá los extremos o reutilizá el muro existente."
        );
      }

      const nextHeight =
        (patch.height as number | undefined) ?? effectiveWallHeight(node);
      for (const childId of node.children ?? []) {
        const child = nodes[childId as AnyNodeId];
        if (!child || (child.type !== "door" && child.type !== "window")) {
          continue;
        }
        const half = child.width / 2;
        if (
          child.position[0] - half < -0.001 ||
          child.position[0] + half > length + 0.001
        ) {
          return fail(
            "OPENING_OUT_OF_WALL",
            `La abertura "${child.name ?? child.id}" quedaría fuera del muro.`,
            "Mové o borrá la abertura antes de acortar el muro."
          );
        }
        // En el nodo, `position[1]` es el centro de la abertura. El alféizar
        // (altura) se deriva como `position[1] - height / 2`.
        const top =
          child.type === "window"
            ? child.position[1] + child.height / 2
            : child.height;
        if (top > nextHeight + 0.001) {
          return fail(
            "OPENING_TOO_TALL",
            `La abertura "${child.name ?? child.id}" superaría la nueva altura del muro.`,
            "Reducí la altura del muro o de la abertura."
          );
        }
      }
    }

    if (node.type === "fence" && (patch.start || patch.end)) {
      const start =
        (patch.start as [number, number] | undefined) ?? node.start;
      const end = (patch.end as [number, number] | undefined) ?? node.end;
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      if (length < MIN_WALL_LENGTH) {
        return fail(
          "FENCE_TOO_SHORT",
          "El cerco quedaría demasiado corto.",
          `El mínimo es ${MIN_WALL_LENGTH} m.`
        );
      }
    }

    if (node.type === "door" || node.type === "window") {
      const parentWall =
        (node.wallId ? nodes[node.wallId as AnyNodeId] : undefined) ??
        (node.parentId ? nodes[node.parentId as AnyNodeId] : undefined);
      const wall = parentWall?.type === "wall" ? parentWall : null;

      const width = (patch.width as number | undefined) ?? node.width;
      const height = (patch.height as number | undefined) ?? node.height;
      // `WindowNode.sill` es un booleano (si dibuja el alféizar); la altura
      // real del alféizar se deriva de `position[1] - height / 2`.
      const sill =
        node.type === "window"
          ? ((patch.sill as number | undefined) ??
            Math.max(0, node.position[1] - node.height / 2))
          : 0;
      const requestedPosition = patch.position as
        | [number, number, number]
        | undefined;
      const x = requestedPosition?.[0] ?? node.position[0];
      const z = requestedPosition?.[2] ?? node.position[2];

      if (wall) {
        const length = wallLength(wall);
        if (x - width / 2 < -0.001 || x + width / 2 > length + 0.001) {
          return fail(
            "OPENING_OUT_OF_WALL",
            `La abertura quedaría fuera del muro (mide ${length.toFixed(3)} m).`,
            "Ajustá la posición o el ancho."
          );
        }
        const wallHeight = effectiveWallHeight(wall);
        const top = node.type === "window" ? sill + height : height;
        if (top > wallHeight + 0.001) {
          return fail(
            "OPENING_TOO_TALL",
            `La abertura no entra en la altura del muro (${wallHeight.toFixed(3)} m).`,
            "Reducí el alto o el alféizar."
          );
        }
      }

      // La altura local de una abertura es derivada: puerta = height / 2,
      // ventana = sill + height / 2. Se recalcula siempre.
      nextPatch.position = [
        x,
        node.type === "window" ? sill + height / 2 : height / 2,
        z,
      ];
      if (patch.side) {
        nextPatch.rotation = [
          0,
          patch.side === "front" ? 0 : Math.PI,
          0,
        ];
      }
      // `sill` es una entrada de la tool (altura), no el booleano del nodo.
      delete nextPatch.sill;
    }

    if (
      (node.type === "stair" && (patch.fromLevelId !== undefined || patch.toLevelId !== undefined))
    ) {
      for (const field of ["fromLevelId", "toLevelId"] as const) {
        const value = patch[field];
        if (value === undefined) continue;
        const target = nodes[value as AnyNodeId];
        if (!target || target.type !== "level") {
          return fail(
            "LEVEL_NOT_FOUND",
            `El nivel "${String(value)}" no existe.`,
            "Usá get_scene_summary para listar los niveles."
          );
        }
      }
      const from = (patch.fromLevelId ?? node.fromLevelId) as string | null;
      const to = (patch.toLevelId ?? node.toLevelId) as string | null;
      if (from && to && from === to) {
        return fail(
          "INVALID_STAIR_LEVELS",
          "El nivel de origen y el de destino de la escalera no pueden ser el mismo.",
          "Pasá un toLevelId distinto."
        );
      }
    }

    if (patch.polygon !== undefined) {
      const polygon = normalizePolygon(
        patch.polygon as [number, number][]
      );
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
          "Revisá el orden de los vértices."
        );
      }
      if (polygonArea(polygon) < MIN_POLYGON_AREA) {
        return fail(
          "POLYGON_TOO_SMALL",
          `El polígono tiene ${polygonArea(polygon).toFixed(3)} m².`,
          `El mínimo es ${MIN_POLYGON_AREA} m².`
        );
      }
      nextPatch.polygon = polygon;
    }

    runAsSingleSceneHistoryStep(useScene, () => {
      useScene.getState().updateNode(
        node.id as AnyNodeId,
        nextPatch as Partial<AnyNode>
      );
    });

    const updated = useScene.getState().nodes[node.id as AnyNodeId] ?? node;
    return ok(
      {
        node: compactNode(updated),
        ...(node.type === "wall" && (patch.start || patch.end)
          ? {
              length: Math.round(wallLength(updated as WallNode) * 1000) / 1000,
            }
          : {}),
      },
      warnings
    );
  },
};

const deleteNodeInput = z.object({
  nodeId: z.string().describe("ID del nodo a borrar."),
  cascade: z
    .boolean()
    .default(false)
    .describe("Permite borrar un nodo con hijos, como un nivel o un muro con aberturas."),
});

export type DeleteNodeInput = z.infer<typeof deleteNodeInput>;

export const deleteNodeTool: AiTool<DeleteNodeInput> = {
  name: "delete_node",
  description:
    "Borra un nodo y, si tiene hijos, exige cascade=true. Un muro borra sus puertas y ventanas; un nivel borra todo su contenido. Protege el terreno y evita quedarse sin niveles.",
  input: deleteNodeInput,
  risk: "destructive",
  async run(args) {
    const blocked = ensureWritable();
    if (blocked) return blocked;

    const nodes = useScene.getState().nodes;
    const node = nodes[args.nodeId as AnyNodeId];
    if (!node) {
      return fail(
        "NODE_NOT_FOUND",
        `No existe el nodo "${args.nodeId}".`,
        "Usá get_scene_summary o get_level para obtener un ID válido."
      );
    }

    if (node.type === "site") {
      return fail(
        "PROTECTED_NODE",
        "No se puede borrar el terreno desde esta tool.",
        "Borrá o editá el edificio o los niveles."
      );
    }

    if (node.type === "level") {
      const levelCount = Object.values(nodes).filter(
        (candidate) => candidate.type === "level"
      ).length;
      if (levelCount <= 1) {
        return fail(
          "LAST_LEVEL_PROTECTED",
          "No se puede borrar el único nivel de la escena.",
          "Creá otro nivel antes de borrar este."
        );
      }
    }

    if (node.type === "building") {
      const levelsOutside = Object.values(nodes).filter(
        (candidate) =>
          candidate.type === "level" && candidate.parentId !== node.id
      ).length;
      if (levelsOutside === 0) {
        return fail(
          "LAST_LEVEL_PROTECTED",
          "Borrar este edificio dejaría la escena sin niveles.",
          "Creá un nivel en otro edificio antes de borrarlo."
        );
      }
    }

    const ids = descendants(nodes, node.id);
    const hasChildren = ids.length > 1;
    if (hasChildren && !args.cascade) {
      return fail(
        "CASCADE_REQUIRED",
        `"${node.name ?? node.id}" tiene ${ids.length - 1} nodo(s) hijo(s).`,
        "Repetí la llamada con cascade=true si querés borrar todo el contenido."
      );
    }

    runAsSingleSceneHistoryStep(useScene, () => {
      useScene.getState().deleteNode(node.id as AnyNodeId);
    });

    return ok({
      deletedId: node.id,
      type: node.type,
      deletedCount: ids.length,
    });
  },
};
