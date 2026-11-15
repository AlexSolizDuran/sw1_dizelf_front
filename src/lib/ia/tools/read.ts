"use client";

import {
  type AnyNode,
  type AnyNodeId,
  type DoorNode,
  type ItemNode,
  type LevelNode,
  type WindowNode,
  type ZoneNode,
  MATERIAL_CATALOG,
  MATERIAL_CATEGORIES,
  MATERIAL_SURFACES,
  resolveLevelId,
  toLibraryMaterialRef,
  useScene,
} from "@pascal-app/core";
import { z } from "zod";
import { CATALOG_ES_ITEMS } from "@/lib/editor/catalog-es";
import type { AiTool, ToolContext } from "../tool-types";
import { fail, ok } from "../tool-types";
import {
  childrenOfType,
  compactNode,
  countTypes,
  findLevel,
  levelIdOf,
  polygonArea,
  polygonPerimeter,
  round,
  wallLength,
} from "./helpers";

const LEVEL_INCLUDE = [
  "walls",
  "zones",
  "openings",
  "items",
  "slabs",
  "ceilings",
  "columns",
  "stairs",
  "roofs",
  "shelves",
  "fences",
  "elevators",
  "spawns",
  "chimneys",
  "roofSegments",
  "stairSegments",
] as const;

type LevelInclude = (typeof LEVEL_INCLUDE)[number];

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * La biblioteca de materiales está en inglés. Estos alias permiten que una
 * búsqueda en español (“madera”, “blanco”, “vidrio”) encuentre el preset.
 */
const MATERIAL_SEARCH_ALIASES: Record<string, string[]> = {
  blanco: ["white"],
  negro: ["black"],
  gris: ["grey", "gray"],
  beige: ["beige", "cream"],
  crema: ["cream"],
  madera: ["wood", "oak", "walnut", "pine", "timber"],
  piedra: ["stone", "marble", "granite", "travertine"],
  marmol: ["marble"],
  ladrillo: ["brick"],
  baldosa: ["tile", "ceramic", "porcelain"],
  ceramica: ["ceramic", "tile"],
  hormigon: ["concrete"],
  revoco: ["plaster"],
  yeso: ["plaster"],
  metal: ["metal", "steel", "aluminum", "aluminium"],
  acero: ["steel"],
  tela: ["fabric", "textile", "linen", "cotton"],
  cuero: ["leather"],
  teja: ["roof", "shingle", "roofing"],
  cubierta: ["roof", "roofing"],
  terreno: ["ground", "grass", "gravel", "soil"],
  cesped: ["grass"],
  vidrio: ["glass"],
  transparente: ["glass", "transparent"],
};

function sceneMaterialList(nodes: Record<AnyNodeId, AnyNode>) {
  return Object.values(nodes)
    .filter((node): node is ItemNode => node.type === "item")
    .length;
}

export const getSceneSummaryTool: AiTool<Record<string, never>> = {
  name: "get_scene_summary",
  description:
    "Devuelve un resumen compacto de la escena: edificios, niveles, conteos por tipo, nivel activo, materiales y estado de solo lectura. Usar antes de escribir para no inventar IDs.",
  input: z.object({}),
  risk: "read",
  async run(_args, ctx: ToolContext) {
    const nodes = useScene.getState().nodes;
    const totals = countTypes(nodes);

    const levels = Object.values(nodes)
      .filter((node): node is LevelNode => node.type === "level")
      .sort((a, b) => a.level - b.level)
      .map((level) => {
        const levelId = level.id as AnyNodeId;
        const counts: Record<string, number> = {};
        for (const node of Object.values(nodes)) {
          if (levelIdOf(node, nodes) !== levelId) continue;
          counts[node.type] = (counts[node.type] ?? 0) + 1;
        }
        const building = level.parentId
          ? nodes[level.parentId as AnyNodeId]
          : undefined;
        return {
          id: level.id,
          name: level.name ?? `Nivel ${level.level + 1}`,
          level: level.level,
          buildingId: level.parentId,
          buildingName: building?.name ?? null,
          counts,
        };
      });

    const buildings = Object.values(nodes)
      .filter((node) => node.type === "building")
      .map((building) => ({
        id: building.id,
        name: building.name ?? building.id,
        levelIds:
          "children" in building && Array.isArray(building.children)
            ? building.children.filter((id) => {
                const child = nodes[id as AnyNodeId];
                return child?.type === "level";
              })
            : [],
      }));

    const sceneMaterials = Object.values(useScene.getState().materials).map(
      (material) => ({
        id: material.id,
        name: material.name,
        ref: `scene:${material.id}`,
      })
    );

    return ok({
      units: "m",
      coords: "plano [x, z]; y es la altura",
      readOnly: useScene.getState().readOnly,
      activeLevelId: ctx.levelId,
      rootNodeIds: useScene.getState().rootNodeIds,
      totals,
      buildings,
      levels,
      materials: {
        libraryCount: MATERIAL_CATALOG.length,
        scene: sceneMaterials,
      },
      itemsInScene: sceneMaterialList(nodes),
    });
  },
};

const getLevelInput = z.object({
  levelId: z
    .string()
    .optional()
    .describe("ID del nivel. Si se omite, usa el nivel activo o el primero."),
  include: z
    .array(z.enum(LEVEL_INCLUDE))
    .optional()
    .describe("Secciones a devolver. Si se omite, devuelve todas."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .default(200)
    .describe("Máximo de nodos por sección."),
});

export type GetLevelInput = z.infer<typeof getLevelInput>;

function take<T>(items: T[], limit: number): { items: T[]; truncated: boolean } {
  return items.length > limit
    ? { items: items.slice(0, limit), truncated: true }
    : { items, truncated: false };
}

export const getLevelTool: AiTool<GetLevelInput> = {
  name: "get_level",
  description:
    "Lista el contenido de un nivel: muros, ambientes, aberturas, muebles, losas, techos, columnas, escaleras, cubiertas, estantes, cercos, ascensores y spawns. Es la lectura principal antes de modificar una planta.",
  input: getLevelInput,
  risk: "read",
  async run(args, ctx) {
    const nodes = useScene.getState().nodes;
    const level = findLevel(nodes, args.levelId ?? ctx.levelId);
    if (!level) {
      return fail(
        "LEVEL_NOT_FOUND",
        "No se encontró el nivel indicado.",
        "Llamá primero a get_scene_summary para obtener un levelId."
      );
    }

    const levelId = level.id as AnyNodeId;
    const include = new Set<LevelInclude>(args.include ?? [...LEVEL_INCLUDE]);

    const walls = childrenOfType(nodes, levelId, "wall");
    const wallIds = new Set<string>(walls.map((wall) => wall.id));
    const ceilings = childrenOfType(nodes, levelId, "ceiling");
    const ceilingIds = new Set<string>(ceilings.map((ceiling) => ceiling.id));

    const openings = Object.values(nodes).filter(
      (node): node is DoorNode | WindowNode =>
        (node.type === "door" || node.type === "window") &&
        ((node.parentId ? wallIds.has(node.parentId) : false) ||
          (node.wallId ? wallIds.has(node.wallId) : false))
    );

    const items = Object.values(nodes).filter(
      (node): node is ItemNode =>
        node.type === "item" &&
        (node.parentId === levelId ||
          (node.parentId ? wallIds.has(node.parentId) : false) ||
          (node.parentId ? ceilingIds.has(node.parentId) : false))
    );

    const zones = childrenOfType(nodes, levelId, "zone");
    const slabs = childrenOfType(nodes, levelId, "slab");
    const columns = childrenOfType(nodes, levelId, "column");
    const stairs = childrenOfType(nodes, levelId, "stair");
    const roofs = childrenOfType(nodes, levelId, "roof");
    const shelves = childrenOfType(nodes, levelId, "shelf");
    const fences = childrenOfType(nodes, levelId, "fence");
    const elevators = childrenOfType(nodes, levelId, "elevator");
    const spawns = childrenOfType(nodes, levelId, "spawn");
    const chimneys = childrenOfType(nodes, levelId, "chimney");

    const roofSegments = roofs.flatMap((roof) =>
      childrenOfType(nodes, roof.id, "roof-segment")
    );
    const stairSegments = stairs.flatMap((stair) =>
      childrenOfType(nodes, stair.id, "stair-segment")
    );

    const counts: Record<string, number> = {
      walls: walls.length,
      zones: zones.length,
      openings: openings.length,
      items: items.length,
      slabs: slabs.length,
      ceilings: ceilings.length,
      columns: columns.length,
      stairs: stairs.length,
      roofs: roofs.length,
      shelves: shelves.length,
      fences: fences.length,
      elevators: elevators.length,
      spawns: spawns.length,
      chimneys: chimneys.length,
      roofSegments: roofSegments.length,
      stairSegments: stairSegments.length,
    };

    const payload: Record<string, unknown> = {
      level: {
        id: level.id,
        name: level.name ?? `Nivel ${level.level + 1}`,
        level: level.level,
        buildingId: level.parentId,
      },
      counts,
      levelId,
    };

    const add = <T,>(
      key: LevelInclude,
      source: T[],
      map: (node: T) => Record<string, unknown> = (node) =>
        compactNode(node as AnyNode)
    ) => {
      if (!include.has(key)) return;
      const { items: sliced, truncated } = take(source, args.limit);
      payload[key] = sliced.map(map);
      if (truncated) payload[`${key}Truncated`] = true;
    };

    add("walls", walls, (wall) => ({
      ...compactNode(wall),
      length: round(wallLength(wall)),
    }));
    add("zones", zones, (zone: ZoneNode) => ({
      ...compactNode(zone),
      area_m2: round(polygonArea(zone.polygon)),
      perimeter_m: round(polygonPerimeter(zone.polygon)),
    }));
    add("openings", openings);
    add("items", items);
    add("slabs", slabs);
    add("ceilings", ceilings);
    add("columns", columns);
    add("stairs", stairs);
    add("roofs", roofs);
    add("shelves", shelves);
    add("fences", fences);
    add("elevators", elevators);
    add("spawns", spawns);
    add("chimneys", chimneys);
    add("roofSegments", roofSegments);
    add("stairSegments", stairSegments);

    return ok(payload);
  },
};

const getNodeInput = z.object({
  nodeId: z.string().describe("ID exacto del nodo."),
});

export type GetNodeInput = z.infer<typeof getNodeInput>;

export const getNodeTool: AiTool<GetNodeInput> = {
  name: "get_node",
  description:
    "Devuelve el detalle de un nodo por ID, incluyendo su nivel y su padre. Usar cuando ya se conoce el ID y hace falta inspeccionar sus propiedades.",
  input: getNodeInput,
  risk: "read",
  async run(args) {
    const nodes = useScene.getState().nodes;
    const node = nodes[args.nodeId as AnyNodeId];
    if (!node) {
      return fail(
        "NODE_NOT_FOUND",
        `No existe el nodo "${args.nodeId}".`,
        "Usá get_scene_summary o get_level para obtener IDs válidos."
      );
    }

    const parent = node.parentId
      ? nodes[node.parentId as AnyNodeId] ?? null
      : null;

    let levelId: string | null = null;
    try {
      levelId = resolveLevelId(node, nodes);
    } catch {
      levelId = null;
    }

    return ok({
      node: compactNode(node),
      levelId,
      parent: parent ? compactNode(parent) : null,
      childCount:
        "children" in node && Array.isArray(node.children)
          ? node.children.length
          : 0,
    });
  },
};

const searchCatalogInput = z.object({
  query: z
    .string()
    .optional()
    .describe("Texto a buscar en nombre, tags, categoría o id."),
  category: z
    .string()
    .optional()
    .describe("Categoría exacta del catálogo, por ejemplo furniture o kitchen."),
  limit: z.number().int().min(1).max(50).default(12),
});

export type SearchCatalogInput = z.infer<typeof searchCatalogInput>;

export const searchCatalogTool: AiTool<SearchCatalogInput> = {
  name: "search_catalog",
  description:
    "Busca muebles y objetos en el catálogo por nombre en español, tags, categoría o id. Devuelve el catalogId que usa place_item.",
  input: searchCatalogInput,
  risk: "read",
  async run(args) {
    const query = args.query ? normalizeText(args.query) : "";
    const category = args.category?.toLowerCase().trim();

    const matches = CATALOG_ES_ITEMS.filter((item) => {
      if (category && item.category.toLowerCase() !== category) return false;
      if (!query) return true;
      const haystack = normalizeText(
        [item.id, item.name, item.category, ...(item.tags ?? [])].join(" ")
      );
      return haystack.includes(query);
    });

    return ok({
      total: matches.length,
      items: matches.slice(0, args.limit).map((item) => ({
        catalogId: item.id,
        name: item.name,
        category: item.category,
        dimensions: item.dimensions,
        attachTo: item.attachTo ?? "floor",
        thumbnail: item.thumbnail,
        tags: (item.tags ?? []).slice(0, 10),
      })),
      ...(matches.length > args.limit ? { truncated: true } : {}),
    });
  },
};

const searchMaterialsInput = z.object({
  query: z.string().optional().describe("Texto a buscar en nombre, id o descripción."),
  category: z.enum(MATERIAL_CATEGORIES).optional(),
  surface: z.enum(MATERIAL_SURFACES).optional(),
  limit: z.number().int().min(1).max(50).default(15),
});

export type SearchMaterialsInput = z.infer<typeof searchMaterialsInput>;

export const searchMaterialsTool: AiTool<SearchMaterialsInput> = {
  name: "search_materials",
  description:
    "Busca materiales de la biblioteca por nombre, categoría o superficie. Devuelve el materialId y el materialRef que usa paint_surface.",
  input: searchMaterialsInput,
  risk: "read",
  async run(args) {
    const query = args.query ? normalizeText(args.query) : "";
    const aliases = query ? MATERIAL_SEARCH_ALIASES[query] ?? [] : [];

    const matches = MATERIAL_CATALOG.filter((material) => {
      if (args.category && material.category !== args.category) return false;
      if (
        args.surface &&
        material.surfaces &&
        !material.surfaces.includes(args.surface)
      ) {
        return false;
      }
      if (!query) return true;
      const haystack = normalizeText(
        [material.id, material.label, material.description ?? "", material.category].join(
          " "
        )
      );
      return (
        haystack.includes(query) ||
        aliases.some((alias) => haystack.includes(alias))
      );
    });

    return ok({
      total: matches.length,
      materials: matches.slice(0, args.limit).map((material) => ({
        materialId: material.id,
        materialRef: toLibraryMaterialRef(material.id),
        label: material.label,
        category: material.category,
        surfaces: material.surfaces ?? [],
        description: material.description ?? null,
        previewColor: material.previewColor ?? null,
      })),
      ...(matches.length > args.limit ? { truncated: true } : {}),
    });
  },
};
