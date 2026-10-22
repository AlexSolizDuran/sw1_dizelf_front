"use client";

import {
  type AnyNode,
  type AnyNodeId,
  type WallNode,
  runAsSingleSceneHistoryStep,
  useScene,
} from "@pascal-app/core";
import { z } from "zod";
import type { AiTool } from "../types";
import { fail, ok } from "../types";
import {
  MIN_WALL_LENGTH,
  compactNode,
  descendants,
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
    rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
    scale: z.tuple([z.number(), z.number(), z.number()]).optional(),
    width: z.number().min(0.05).max(20).optional(),
    depth: z.number().min(0.05).max(20).optional(),
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

export const updateNodeTool: AiTool<UpdateNodeInput> = {
  name: "update_node",
  description:
    "Modifica propiedades de un nodo existente: nombre, visibilidad, geometría de muro, posición/rotación/escala de objetos, dimensiones de aberturas o elevación de losa. No cambia el tipo ni el padre.",
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
    const warnings: string[] = [];

    if (node.type === "wall") {
      const start = (patch.start as [number, number] | undefined) ?? node.start;
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

      for (const childId of node.children ?? []) {
        const child = nodes[childId as AnyNodeId];
        if (!child || (child.type !== "door" && child.type !== "window")) {
          continue;
        }
        const half = child.width / 2;
        if (child.position[0] - half < -0.001 || child.position[0] + half > length + 0.001) {
          return fail(
            "OPENING_OUT_OF_WALL",
            `La abertura "${child.name ?? child.id}" quedaría fuera del muro.`,
            "Mové o borrá la abertura antes de acortar el muro."
          );
        }
      }
    }

    if (
      (patch.position || patch.rotation || patch.scale) &&
      !["item", "door", "window", "column", "stair", "spawn"].includes(node.type)
    ) {
      return fail(
        "UNSUPPORTED_PATCH",
        `El nodo "${node.type}" no acepta position/rotation/scale en esta tool.`
      );
    }

    if (
      (patch.width || patch.height) &&
      !["wall", "door", "window", "item", "column", "fence", "roof"].includes(
        node.type
      )
    ) {
      return fail(
        "UNSUPPORTED_PATCH",
        `El nodo "${node.type}" no acepta width/height en esta tool.`
      );
    }

    if (patch.elevation && node.type !== "slab") {
      return fail(
        "UNSUPPORTED_PATCH",
        "elevation solo se puede usar en losas."
      );
    }

    if (patch.level !== undefined && node.type !== "level") {
      return fail(
        "UNSUPPORTED_PATCH",
        "level solo se puede usar en niveles."
      );
    }

    runAsSingleSceneHistoryStep(useScene, () => {
      useScene.getState().updateNode(
        node.id as AnyNodeId,
        patch as Partial<AnyNode>
      );
    });

    const updated = useScene.getState().nodes[node.id as AnyNodeId] ?? node;
    return ok(
      {
        node: compactNode(updated),
        ...(node.type === "wall" && (patch.start || patch.end)
          ? {
              length: Math.round(
                wallLength(updated as WallNode) * 1000
              ) / 1000,
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
    "Borra un nodo y, si tiene hijos, exige cascade=true. Un muro borra sus puertas y ventanas; un nivel borra todo su contenido.",
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
