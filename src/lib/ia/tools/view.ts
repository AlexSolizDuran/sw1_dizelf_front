"use client";

import {
  type AnyNode,
  type AnyNodeId,
  type BuildingNode,
  type LevelNode,
  resolveLevelId,
  sceneRegistry,
  useScene,
} from "@pascal-app/core";
import { useEditor } from "@pascal-app/editor";
import { useViewer } from "@pascal-app/viewer";
import { Box3, Vector3 } from "three";
import { z } from "zod";
import type { AiTool } from "../tool-types";
import { fail, ok } from "../tool-types";

const selectLevelInput = z.object({
  levelId: z.string().describe("ID del nivel que se quiere activar."),
  openFloorplan: z
    .boolean()
    .default(false)
    .describe("Si es true, abre además el panel de planta 2D."),
});

export type SelectLevelInput = z.infer<typeof selectLevelInput>;

export const selectLevelTool: AiTool<SelectLevelInput> = {
  name: "select_level",
  description:
    "Cambia el nivel activo del editor sin modificar la escena. Útil antes de crear o inspeccionar contenido de otra planta.",
  input: selectLevelInput,
  risk: "read",
  async run(args) {
    const nodes = useScene.getState().nodes;
    const level = nodes[args.levelId as AnyNodeId];
    if (!level || level.type !== "level") {
      return fail(
        "LEVEL_NOT_FOUND",
        `No existe el nivel "${args.levelId}".`,
        "Usá get_scene_summary para listar los niveles."
      );
    }

    const buildingId = (level.parentId as BuildingNode["id"] | null) ?? null;
    useViewer.getState().setSelection({
      buildingId,
      levelId: level.id as LevelNode["id"],
      zoneId: null,
      selectedIds: [],
    });

    if (args.openFloorplan) {
      useEditor.getState().setFloorplanOpen(true);
    }

    return ok({
      levelId: level.id,
      buildingId,
      name: level.name ?? `Nivel ${level.level + 1}`,
      level: level.level,
    });
  },
};

const focusNodeInput = z.object({
  nodeId: z.string().describe("ID del nodo a enfocar."),
});

export type FocusNodeInput = z.infer<typeof focusNodeInput>;

function nodeBounds(node: AnyNode): {
  center: [number, number, number];
  size: [number, number, number];
} {
  const object = sceneRegistry.nodes.get(node.id);
  if (object) {
    const box = new Box3().setFromObject(object);
    if (!box.isEmpty()) {
      const center = box.getCenter(new Vector3());
      const size = box.getSize(new Vector3());
      return {
        center: [center.x, center.y, center.z],
        size: [size.x, size.y, size.z],
      };
    }
  }

  const record = node as unknown as Record<string, unknown>;
  const position = record.position;
  if (Array.isArray(position) && position.length === 3) {
    return {
      center: [position[0], position[1], position[2]],
      size: [1, 1, 1],
    };
  }

  const start = record.start;
  const end = record.end;
  if (Array.isArray(start) && Array.isArray(end)) {
    return {
      center: [
        (start[0] + end[0]) / 2,
        1.25,
        (start[1] + end[1]) / 2,
      ],
      size: [Math.abs(end[0] - start[0]), 2.5, Math.abs(end[1] - start[1])],
    };
  }

  return { center: [0, 0, 0], size: [1, 1, 1] };
}

export const focusNodeTool: AiTool<FocusNodeInput> = {
  name: "focus_node",
  description:
    "Selecciona un nodo y acerca la cámara 3D a su posición usando la sincronización de navegación del editor. También activa el nivel del nodo.",
  input: focusNodeInput,
  risk: "read",
  async run(args) {
    const nodes = useScene.getState().nodes;
    const node = nodes[args.nodeId as AnyNodeId];
    if (!node) {
      return fail(
        "NODE_NOT_FOUND",
        `No existe el nodo "${args.nodeId}".`,
        "Usá get_level o get_node para obtener un ID válido."
      );
    }

    let levelId: string | null = null;
    try {
      levelId = resolveLevelId(node, nodes);
    } catch {
      levelId = null;
    }

    const level = levelId ? nodes[levelId as AnyNodeId] : undefined;
    const buildingId =
      level && level.type === "level"
        ? ((level.parentId as BuildingNode["id"] | null) ?? null)
        : null;

    useViewer.getState().setSelection({
      buildingId,
      levelId: (levelId as LevelNode["id"] | null) ?? null,
      zoneId: null,
      selectedIds: [node.id],
    });

    const { center, size } = nodeBounds(node);
    const viewWidth = Math.max(4, Math.max(size[0], size[2]) * 2.5);

    const editor = useEditor.getState();
    editor.publishNavigationSyncPose({
      source: "2d",
      target: center,
      azimuth: editor.navigationSyncPose?.azimuth ?? Math.PI / 4,
      viewWidth,
    });

    return ok({
      nodeId: node.id,
      type: node.type,
      levelId,
      buildingId,
      target: center,
      viewWidth,
    });
  },
};
