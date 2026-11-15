"use client";

import {
  type AnyNode,
  type AnyNodeId,
  getCatalogMaterialById,
  parseMaterialRef,
  toLibraryMaterialRef,
  useScene,
  ItemNode as ItemSchema,
  runAsSingleSceneHistoryStep,
} from "@pascal-app/core";
import { z } from "zod";
import { CATALOG_BY_ID } from "@/lib/editor/catalog-es";
import type { AiTool } from "../tool-types";
import { fail, ok } from "../tool-types";
import { effectiveWallHeight, findLevel, wallLength } from "./helpers";

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

const placeItemInput = z.object({
  catalogId: z.string().describe("ID del catálogo devuelto por search_catalog."),
  levelId: z
    .string()
    .optional()
    .describe("Nivel para objetos de piso. Si se omite, usa el activo."),
  name: z.string().min(1).max(80).optional(),
  position: z
    .tuple([z.number(), z.number(), z.number()])
    .optional()
    .describe("Posición [x, y, z] para objetos de piso o de techo."),
  rotation: z
    .tuple([z.number(), z.number(), z.number()])
    .default([0, 0, 0]),
  scale: z
    .tuple([z.number(), z.number(), z.number()])
    .default([1, 1, 1]),
  wallId: z
    .string()
    .optional()
    .describe("Muro host para objetos con attachTo wall o wall-side."),
  distanceFromStart: z
    .number()
    .min(0)
    .optional()
    .describe("Posición sobre el muro, en metros desde su inicio. Por defecto, el centro."),
  side: z.enum(["front", "back"]).default("front"),
  ceilingId: z
    .string()
    .optional()
    .describe("Techo host para objetos con attachTo ceiling."),
});

export type PlaceItemInput = z.infer<typeof placeItemInput>;

export const placeItemTool: AiTool<PlaceItemInput> = {
  name: "place_item",
  description:
    "Coloca un mueble u objeto del catálogo. Para objetos de piso, usar position [x, y, z] y el nivel. Para objetos de pared o techo, pasar wallId o ceilingId.",
  input: placeItemInput,
  risk: "write",
  async run(args, ctx) {
    const blocked = ensureWritable();
    if (blocked) return blocked;

    const asset = CATALOG_BY_ID.get(args.catalogId);
    if (!asset) {
      return fail(
        "CATALOG_ITEM_NOT_FOUND",
        `No existe el objeto "${args.catalogId}" en el catálogo.`,
        "Usá search_catalog para obtener un catalogId válido."
      );
    }

    const nodes = useScene.getState().nodes;
    const dimensions = asset.dimensions ?? [1, 1, 1];
    const itemHeight = dimensions[1] ?? 1;
    let parentId: AnyNodeId | null = null;
    let position: [number, number, number] = args.position ?? [0, 0, 0];
    let rotation: [number, number, number] = args.rotation;
    let side: "front" | "back" | undefined;
    let wallId: string | undefined;

    if (args.wallId) {
      const wall = nodes[args.wallId as AnyNodeId];
      if (!wall || wall.type !== "wall") {
        return fail(
          "WALL_NOT_FOUND",
          `No existe el muro "${args.wallId}".`,
          "Usá get_level para listar los muros."
        );
      }
      if (asset.attachTo !== "wall" && asset.attachTo !== "wall-side") {
        return fail(
          "INVALID_HOST",
          `"${asset.name}" no es un objeto de pared.`,
          "Colocalo en el piso con position y sin wallId."
        );
      }

      const length = wallLength(wall);
      const distance = args.distanceFromStart ?? length / 2;
      const half = dimensions[0] / 2;

      if (distance - half < 0.02 || distance + half > length - 0.02) {
        return fail(
          "ITEM_OUT_OF_WALL",
          `"${asset.name}" no entra en el muro seleccionado.`,
          "Ajustá distanceFromStart o elegí otro muro."
        );
      }
      if (itemHeight > effectiveWallHeight(wall)) {
        return fail(
          "ITEM_TOO_TALL",
          `"${asset.name}" es más alto que el muro.`,
          "Elegí otro objeto o un muro más alto."
        );
      }

      parentId = wall.id as AnyNodeId;
      wallId = wall.id;
      side = args.side;
      position = [
        distance,
        Math.max(0, (effectiveWallHeight(wall) - itemHeight) / 2),
        0,
      ];
      rotation = [0, args.side === "front" ? 0 : Math.PI, 0];
    } else if (args.ceilingId) {
      const ceiling = nodes[args.ceilingId as AnyNodeId];
      if (!ceiling || ceiling.type !== "ceiling") {
        return fail(
          "CEILING_NOT_FOUND",
          `No existe el techo "${args.ceilingId}".`,
          "Usá get_level para listar los techos."
        );
      }
      if (asset.attachTo !== "ceiling") {
        return fail(
          "INVALID_HOST",
          `"${asset.name}" no es un objeto de techo.`,
          "Colocalo en el piso o en una pared según su attachTo."
        );
      }

      parentId = ceiling.id as AnyNodeId;
      position = [
        args.position?.[0] ?? 0,
        asset.recessed ? 0 : -itemHeight,
        args.position?.[2] ?? 0,
      ];
    } else {
      if (asset.attachTo) {
        return fail(
          "HOST_REQUIRED",
          `"${asset.name}" se monta en ${asset.attachTo}.`,
          "Pasá wallId para paredes o ceilingId para techos."
        );
      }
      const level = findLevel(nodes, args.levelId ?? ctx.levelId);
      if (!level) {
        return fail(
          "LEVEL_NOT_FOUND",
          "No se encontró el nivel para colocar el objeto.",
          "Usá get_scene_summary para obtener un levelId."
        );
      }
      parentId = level.id as AnyNodeId;
    }

    if (!parentId) {
      return fail("PARENT_NOT_FOUND", "No se pudo resolver el contenedor del objeto.");
    }

    const item = ItemSchema.parse({
      name: args.name ?? asset.name,
      asset,
      position,
      rotation,
      scale: args.scale,
      parentId,
      ...(wallId ? { wallId, side } : {}),
    });

    runAsSingleSceneHistoryStep(useScene, () => {
      useScene.getState().applyNodeChanges({
        create: [{ node: item as AnyNode, parentId }],
      });
    });

    return ok({
      itemId: item.id,
      catalogId: asset.id,
      name: item.name,
      parentId,
      wallId: wallId ?? null,
      position,
    });
  },
};

const paintSurfaceInput = z
  .object({
    nodeId: z.string().describe("Nodo a pintar: muro, losa, techo, objeto, puerta o ventana."),
    materialId: z
      .string()
      .optional()
      .describe("ID de material de biblioteca devuelto por search_materials."),
    materialRef: z
      .string()
      .optional()
      .describe("Referencia explícita: library:<id> o scene:<id>."),
    surface: z
      .string()
      .optional()
      .describe(
        "Superficie o slot: interior, exterior, both, surface, panel, glass, frame. Si se omite, usa el valor por defecto del tipo."
      ),
    reset: z
      .boolean()
      .default(false)
      .describe("Si es true, quita la pintura y vuelve al material por defecto."),
  })
  .refine(
    (value) => value.reset || Boolean(value.materialId || value.materialRef),
    "Indicá materialId, materialRef o reset."
  );

export type PaintSurfaceInput = z.infer<typeof paintSurfaceInput>;

export const paintSurfaceTool: AiTool<PaintSurfaceInput> = {
  name: "paint_surface",
  description:
    "Pinta una superficie con un material de biblioteca o de escena. En muros usa slots interior/exterior; en losas y techos usa materialPreset; en objetos usa el slot surface.",
  input: paintSurfaceInput,
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

    if (args.reset) {
      const patch = resetPatch(node);
      runAsSingleSceneHistoryStep(useScene, () => {
        useScene.getState().updateNode(node.id as AnyNodeId, patch);
      });
      return ok({ nodeId: node.id, reset: true });
    }

    const ref =
      args.materialRef ??
      (args.materialId ? toLibraryMaterialRef(args.materialId) : null);
    if (!ref) {
      return fail(
        "MATERIAL_REQUIRED",
        "No se indicó un material.",
        "Pasá materialId o materialRef."
      );
    }

    const parsed = parseMaterialRef(ref);
    if (!parsed) {
      return fail(
        "INVALID_MATERIAL_REF",
        `La referencia "${ref}" no es válida.`,
        "Usá library:<id> o scene:<id>."
      );
    }

    if (parsed.kind === "library" && !getCatalogMaterialById(parsed.id)) {
      return fail(
        "MATERIAL_NOT_FOUND",
        `No existe el material de biblioteca "${parsed.id}".`,
        "Usá search_materials para obtener un materialId válido."
      );
    }

    if (parsed.kind === "scene" && !useScene.getState().materials[parsed.id as never]) {
      return fail(
        "MATERIAL_NOT_FOUND",
        `No existe el material de escena "${parsed.id}".`,
        "Usá search_materials para elegir un material de biblioteca."
      );
    }

    if (node.type === "wall") {
      const surface = args.surface ?? "both";
      if (!["interior", "exterior", "both"].includes(surface)) {
        return fail(
          "INVALID_SURFACE",
          `La superficie "${surface}" no es válida para un muro.`,
          "Usá interior, exterior o both."
        );
      }

      const slots = { ...(node.slots ?? {}) };
      if (surface === "both") {
        slots.interior = ref;
        slots.exterior = ref;
      } else {
        slots[surface] = ref;
      }

      runAsSingleSceneHistoryStep(useScene, () => {
        useScene.getState().updateNode(node.id as AnyNodeId, { slots });
      });
      return ok({ nodeId: node.id, surface, materialRef: ref });
    }

    if (node.type === "door" || node.type === "window") {
      const surface =
        args.surface ?? (node.type === "door" ? "panel" : "frame");
      const allowed =
        node.type === "door" ? ["panel", "glass"] : ["frame", "glass"];
      if (!allowed.includes(surface)) {
        return fail(
          "INVALID_SURFACE",
          `La superficie "${surface}" no es válida para ${node.type}.`,
          `Usá ${allowed.join(" o ")}.`
        );
      }
      const slots = { ...(node.slots ?? {}), [surface]: ref };
      runAsSingleSceneHistoryStep(useScene, () => {
        useScene.getState().updateNode(node.id as AnyNodeId, { slots });
      });
      return ok({ nodeId: node.id, surface, materialRef: ref });
    }

    if (node.type === "item") {
      const surface = args.surface ?? "surface";
      const slots = { ...(node.slots ?? {}), [surface]: ref };
      runAsSingleSceneHistoryStep(useScene, () => {
        useScene.getState().updateNode(node.id as AnyNodeId, { slots });
      });
      return ok({ nodeId: node.id, surface, materialRef: ref });
    }

    if (
      node.type === "slab" ||
      node.type === "ceiling" ||
      node.type === "column" ||
      node.type === "fence" ||
      node.type === "shelf"
    ) {
      runAsSingleSceneHistoryStep(useScene, () => {
        useScene.getState().updateNode(node.id as AnyNodeId, {
          materialPreset: ref,
        });
      });
      return ok({ nodeId: node.id, surface: "surface", materialRef: ref });
    }

    return fail(
      "UNSUPPORTED_NODE",
      `No se puede pintar un nodo de tipo "${node.type}" con esta tool.`,
      "Usá un muro, losa, techo, objeto, puerta o ventana."
    );
  },
};

function resetPatch(node: AnyNode): Partial<AnyNode> {
  if (node.type === "wall") {
    return { slots: undefined } as Partial<AnyNode>;
  }
  if (node.type === "door" || node.type === "window" || node.type === "item") {
    return { slots: undefined } as Partial<AnyNode>;
  }
  return {
    material: undefined,
    materialPreset: undefined,
    slots: undefined,
  } as Partial<AnyNode>;
}
