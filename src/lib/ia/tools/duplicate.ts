"use client";

import {
  type AnyNode,
  type AnyNodeId,
  type BuildingNode,
  type LevelNode,
  cloneLevelSubtree,
  cloneNodesInto,
  collectSubtree,
  runAsSingleSceneHistoryStep,
  useScene,
} from "@pascal-app/core";
import { useViewer } from "@pascal-app/viewer";
import { z } from "zod";
import type { AiTool } from "../tool-types";
import { fail, ok } from "../tool-types";

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

/**
 * Refuerza las referencias de host que los clonadores no cubren del todo:
 * `cloneNodesInto` es genérico y no toca `wallId`/`roofSegmentId`, y ninguno
 * de los dos reescribe `boundaryWallIds` ni `fromLevelId`/`toLevelId`.
 *
 * Es idempotente: si un ID ya fue remapeado, no vuelve a aparecer en el mapa
 * y se conserva tal cual.
 */
function remapHostReferences(
  nodes: readonly AnyNode[],
  idMap: ReadonlyMap<string, string>
) {
  for (const node of nodes) {
    const record = node as unknown as Record<string, unknown>;

    for (const key of ["wallId", "roofSegmentId", "fromLevelId", "toLevelId"]) {
      const value = record[key];
      if (typeof value === "string") {
        record[key] = idMap.get(value) ?? value;
      }
    }

    const boundaryWallIds = record.boundaryWallIds;
    if (Array.isArray(boundaryWallIds)) {
      record.boundaryWallIds = boundaryWallIds.map((id) =>
        typeof id === "string" ? (idMap.get(id) ?? id) : id
      );
    }
  }
}

function offsetRoot(root: AnyNode, offset: [number, number, number]) {
  if (offset.every((value) => value === 0)) return;

  const record = root as unknown as Record<string, unknown>;
  const position = record.position;
  if (Array.isArray(position) && position.length === 3) {
    record.position = [
      position[0] + offset[0],
      position[1] + offset[1],
      position[2] + offset[2],
    ];
    return;
  }

  const start = record.start;
  const end = record.end;
  if (Array.isArray(start) && Array.isArray(end)) {
    record.start = [start[0] + offset[0], start[1] + offset[2]];
    record.end = [end[0] + offset[0], end[1] + offset[2]];
  }
}

const duplicateNodeInput = z.object({
  nodeId: z.string().describe("ID del nodo a duplicar."),
  offset: z
    .tuple([z.number(), z.number(), z.number()])
    .default([0, 0, 0])
    .describe("Desplazamiento [dx, dy, dz] aplicado al nodo raíz."),
  name: z.string().min(1).max(80).optional(),
  targetLevelId: z
    .string()
    .optional()
    .describe(
      "Nivel de destino para nodos que cuelgan directamente de un nivel."
    ),
});

export type DuplicateNodeInput = z.infer<typeof duplicateNodeInput>;

export const duplicateNodeTool: AiTool<DuplicateNodeInput> = {
  name: "duplicate_node",
  description:
    "Duplica un nodo y todo su subárbol con IDs nuevos, remapeando referencias internas (muros, paños de cubierta, límites de zonas y niveles de escaleras).",
  input: duplicateNodeInput,
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

    if (node.type === "level") {
      return fail(
        "USE_DUPLICATE_LEVEL",
        "Los niveles se duplican con duplicate_level.",
        "Llamá a duplicate_level con este levelId."
      );
    }

    const subtree = collectSubtree(nodes, node.id as AnyNodeId);
    if (!subtree) {
      return fail(
        "NODE_NOT_FOUND",
        "No se pudo leer el subárbol del nodo.",
        "Revisá que el nodo siga existiendo."
      );
    }

    const warnings: string[] = [];
    let parentId: AnyNodeId | undefined =
      (node.parentId as AnyNodeId | null) ?? undefined;

    if (args.targetLevelId) {
      const target = nodes[args.targetLevelId as AnyNodeId];
      if (!target || target.type !== "level") {
        return fail(
          "LEVEL_NOT_FOUND",
          `No existe el nivel "${args.targetLevelId}".`,
          "Usá get_scene_summary para listar los niveles."
        );
      }

      const originalParent = node.parentId
        ? nodes[node.parentId as AnyNodeId]
        : undefined;
      if (originalParent?.type === "level") {
        parentId = target.id as AnyNodeId;
      } else {
        warnings.push(
          "El nodo cuelga de otro contenedor (muro, techo o cubierta); se conserva ese padre."
        );
      }
    }

    const cloned = cloneNodesInto(
      [subtree.root, ...subtree.descendants],
      {
        rootId: node.id as AnyNodeId,
        ...(parentId ? { parentId } : {}),
      }
    );

    const rootClone = cloned.nodes[0];
    if (rootClone && args.name) {
      (rootClone as unknown as Record<string, unknown>).name = args.name;
    }
    if (rootClone) {
      offsetRoot(rootClone, args.offset);
    }

    remapHostReferences(cloned.nodes, cloned.idMap);

    runAsSingleSceneHistoryStep(useScene, () => {
      useScene.getState().applyNodeChanges({
        create: cloned.nodes.map((clonedNode) => ({
          node: clonedNode,
          ...(clonedNode.parentId
            ? { parentId: clonedNode.parentId as AnyNodeId }
            : {}),
        })),
      });
    });

    return ok(
      {
        sourceId: node.id,
        newRootId: cloned.rootId,
        type: node.type,
        clonedCount: cloned.nodes.length,
        parentId: parentId ?? null,
      },
      warnings
    );
  },
};

const duplicateLevelInput = z.object({
  levelId: z.string().describe("ID del nivel a duplicar."),
  name: z.string().min(1).max(80).optional(),
  select: z
    .boolean()
    .default(false)
    .describe("Si es true, deja el nivel nuevo seleccionado."),
});

export type DuplicateLevelInput = z.infer<typeof duplicateLevelInput>;

export const duplicateLevelTool: AiTool<DuplicateLevelInput> = {
  name: "duplicate_level",
  description:
    "Duplica un nivel completo con todo su contenido y desplaza +1 los niveles superiores, igual que el selector de pisos del editor.",
  input: duplicateLevelInput,
  risk: "write",
  async run(args) {
    const blocked = ensureWritable();
    if (blocked) return blocked;

    const nodes = useScene.getState().nodes;
    const level = nodes[args.levelId as AnyNodeId];
    if (!level || level.type !== "level") {
      return fail(
        "LEVEL_NOT_FOUND",
        `No existe el nivel "${args.levelId}".`,
        "Usá get_scene_summary para listar los niveles."
      );
    }

    // Las escenas nuevas del editor pueden tener el nivel solo en
    // `building.children`, sin `parentId` en el nodo. Se resuelve el edificio
    // por parentId y, si falta, por pertenencia en `children`.
    const directBuilding = level.parentId
      ? nodes[level.parentId as AnyNodeId]
      : undefined;
    const building =
      directBuilding?.type === "building"
        ? directBuilding
        : Object.values(nodes).find(
            (candidate): candidate is BuildingNode =>
              candidate.type === "building" &&
              Array.isArray(candidate.children) &&
              candidate.children.includes(level.id)
          );

    if (!building) {
      return fail(
        "BUILDING_NOT_FOUND",
        "El nivel no cuelga de un edificio.",
        "Creá el edificio/nivel con create_level antes de duplicar."
      );
    }

    const buildingId = building.id as AnyNodeId;
    const belongsToBuilding = (candidate: LevelNode): boolean =>
      candidate.parentId === buildingId ||
      (!candidate.parentId &&
        Array.isArray(building.children) &&
        building.children.includes(candidate.id));

    const shifting = Object.values(nodes).filter(
      (candidate): candidate is LevelNode =>
        candidate.type === "level" &&
        belongsToBuilding(candidate) &&
        candidate.level > level.level
    );

    const { clonedNodes, newLevelId, idMap } = cloneLevelSubtree(
      nodes,
      level.id as AnyNodeId
    );

    remapHostReferences(clonedNodes, idMap);

    // Una escalera del nivel clonado que apuntaba al nivel original debe
    // apuntar al clon; las referencias a otros niveles conservan su ID.
    for (const clonedNode of clonedNodes) {
      const record = clonedNode as unknown as Record<string, unknown>;
      for (const key of ["fromLevelId", "toLevelId"]) {
        if (record[key] === level.id) {
          record[key] = newLevelId;
        }
      }
    }

    const newLevelName =
      args.name ?? `${level.name ?? `Nivel ${level.level + 1}`} (copia)`;

    const createOps = clonedNodes.map((clonedNode) => {
      const isLevel = clonedNode.id === newLevelId;
      if (isLevel) {
        const record = clonedNode as unknown as Record<string, unknown>;
        record.level = level.level + 1;
        record.name = newLevelName;
        record.parentId = buildingId;
      }
      return {
        node: clonedNode,
        ...(clonedNode.parentId
          ? { parentId: clonedNode.parentId as AnyNodeId }
          : { parentId: buildingId as AnyNodeId }),
      };
    });

    runAsSingleSceneHistoryStep(useScene, () => {
      useScene.getState().applyNodeChanges({
        update: shifting.map((candidate) => ({
          id: candidate.id as AnyNodeId,
          data: { level: candidate.level + 1 } as Partial<AnyNode>,
        })),
        create: createOps,
      });
    });

    if (args.select) {
      useViewer.getState().setSelection({
        buildingId: buildingId as BuildingNode["id"],
        levelId: newLevelId as LevelNode["id"],
        zoneId: null,
        selectedIds: [],
      });
    }

    return ok({
      sourceLevelId: level.id,
      newLevelId,
      level: level.level + 1,
      name: newLevelName,
      clonedCount: clonedNodes.length,
      shiftedLevelIds: shifting.map((candidate) => candidate.id),
    });
  },
};
