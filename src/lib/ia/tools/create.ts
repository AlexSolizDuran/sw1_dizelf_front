"use client";

import {
  type AnyNode,
  type AnyNodeId,
  type BuildingNode,
  type LevelNode,
  type WallNode,
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
import type { AiTool, ToolResult } from "../tool-types";
import { fail, ok } from "../tool-types";
import {
  EPSILON,
  MIN_POLYGON_AREA,
  MIN_WALL_LENGTH,
  childrenOfType,
  effectiveWallHeight,
  findLevel,
  isSimplePolygon,
  normalizePolygon,
  pointInPolygon,
  polygonArea,
  polygonCentroid,
  polygonPerimeter,
  round,
  sameSegment,
  segmentOverlapKind,
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

const OPENING_MARGIN = 0.05;

const openingSpec = z.object({
  kind: z.enum(["door", "window"]),
  side: z
    .number()
    .int()
    .min(1)
    .max(64)
    .describe(
      "Lado del polígono donde va la abertura. El lado 1 va del vértice 1 al 2."
    ),
  position: z
    .number()
    .min(0)
    .optional()
    .describe(
      "Centro de la abertura, en metros desde el vértice inicial de ese lado. Si se omite, usa el hueco libre más grande."
    ),
  name: z.string().min(1).max(80).optional(),
  width: z.number().min(0.2).max(6).optional(),
  height: z.number().min(0.2).max(6).optional(),
  sill: z
    .number()
    .min(0)
    .max(3)
    .default(0.9)
    .describe("Altura del alféizar; solo se usa en ventanas."),
  face: z.enum(["front", "back"]).default("front"),
  doorType: z.enum(DOOR_TYPES).optional(),
  windowType: z.enum(WINDOW_TYPES).optional(),
});

export type OpeningSpec = z.infer<typeof openingSpec>;

type AberturaCreada = {
  node: AberturaNode;
  kind: "door" | "window";
  side: number;
  wallId: string;
  name: string;
  distanceFromStart: number;
  width: number;
  height: number;
  sill?: number;
};

/** Aberturas ya presentes en el muro, como intervalos medidos desde su inicio. */
function aberturasOcupadas(
  nodes: Record<AnyNodeId, AnyNode>,
  wall: WallNode
): Array<[number, number]> {
  return aberturasDeMuro(nodes, wall.id).map((abertura) => [
    abertura.position[0] - abertura.width / 2,
    abertura.position[0] + abertura.width / 2,
  ]);
}

function huecosEnRango(
  length: number,
  ocupados: Array<[number, number]>,
  width: number
): Array<[number, number]> {
  if (length < width + OPENING_MARGIN * 2) return [];

  const ordenados = [...ocupados].sort((a, b) => a[0] - b[0]);
  const huecos: Array<[number, number]> = [];
  let cursor = OPENING_MARGIN;

  for (const [inicio, fin] of ordenados) {
    if (inicio - cursor >= width) huecos.push([cursor, inicio]);
    cursor = Math.max(cursor, fin);
  }

  if (length - OPENING_MARGIN - cursor >= width) {
    huecos.push([cursor, length - OPENING_MARGIN]);
  }

  return huecos;
}

function puntoSobreSegmento(
  punto: readonly number[],
  start: readonly number[],
  end: readonly number[]
): boolean {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const largo = Math.hypot(dx, dz);
  if (largo < EPSILON) return false;

  const ux = dx / largo;
  const uz = dz / largo;
  const px = punto[0] - start[0];
  const pz = punto[1] - start[1];
  const t = px * ux + pz * uz;
  const distancia = Math.abs(px * -uz + pz * ux);

  return distancia <= EPSILON && t >= -EPSILON && t <= largo + EPSILON;
}

/** Punto a `position` metros del inicio de un lado del polígono. */
function puntoEnLado(
  start: readonly [number, number],
  end: readonly [number, number],
  position: number
): [number, number] {
  const largo = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const ux = (end[0] - start[0]) / largo;
  const uz = (end[1] - start[1]) / largo;
  return [start[0] + ux * position, start[1] + uz * position];
}

/** Distancia del punto al inicio del muro, siguiendo su dirección. */
function proyeccionEnMuro(
  wall: WallNode,
  punto: readonly number[]
): number {
  const dx = wall.end[0] - wall.start[0];
  const dz = wall.end[1] - wall.start[1];
  const largo = Math.hypot(dx, dz);
  if (largo < EPSILON) return 0;
  return ((punto[0] - wall.start[0]) * dx + (punto[1] - wall.start[1]) * dz) / largo;
}

function cabeEnMuro(
  wall: WallNode,
  distance: number,
  width: number,
  ocupados: Array<[number, number]>
): boolean {
  const largo = wallLength(wall);
  const half = width / 2;
  if (distance - half < OPENING_MARGIN || distance + half > largo - OPENING_MARGIN) {
    return false;
  }
  return !ocupados.some(
    ([inicio, fin]) => Math.min(fin, distance + half) - Math.max(inicio, distance - half) > 1e-6
  );
}

/**
 * Resuelve las aberturas pedidas para un ambiente.
 *
 * Cada abertura se ancla a un lado del polígono, no a un id de muro: así el
 * modelo puede describir la casa completa en una sola llamada sin conocer los
 * ids que todavía no existen. Si `position` no entra, se coloca en el hueco
 * libre más grande; si no hay hueco, se avisa y se omite esa abertura.
 */
function planificarAberturas(input: {
  pedidos: OpeningSpec[];
  polygon: [number, number][];
  muros: WallNode[];
  nodes: Record<AnyNodeId, AnyNode>;
  ocupados: Map<string, Array<[number, number]>>;
}): { creadas: AberturaCreada[]; warnings: string[] } | { error: ToolResult } {
  const { pedidos, polygon, muros, nodes, ocupados } = input;
  const creadas: AberturaCreada[] = [];
  const warnings: string[] = [];

  const intervalos = (wall: WallNode): Array<[number, number]> => {
    let lista = ocupados.get(wall.id);
    if (!lista) {
      lista = aberturasOcupadas(nodes, wall);
      ocupados.set(wall.id, lista);
    }
    return lista;
  };

  const conteo = new Map<string, number>();
  const siguienteNumero = (wall: WallNode, kind: "door" | "window"): number => {
    const clave = `${wall.id}|${kind}`;
    if (!conteo.has(clave)) {
      conteo.set(
        clave,
        aberturasDeMuro(nodes, wall.id).filter((item) => item.type === kind)
          .length
      );
    }
    const valor = (conteo.get(clave) ?? 0) + 1;
    conteo.set(clave, valor);
    return valor;
  };

  for (const [indice, pedido] of pedidos.entries()) {
    const kind = pedido.kind;
    const etiqueta =
      pedido.name ??
      `${kind === "door" ? "Puerta" : "Ventana"} ${indice + 1}`;
    const total = polygon.length;

    if (!Number.isInteger(pedido.side) || pedido.side < 1 || pedido.side > total) {
      return {
        error: fail(
          "SIDE_OUT_OF_RANGE",
          `"${etiqueta}" apunta al lado ${pedido.side}, pero el polígono tiene ${total} lados.`,
          `Usá side entre 1 y ${total}; el lado 1 va del vértice 1 al 2.`
        ),
      };
    }

    const inicio = polygon[pedido.side - 1];
    const fin = polygon[pedido.side % total];
    const largoTado = Math.hypot(fin[0] - inicio[0], fin[1] - inicio[1]);
    const width = pedido.width ?? (kind === "door" ? 0.9 : 1.2);
    const height = pedido.height ?? (kind === "door" ? 2.1 : 1.5);
    const sill = kind === "window" ? pedido.sill : 0;

    if (largoTado < width + OPENING_MARGIN * 2) {
      return {
        error: fail(
          "OPENING_TOO_WIDE",
          `"${etiqueta}" mide ${round(width)} m y el lado ${pedido.side} mide ${round(largoTado)} m.`,
          "Reducí el ancho de la abertura o elegí otro lado."
        ),
      };
    }

    const candidatos = muros.filter(
      (wall) =>
        puntoSobreSegmento(wall.start, inicio, fin) &&
        puntoSobreSegmento(wall.end, inicio, fin)
    );

    if (candidatos.length === 0) {
      return {
        error: fail(
          "OPENING_WALL_NOT_FOUND",
          `No encontré un muro sobre el lado ${pedido.side} del polígono.`,
          "Revisá que el polígono y los muros coincidan, o pasá la abertura a otro lado."
        ),
      };
    }

    let elegido: { wall: WallNode; distance: number } | null = null;

    if (pedido.position !== undefined) {
      const objetivo = puntoEnLado(inicio, fin, pedido.position);
      for (const wall of candidatos) {
        const distance = proyeccionEnMuro(wall, objetivo);
        if (cabeEnMuro(wall, distance, width, intervalos(wall))) {
          elegido = { wall, distance };
          break;
        }
      }
      if (!elegido) {
        warnings.push(
          `"${etiqueta}" no entra a ${round(pedido.position)} m del inicio del lado ${pedido.side}: se colocó en el hueco libre más grande.`
        );
      }
    }

    if (!elegido) {
      let mejor: { wall: WallNode; distance: number; tamano: number } | null =
        null;

      for (const wall of candidatos) {
        const huecos = huecosEnRango(wallLength(wall), intervalos(wall), width);
        if (huecos.length === 0) continue;

        const [desde, hasta] = huecos.reduce(
          (mayor, hueco) =>
            hueco[1] - hueco[0] > mayor[1] - mayor[0] ? hueco : mayor,
          huecos[0]
        );
        const tamano = hasta - desde;
        if (!mejor || tamano > mejor.tamano) {
          mejor = { wall, distance: (desde + hasta) / 2, tamano };
        }
      }

      if (!mejor) {
        warnings.push(
          `No quedó espacio para "${etiqueta}" en el lado ${pedido.side}; no se creó.`
        );
        continue;
      }

      elegido = { wall: mejor.wall, distance: mejor.distance };
    }

    const wall = elegido.wall;
    const wallHeight = effectiveWallHeight(wall);

    if (kind === "window" && sill + height > wallHeight - OPENING_MARGIN) {
      return {
        error: fail(
          "OPENING_TOO_TALL",
          `La ventana "${etiqueta}" no entra en el muro: ${round(sill + height)} m sobre un muro de ${round(wallHeight)} m.`,
          "Reducí height o sill."
        ),
      };
    }

    if (kind === "door" && height > wallHeight - OPENING_MARGIN) {
      return {
        error: fail(
          "OPENING_TOO_TALL",
          `La puerta "${etiqueta}" mide ${round(height)} m y el muro ${round(wallHeight)} m.`,
          "Reducí height."
        ),
      };
    }

    const name = pedido.name ??
      `${kind === "door" ? "Puerta" : "Ventana"} ${siguienteNumero(wall, kind)}`;
    const rotation: [number, number, number] = [
      0,
      pedido.face === "back" ? Math.PI : 0,
      0,
    ];

    const node =
      kind === "door"
        ? DoorSchema.parse({
            name,
            position: [elegido.distance, height / 2, 0],
            rotation,
            side: pedido.face,
            wallId: wall.id,
            parentId: wall.id,
            width,
            height,
            ...(pedido.doorType ? { doorType: pedido.doorType } : {}),
          })
        : WindowSchema.parse({
            name,
            position: [elegido.distance, sill + height / 2, 0],
            rotation,
            side: pedido.face,
            wallId: wall.id,
            parentId: wall.id,
            width,
            height,
            ...(pedido.windowType ? { windowType: pedido.windowType } : {}),
          });

    intervalos(wall).push([
      elegido.distance - width / 2,
      elegido.distance + width / 2,
    ]);

    creadas.push({
      node,
      kind,
      side: pedido.side,
      wallId: wall.id,
      name,
      distanceFromStart: round(elegido.distance),
      width,
      height,
      ...(kind === "window" ? { sill } : {}),
    });
  }

  return { creadas, warnings };
}

/** Datos serializables de una abertura creada, para el resultado de la tool. */
function resumenAberturas(creadas: AberturaCreada[]) {
  return creadas.map(({ node, ...resto }) => ({
    id: node.id,
    type: node.type,
    ...resto,
  }));
}

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
  openings: z
    .array(openingSpec)
    .max(12)
    .optional()
    .describe(
      "Puertas y ventanas del ambiente. Cada una se ancla a un lado del polígono con side, así no hace falta crear primero los muros."
    ),
});

export type CreateRoomInput = z.infer<typeof createRoomInput>;

export const createRoomTool: AiTool<CreateRoomInput> = {
  name: "create_room",
  description:
    "Crea un ambiente cerrado de forma atómica: muros, zone, losa, techo y las puertas y ventanas pedidas, con un solo undo. Reutiliza los muros existentes que coincidan exactamente con un lado y rechaza solapes parciales. Pausa la detección automática para no duplicar superficies. Medidas sugeridas: puerta 0,9 × 2,1 m; ventana 1,2 × 1,5 m.",
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
    const reusedWalls: typeof existingWalls = [];
    const newSegments: { start: [number, number]; end: [number, number] }[] = [];

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

      // Un lado que coincide exactamente con un muro existente se reutiliza:
      // así se puede cerrar un ambiente apoyado en paredes ya construidas.
      const exact = existingWalls.find((wall) =>
        sameSegment(wall.start, wall.end, start, end)
      );
      if (exact) {
        if (!reusedWalls.some((wall) => wall.id === exact.id)) {
          reusedWalls.push(exact);
        }
        continue;
      }

      // Un solape parcial exigiría partir el muro: no lo hacemos en silencio.
      const overlapping = existingWalls.find((wall) => {
        const kind = segmentOverlapKind(wall.start, wall.end, start, end);
        return kind === "partial" || kind === "contains";
      });
      if (overlapping) {
        return fail(
          "WALL_SPLIT_REQUIRED",
          `El lado ${index + 1} se superpone parcialmente con el muro "${overlapping.name ?? overlapping.id}".`,
          "Acortá o dividí el muro existente, o ajustá el polígono para que coincida exactamente.",
          {
            wallId: overlapping.id,
            wallStart: overlapping.start,
            wallEnd: overlapping.end,
            sideStart: start,
            sideEnd: end,
          }
        );
      }

      newSegments.push({ start, end });
    }

    const wallCount = existingWalls.length;
    const walls = newSegments.map((segment, index) =>
      WallSchema.parse({
        name: `Muro ${wallCount + index + 1}`,
        start: segment.start,
        end: segment.end,
        height: args.height,
        thickness: args.thickness,
      })
    );

    const boundaryWallIds = [
      ...reusedWalls.map((wall) => wall.id),
      ...walls.map((wall) => wall.id),
    ];

    const warnings: string[] = [];
    for (const wall of reusedWalls) {
      if (
        Math.abs((wall.height ?? 2.5) - args.height) > EPSILON ||
        Math.abs((wall.thickness ?? 0.1) - args.thickness) > EPSILON
      ) {
        warnings.push(
          `El muro reutilizado "${wall.name ?? wall.id}" conserva su altura y espesor originales.`
        );
      }
    }

    const zone = ZoneNode.parse({
      name: args.name,
      polygon,
      autoFromWalls: true,
      boundaryWallIds,
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

    let openings: AberturaCreada[] = [];
    if (args.openings && args.openings.length > 0) {
      const planeadas = planificarAberturas({
        pedidos: args.openings,
        polygon,
        muros: [...reusedWalls, ...walls],
        nodes,
        ocupados: new Map(),
      });
      if ("error" in planeadas) return planeadas.error;
      openings = planeadas.creadas;
      warnings.push(...planeadas.warnings);
    }

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
            ...openings.map((abertura) => ({
              node: abertura.node as AnyNode,
              parentId: abertura.wallId as AnyNodeId,
            })),
          ],
        });
      });
    } finally {
      resumeSpaceDetection();
    }

    return ok(
      {
        levelId,
        roomId: zone.id,
        name: args.name,
        wallIds: walls.map((wall) => wall.id),
        reusedWallIds: reusedWalls.map((wall) => wall.id),
        boundaryWallIds,
        slabId: slab?.id ?? null,
        ceilingId: ceiling?.id ?? null,
        area_m2: round(area),
        perimeter_m: round(polygonPerimeter(polygon)),
        polygon,
        openings: resumenAberturas(openings),
      },
      warnings
    );
  },
};

const roomSpec = z.object({
  name: z.string().min(1).max(80).describe("Nombre del ambiente, por ejemplo Dormitorio 1."),
  polygon: z
    .array(z.tuple([z.number(), z.number()]))
    .min(3)
    .max(64)
    .describe("Vértices del ambiente en planta [x, z], en orden. No repetir el primero al final."),
  height: z
    .number()
    .min(0)
    .max(10)
    .default(2.5)
    .describe("Altura de muros y techo. 0 significa sin techo propio (patio o terraza)."),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .describe("Color de la zona en formato #rrggbb."),
  createSlab: z.boolean().default(true),
  createCeiling: z.boolean().default(true),
  openings: z
    .array(openingSpec)
    .max(12)
    .optional()
    .describe(
      "Puertas y ventanas del ambiente, ancladas a los lados de su polígono con side."
    ),
});

const createRoomsInput = z.object({
  levelId: z
    .string()
    .optional()
    .describe("Nivel donde se crean los ambientes. Si se omite, usa el activo."),
  thickness: z.number().min(0.02).max(2).default(0.15),
  rooms: z
    .array(roomSpec)
    .min(1)
    .max(8)
    .describe("Ambientes a crear en una sola operación. Los lados que coinciden entre ambientes se comparten: no dupliques paredes ni superpongas polígonos."),
});

export type CreateRoomsInput = z.infer<typeof createRoomsInput>;

/** Recta en planta con una base ortonormal canónica (u) y su normal (n). */
type LineaPlanta = {
  ux: number;
  uz: number;
  nx: number;
  nz: number;
  c: number;
  /** Proyecciones de los vértices de los ambientes: aquí se cortan los muros. */
  cortes: number[];
  /** Tramos pedidos por los ambientes, con el índice del ambiente que los pide. */
  cobertura: Array<{ a: number; b: number; roomIndex: number }>;
};

type LadoPlan = { clave: string; a: number; b: number };

type TramoPlan = {
  a: number;
  b: number;
  existente: boolean;
  id?: string;
  /** Posición en la lista de muros nuevos, para resolver el id después. */
  nuevoIndice?: number;
};

type MuroExistente = {
  a: number;
  b: number;
  id: string;
  name?: string;
  height: number;
  thickness: number;
};

/**
 * Clave canónica de la recta que contiene un segmento.
 *
 * La dirección se normaliza (siempre apunta hacia x positivo) para que un muro
 * y su inverso caigan en la misma línea. `c` es la distancia con signo al
 * origen: dos segmentos colineales comparten clave.
 */
function lineaDeSegmento(
  start: readonly number[],
  end: readonly number[]
):
  | { clave: string; linea: Omit<LineaPlanta, "cortes" | "cobertura">; proyeccion: (punto: readonly number[]) => number }
  | null {
  const dx = end[0] - start[0];
  const dz = end[1] - start[1];
  const largo = Math.hypot(dx, dz);
  if (largo < MIN_WALL_LENGTH) return null;

  let ux = dx / largo;
  let uz = dz / largo;
  if (ux < -1e-9 || (Math.abs(ux) <= 1e-9 && uz < 0)) {
    ux = -ux;
    uz = -uz;
  }
  const nx = -uz;
  const nz = ux;
  const c = nx * start[0] + nz * start[1];
  const clave = `${ux.toFixed(4)}|${uz.toFixed(4)}|${(Math.round(c * 100) / 100).toFixed(2)}`;

  return {
    clave,
    linea: { ux, uz, nx, nz, c },
    proyeccion: (punto: readonly number[]) => ux * punto[0] + uz * punto[1],
  };
}

/**
 * Crea varios ambientes en una sola operación de undo.
 *
 * Es la versión por lote de `create_room`: la casa completa (dormitorios, baño,
 * patio) se resuelve en una sola llamada del modelo. Los muros se calculan como
 * la unión de todos los lados, cortada en cada vértice: una pared medianera se
 * crea una sola vez y un lado largo (por ejemplo el del patio) se divide donde
 * terminan los ambientes contiguos.
 */
export const createRoomsTool: AiTool<CreateRoomsInput> = {
  name: "create_rooms",
  description:
    "Crea varios ambientes cerrados (muros, zones, losas, techos y las puertas y ventanas pedidas) en una sola operación y un solo undo. Comparte automáticamente los lados que coinciden entre ambientes y reutiliza muros existentes. Preferila sobre create_room cuando haya más de un ambiente: es mucho más rápida. Las aberturas se anclan a un lado del polígono del ambiente, así se crean sin ids previos; para editar después usá add_opening.",
  input: createRoomsInput,
  risk: "write",
  async run(args, ctx) {
    const blocked = ensureWritable();
    if (blocked) return blocked;

    const nodes = useScene.getState().nodes;
    const level = findLevel(nodes, args.levelId ?? ctx.levelId);
    if (!level) {
      return fail(
        "LEVEL_NOT_FOUND",
        "No se encontró el nivel para crear los ambientes.",
        "Usá get_scene_summary para obtener un levelId."
      );
    }

    const levelId = level.id as AnyNodeId;
    const existingWalls = childrenOfType(nodes, levelId, "wall");

    const existentesPorLinea = new Map<string, MuroExistente[]>();
    for (const wall of existingWalls) {
      const ubicado = lineaDeSegmento(wall.start, wall.end);
      if (!ubicado) continue;
      const a = ubicado.proyeccion(wall.start);
      const b = ubicado.proyeccion(wall.end);
      const lista = existentesPorLinea.get(ubicado.clave) ?? [];
      lista.push({
        a: Math.min(a, b),
        b: Math.max(a, b),
        id: wall.id,
        ...(wall.name ? { name: wall.name } : {}),
        height: wall.height ?? 2.5,
        thickness: wall.thickness ?? 0.1,
      });
      existentesPorLinea.set(ubicado.clave, lista);
    }

    const lineas = new Map<string, LineaPlanta>();
    const planes: Array<{
      spec: CreateRoomsInput["rooms"][number];
      polygon: [number, number][];
      area: number;
      lados: LadoPlan[];
    }> = [];
    const firmas = new Set<string>();

    for (const [roomIndex, spec] of args.rooms.entries()) {
      const polygon = normalizePolygon(spec.polygon);

      if (polygon.length < 3) {
        return fail(
          "INVALID_POLYGON",
          `El ambiente "${spec.name}" necesita al menos 3 vértices distintos.`,
          "Pasá los puntos en orden, sin repetir el primero al final."
        );
      }

      if (!isSimplePolygon(polygon)) {
        return fail(
          "SELF_INTERSECTING_POLYGON",
          `El polígono de "${spec.name}" se cruza a sí mismo.`,
          "Revisá el orden de los vértices: deben recorrer el contorno sin cruzarse."
        );
      }

      const area = polygonArea(polygon);
      if (area < MIN_POLYGON_AREA) {
        return fail(
          "POLYGON_TOO_SMALL",
          `"${spec.name}" tiene ${round(area)} m².`,
          `El mínimo es ${MIN_POLYGON_AREA} m².`
        );
      }

      // Firma sin orden: el mismo contorno recorrido al revés es el mismo ambiente.
      const firma = polygon
        .map(([x, z]) => `${round(x)},${round(z)}`)
        .sort()
        .join(";");
      if (firmas.has(firma)) {
        return fail(
          "DUPLICATE_ROOM",
          `El ambiente "${spec.name}" repite el polígono de otro del mismo lote.`,
          "Cambiá las coordenadas o quitá el ambiente duplicado."
        );
      }
      firmas.add(firma);

      const lados: LadoPlan[] = [];

      for (let indice = 0; indice < polygon.length; indice++) {
        const start = polygon[indice];
        const end = polygon[(indice + 1) % polygon.length];
        const largo = Math.hypot(end[0] - start[0], end[1] - start[1]);

        if (largo < MIN_WALL_LENGTH) {
          return fail(
            "WALL_TOO_SHORT",
            `El lado ${indice + 1} de "${spec.name}" mide ${round(largo)} m.`,
            `El mínimo es ${MIN_WALL_LENGTH} m.`
          );
        }

        const ubicado = lineaDeSegmento(start, end);
        if (!ubicado) {
          return fail(
            "WALL_TOO_SHORT",
            `El lado ${indice + 1} de "${spec.name}" es demasiado corto.`,
            `El mínimo es ${MIN_WALL_LENGTH} m.`
          );
        }

        let linea = lineas.get(ubicado.clave);
        if (!linea) {
          linea = { ...ubicado.linea, cortes: [], cobertura: [] };
          lineas.set(ubicado.clave, linea);
        }

        const a = ubicado.proyeccion(start);
        const b = ubicado.proyeccion(end);
        const desde = Math.min(a, b);
        const hasta = Math.max(a, b);

        linea.cortes.push(desde, hasta);
        linea.cobertura.push({ a: desde, b: hasta, roomIndex });
        lados.push({ clave: ubicado.clave, a: desde, b: hasta });
      }

      planes.push({ spec, polygon, area, lados });
    }

    for (let uno = 0; uno < planes.length; uno++) {
      for (let otro = uno + 1; otro < planes.length; otro++) {
        const a = planes[uno];
        const b = planes[otro];
        if (Math.abs(a.area - b.area) <= EPSILON) continue;
        const [menor, mayor] = a.area < b.area ? [a, b] : [b, a];
        const [cx, cz] = polygonCentroid(menor.polygon);
        if (pointInPolygon(cx, cz, mayor.polygon)) {
          return fail(
            "ZONES_OVERLAP",
            `El ambiente "${menor.spec.name}" queda dentro de "${mayor.spec.name}".`,
            "Los polígonos no pueden superponerse: ajustá los vértices para que compartan lados sin invadirse."
          );
        }
      }
    }

    // Muros resultantes: la unión de los lados, cortada en cada vértice.
    const nuevos: Array<{
      start: [number, number];
      end: [number, number];
      height: number;
      thickness: number;
    }> = [];
    const tramosPorLinea = new Map<string, TramoPlan[]>();
    const warnings: string[] = [];

    for (const [clave, linea] of lineas) {
      const cortes = [
        ...new Set(linea.cortes.map((t) => Math.round(t * 1000) / 1000)),
      ].sort((uno, otro) => uno - otro);
      const existentes = existentesPorLinea.get(clave) ?? [];
      const tramos: TramoPlan[] = existentes.map((muro) => ({
        a: muro.a,
        b: muro.b,
        existente: true,
        id: muro.id,
      }));

      const punto = (t: number): [number, number] => [
        round(t * linea.ux + linea.c * linea.nx, 4),
        round(t * linea.uz + linea.c * linea.nz, 4),
      ];

      for (let indice = 0; indice < cortes.length - 1; indice++) {
        const a = cortes[indice];
        const b = cortes[indice + 1];
        if (b - a < MIN_WALL_LENGTH) continue;

        const medio = (a + b) / 2;
        const coberturas = linea.cobertura.filter(
          (tramo) => medio >= tramo.a - EPSILON && medio <= tramo.b + EPSILON
        );
        if (coberturas.length === 0) continue;

        // Un muro existente que ya cubre el tramo se reutiliza tal cual.
        const contiene = existentes.find(
          (muro) => muro.a <= a + EPSILON && muro.b >= b - EPSILON
        );
        if (contiene) {
          if (!tramos.some((tramo) => tramo.id === contiene.id)) {
            tramos.push({
              a: contiene.a,
              b: contiene.b,
              existente: true,
              id: contiene.id,
            });
          }
          continue;
        }

        // Partir un muro existente en silencio rompería sus aberturas.
        const parcial = existentes.find(
          (muro) => Math.min(muro.b, b) - Math.max(muro.a, a) > EPSILON
        );
        if (parcial) {
          return fail(
            "WALL_SPLIT_REQUIRED",
            `Un lado de "${planes[coberturas[0].roomIndex].spec.name}" se superpone parcialmente con el muro "${parcial.name ?? parcial.id}".`,
            "Ajustá los polígonos para que coincidan exactamente con ese muro, o acortalo antes de crear los ambientes."
          );
        }

        const alturas = coberturas
          .map(({ roomIndex }) => args.rooms[roomIndex].height ?? 2.5)
          .filter((altura) => altura > 0);
        const altura = alturas.length > 0 ? Math.max(...alturas) : 2.5;
        if (new Set(alturas).size > 1) {
          warnings.push(
            "Dos ambientes contiguos pidieron alturas distintas: el muro compartido usa la mayor."
          );
        }

        tramos.push({
          a,
          b,
          existente: false,
          nuevoIndice: nuevos.length,
        });
        nuevos.push({
          start: punto(a),
          end: punto(b),
          height: altura,
          thickness: args.thickness ?? 0.15,
        });
      }

      tramosPorLinea.set(clave, tramos);
    }

    const wallCount = existingWalls.length;
    const walls = nuevos.map((segmento, indice) =>
      WallSchema.parse({
        name: `Muro ${wallCount + indice + 1}`,
        start: segmento.start,
        end: segmento.end,
        height: segmento.height,
        thickness: segmento.thickness,
      })
    );

    const prepared = planes.map((plan) => {
      const ids = new Set<string>();

      for (const lado of plan.lados) {
        const tramos = tramosPorLinea.get(lado.clave) ?? [];
        for (const tramo of tramos) {
          const solape =
            Math.min(tramo.b, lado.b) - Math.max(tramo.a, lado.a);
          if (solape <= EPSILON) continue;
          const id =
            tramo.id ??
            (tramo.nuevoIndice !== undefined
              ? walls[tramo.nuevoIndice]?.id
              : undefined);
          if (id) ids.add(id);
        }
      }

      if (ids.size === 0) {
        return { ...plan, boundaryWallIds: [], zone: null, slab: null, ceiling: null };
      }

      const boundaryWallIds = [...ids];
      const zone = ZoneNode.parse({
        name: plan.spec.name,
        polygon: plan.polygon,
        autoFromWalls: true,
        boundaryWallIds,
        parentId: levelId,
        ...(plan.spec.color ? { color: plan.spec.color } : {}),
      });

      const slab = (plan.spec.createSlab ?? true)
        ? SlabNode.parse({
            name: `${plan.spec.name} - piso`,
            polygon: plan.polygon,
            autoFromWalls: true,
            parentId: levelId,
          })
        : null;

      const alturaTecho = plan.spec.height ?? 2.5;
      const ceiling = (plan.spec.createCeiling ?? true) && alturaTecho > 0
        ? CeilingNode.parse({
            name: `${plan.spec.name} - techo`,
            polygon: plan.polygon,
            height: alturaTecho,
            autoFromWalls: true,
            parentId: levelId,
          })
        : null;

      return { ...plan, boundaryWallIds, zone, slab, ceiling };
    });

    const sinMuros = prepared.find((plan) => plan.zone === null);
    if (sinMuros) {
      return fail(
        "ROOM_NOT_ENCLOSED",
        `No se pudieron resolver los muros de "${sinMuros.spec.name}".`,
        "Revisá que el polígono esté cerrado y que sus lados no se solapen con muros existentes."
      );
    }

    const nuevosPorId = new Map<string, WallNode>(
      walls.map((wall) => [wall.id as string, wall])
    );
    const ocupados = new Map<string, Array<[number, number]>>();
    const aberturasPorAmbiente: AberturaCreada[][] = [];

    for (const plan of prepared) {
      const pedidos = plan.spec.openings ?? [];
      if (pedidos.length === 0) {
        aberturasPorAmbiente.push([]);
        continue;
      }

      const muros = plan.boundaryWallIds
        .map((id) => {
          const nuevo = nuevosPorId.get(id);
          if (nuevo) return nuevo;
          const existente = nodes[id as AnyNodeId];
          return existente?.type === "wall" ? existente : undefined;
        })
        .filter((node): node is WallNode => node !== undefined);

      const planeadas = planificarAberturas({
        pedidos,
        polygon: plan.polygon,
        muros,
        nodes,
        ocupados,
      });
      if ("error" in planeadas) return planeadas.error;
      warnings.push(...planeadas.warnings);
      aberturasPorAmbiente.push(planeadas.creadas);
    }

    const openings = aberturasPorAmbiente.flat();

    pauseSpaceDetection();
    try {
      runAsSingleSceneHistoryStep(useScene, () => {
        useScene.getState().applyNodeChanges({
          create: [
            ...walls.map((wall) => ({
              node: wall as AnyNode,
              parentId: levelId,
            })),
            ...prepared.flatMap(({ zone, slab, ceiling }) => [
              ...(zone ? [{ node: zone as AnyNode, parentId: levelId }] : []),
              ...(slab ? [{ node: slab as AnyNode, parentId: levelId }] : []),
              ...(ceiling
                ? [{ node: ceiling as AnyNode, parentId: levelId }]
                : []),
            ]),
            ...openings.map((abertura) => ({
              node: abertura.node as AnyNode,
              parentId: abertura.wallId as AnyNodeId,
            })),
          ],
        });
      });
    } finally {
      resumeSpaceDetection();
    }

    const nuevosIds = new Set<string>(walls.map((wall) => wall.id as string));
    const reusedWallIds = [
      ...new Set(
        prepared
          .flatMap((plan) => plan.boundaryWallIds)
          .filter((id) => !nuevosIds.has(id))
      ),
    ];
    const totalArea = planes.reduce((suma, plan) => suma + plan.area, 0);

    return ok(
      {
        levelId,
        wallIds: walls.map((wall) => wall.id),
        reusedWallIds,
        totalArea_m2: round(totalArea),
        rooms: prepared.map((plan, indice) => ({
          roomId: plan.zone?.id ?? null,
          name: plan.spec.name,
          area_m2: round(plan.area),
          perimeter_m: round(polygonPerimeter(plan.polygon)),
          polygon: plan.polygon,
          boundaryWallIds: plan.boundaryWallIds,
          slabId: plan.slab?.id ?? null,
          ceilingId: plan.ceiling?.id ?? null,
          openings: resumenAberturas(aberturasPorAmbiente[indice] ?? []),
        })),
      },
      warnings
    );
  },
};

const addOpeningInput = z.object({
  wallId: z
    .string()
    .optional()
    .describe(
      "ID del muro que recibe la abertura. Si no lo sabés, omitilo y pasá roomName."
    ),
  roomId: z
    .string()
    .optional()
    .describe("ID del ambiente (zone) donde va la abertura."),
  roomName: z
    .string()
    .min(1)
    .max(80)
    .optional()
    .describe(
      "Nombre del ambiente, tal como figura en el resumen de la escena (por ejemplo \"Sala\")."
    ),
  room: z
    .string()
    .min(1)
    .max(80)
    .optional()
    .describe("Alias de roomName."),
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

type AberturaNode = Extract<AnyNode, { type: "door" | "window" }>;

function normalizarNombre(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Cuántas zones referencian cada muro: 1 o 0 significa muro exterior. */
function usosDeMuros(nodes: Record<AnyNodeId, AnyNode>): Map<string, number> {
  const usos = new Map<string, number>();
  for (const nodo of Object.values(nodes)) {
    if (nodo.type !== "zone") continue;
    const ids = (nodo as unknown as { boundaryWallIds?: unknown })
      .boundaryWallIds;
    if (!Array.isArray(ids)) continue;
    for (const id of ids) {
      if (typeof id === "string") usos.set(id, (usos.get(id) ?? 0) + 1);
    }
  }
  return usos;
}

function aberturasDeMuro(
  nodes: Record<AnyNodeId, AnyNode>,
  wallId: string
): AberturaNode[] {
  return Object.values(nodes).filter(
    (node): node is AberturaNode =>
      (node.type === "door" || node.type === "window") &&
      (node.parentId === wallId || node.wallId === wallId)
  );
}

/**
 * Centro del hueco más grande del muro que entre para el ancho pedido.
 *
 * Evita que la segunda abertura caiga encima de la primera: el modelo suele
 * omitir `distanceFromStart`, y el centro del muro ya está ocupado.
 */
function huecosLibresEnMuro(
  wall: WallNode,
  nodes: Record<AnyNodeId, AnyNode>,
  width: number
): Array<[number, number]> {
  const length = wallLength(wall);
  const margen = 0.05;
  if (length < width + margen * 2) return [];

  const ocupados = aberturasDeMuro(nodes, wall.id)
    .map(
      (abertura) =>
        [
          abertura.position[0] - abertura.width / 2,
          abertura.position[0] + abertura.width / 2,
        ] as [number, number]
    )
    .sort((a, b) => a[0] - b[0]);

  let cursor = margen;
  const huecos: Array<[number, number]> = [];
  for (const [inicio, fin] of ocupados) {
    if (inicio - cursor >= width) huecos.push([cursor, inicio]);
    cursor = Math.max(cursor, fin);
  }
  if (length - margen - cursor >= width) {
    huecos.push([cursor, length - margen]);
  }

  return huecos;
}

function huecoLibreEnMuro(
  wall: WallNode,
  nodes: Record<AnyNodeId, AnyNode>,
  width: number
): number | null {
  const huecos = huecosLibresEnMuro(wall, nodes, width);
  if (huecos.length === 0) return null;

  const [inicio, fin] = huecos.reduce(
    (mejor, hueco) =>
      hueco[1] - hueco[0] > mejor[1] - mejor[0] ? hueco : mejor,
    huecos[0]
  );
  return (inicio + fin) / 2;
}

/** Una posición explícita choca con una abertura ya colocada en ese muro. */
function seSuperponeAbertura(
  wall: WallNode,
  nodes: Record<AnyNodeId, AnyNode>,
  distance: number,
  width: number
): boolean {
  const half = width / 2;
  return aberturasDeMuro(nodes, wall.id).some(
    (abertura) =>
      Math.abs(abertura.position[0] - distance) <
      half + abertura.width / 2 + 0.02
  );
}

interface MuroElegido {
  wall: WallNode;
  distance: number;
}

/**
 * Elige el muro del ambiente que mejor encaja con la abertura.
 *
 * Las ventanas van primero al muro exterior y las puertas al interior (el
 * acceso a otro ambiente); si no hay de ese tipo, se usa lo que haya. También
 * prefiere muros sin aberturas del mismo tipo y con hueco libre.
 */
function elegirMuroParaAbertura(input: {
  muros: WallNode[];
  nodes: Record<AnyNodeId, AnyNode>;
  kind: "door" | "window";
  width: number;
  usos: Map<string, number>;
  distanceFromStart?: number;
}): MuroElegido | null {
  const { muros, nodes, kind, width, usos, distanceFromStart } = input;
  let mejor: { elegido: MuroElegido; puntaje: number } | null = null;

  for (const wall of muros) {
    if (Math.abs(wall.curveOffset ?? 0) > EPSILON) continue;
    const length = wallLength(wall);
    if (length < width + 0.1) continue;

    const aberturas = aberturasDeMuro(nodes, wall.id);
    const mismoTipo = aberturas.filter((item) => item.type === kind).length;
    const distance =
      distanceFromStart ?? huecoLibreEnMuro(wall, nodes, width);
    if (distance === null) continue;

    const half = width / 2;
    if (distance - half < 0.05 || distance + half > length - 0.05) continue;

    // Una distancia explícita que choca con otra abertura descarta este muro:
    // antes se elegía igual y el error de solape llegaba recién al final.
    if (
      distanceFromStart !== undefined &&
      seSuperponeAbertura(wall, nodes, distance, width)
    ) {
      continue;
    }

    const exterior = (usos.get(wall.id) ?? 0) <= 1;
    let puntaje = length;
    if (kind === "window") puntaje += exterior ? 100 : 0;
    else puntaje += exterior ? 0 : 40;
    puntaje -= mismoTipo * 60;
    puntaje -= aberturas.length * 3;

    if (!mejor || puntaje > mejor.puntaje) {
      mejor = { elegido: { wall, distance }, puntaje };
    }
  }

  // Si la distancia explícita choca en todos los muros, se reintenta con el
  // hueco libre. El modelo suele pasar una distancia de memoria y lo que
  // quiere, en realidad, es que la abertura entre sin superponerse.
  if (!mejor && distanceFromStart !== undefined) {
    return elegirMuroParaAbertura({ ...input, distanceFromStart: undefined });
  }

  return mejor?.elegido ?? null;
}

function buscarZona(
  nodes: Record<AnyNodeId, AnyNode>,
  roomId?: string,
  roomName?: string,
  levelId?: string | null
): AnyNode | null {
  const todas = Object.values(nodes).filter((node) => node.type === "zone");

  if (roomId) {
    const exacta = todas.find((zona) => zona.id === roomId);
    if (exacta) return exacta;
  }

  if (roomName) {
    const buscado = normalizarNombre(roomName);
    if (!buscado) return null;

    const buscarEn = (zonas: AnyNode[]): AnyNode | null => {
      const exacta = zonas.find(
        (zona) => normalizarNombre(zona.name ?? "") === buscado
      );
      if (exacta) return exacta;

      return (
        zonas.find((zona) => {
          const nombreZona = normalizarNombre(zona.name ?? "");
          if (!nombreZona) return false;
          return (
            nombreZona.includes(buscado) || buscado.includes(nombreZona)
          );
        }) ?? null
      );
    };

    // El nivel activo manda: si hay dos "Sala" en distintos niveles, se elige
    // la del nivel que la persona está mirando. Si ahí no está, se busca en
    // toda la escena.
    if (levelId) {
      const delNivel = todas.filter((zona) => zona.parentId === levelId);
      const encontrada = buscarEn(delNivel);
      if (encontrada) return encontrada;
    }
    return buscarEn(todas);
  }

  return null;
}

/** Datos accionables para que el modelo se corrija sin otra lectura. */
function detallesDeAberturas(
  nodes: Record<AnyNodeId, AnyNode>,
  usos: Map<string, number>
) {
  const rooms = Object.values(nodes)
    .filter((node) => node.type === "zone")
    .map((zona) => ({
      id: zona.id,
      name: zona.name ?? zona.id,
      boundaryWallIds:
        (zona as unknown as { boundaryWallIds?: string[] })
          .boundaryWallIds ?? [],
    }));

  const walls = Object.values(nodes)
    .filter((node): node is WallNode => node.type === "wall")
    .slice(0, 40)
    .map((wall) => ({
      id: wall.id,
      start: wall.start,
      end: wall.end,
      length: round(wallLength(wall)),
      ext: (usos.get(wall.id) ?? 0) <= 1,
    }));

  return { rooms, walls };
}

export const addOpeningTool: AiTool<AddOpeningInput> = {
  name: "add_opening",
  description:
    "Agrega una puerta o ventana a un muro existente. Podés identificarlo con wallId o, más fácil, con roomName (nombre del ambiente tal como figura en el resumen). Sin distanceFromStart usa el hueco libre más grande del muro, que es lo habitual. Medidas sugeridas: puerta 0,9 × 2,1 m; ventana 1,2 × 1,5 m con sill 0,9. Todo ambiente habitable necesita al menos una puerta; los patios (height 0) no llevan aberturas.",
  input: addOpeningInput,
  risk: "write",
  async run(args, ctx) {
    const blocked = ensureWritable();
    if (blocked) return blocked;

    const nodes = useScene.getState().nodes;
    const usos = usosDeMuros(nodes);
    const detalles = detallesDeAberturas(nodes, usos);
    const width = args.width ?? (args.kind === "door" ? 0.9 : 1.2);
    const roomName = args.roomName ?? args.room;

    let wall: WallNode | null = null;
    let zona: AnyNode | null = null;
    let distance = args.distanceFromStart;
    let wallIdInvalido = false;

    if (args.wallId) {
      const candidato = nodes[args.wallId as AnyNodeId];
      if (candidato?.type === "wall") {
        wall = candidato;
      } else {
        // ID inventado: no se aborta; se intenta resolver por ambiente o por el
        // único ambiente del nivel antes de devolver el error.
        wallIdInvalido = true;
      }
    }

    if (!wall) {
      zona = buscarZona(nodes, args.roomId, roomName, ctx.levelId);
      const motivoMuro = wallIdInvalido
        ? `No existe el muro "${args.wallId}". `
        : "";
      let murosCandidatos: WallNode[];

      if (zona) {
        const ids =
          (zona as unknown as { boundaryWallIds?: string[] })
            .boundaryWallIds ?? [];
        murosCandidatos = ids
          .map((id) => nodes[id as AnyNodeId])
          .filter((nodo): nodo is WallNode => nodo?.type === "wall");
      } else if (!args.roomId && !roomName) {
        // Sin ambiente explícito: si hay uno solo, es inequívoco; si no hay
        // zones, se usan todos los muros del nivel activo.
        const zonasDelNivel = Object.values(nodes).filter(
          (nodo) =>
            nodo.type === "zone" &&
            (!ctx.levelId || nodo.parentId === ctx.levelId)
        );
        if (zonasDelNivel.length === 1) {
          zona = zonasDelNivel[0];
          const ids =
            (zona as unknown as { boundaryWallIds?: string[] })
              .boundaryWallIds ?? [];
          murosCandidatos = ids
            .map((id) => nodes[id as AnyNodeId])
            .filter((nodo): nodo is WallNode => nodo?.type === "wall");
        } else if (zonasDelNivel.length === 0) {
          murosCandidatos = Object.values(nodes).filter(
            (nodo): nodo is WallNode =>
              nodo.type === "wall" &&
              (!ctx.levelId || nodo.parentId === ctx.levelId)
          );
        } else {
          return fail(
            "ROOM_REQUIRED",
            `${motivoMuro}Hay varios ambientes: indicá en cuál va la abertura.`,
            "Pasá roomName con el nombre del ambiente (por ejemplo \"Sala\") o roomId.",
            detalles
          );
        }
      } else {
        return fail(
          "ROOM_NOT_FOUND",
          `${motivoMuro}No encontré el ambiente "${roomName ?? args.roomId}".`,
          "Usá el nombre exacto que figura en el resumen de la escena, o pasá wallId.",
          detalles
        );
      }

      if (murosCandidatos.length === 0) {
        return fail(
          "ROOM_WITHOUT_WALLS",
          `El ambiente "${zona?.name ?? roomName ?? args.roomId}" no tiene muros asociados.`,
          "Revisá la escena con get_level o pasá wallId.",
          detalles
        );
      }

      const elegido = elegirMuroParaAbertura({
        muros: murosCandidatos,
        nodes,
        kind: args.kind,
        width,
        usos,
        distanceFromStart: args.distanceFromStart,
      });
      if (!elegido) {
        return fail(
          "NO_FREE_WALL",
          `No hay un muro con espacio suficiente para una ${args.kind === "door" ? "puerta" : "ventana"} de ${round(width)} m en "${zona?.name ?? "el ambiente"}".`,
          "Probá un ancho menor, indicá otro ambiente o pasá wallId y distanceFromStart.",
          detalles
        );
      }
      wall = elegido.wall;
      distance = elegido.distance;
    } else if (distance === undefined) {
      distance = huecoLibreEnMuro(wall, nodes, width) ?? wallLength(wall) / 2;
    }

    if (!wall) {
      return fail(
        "WALL_NOT_FOUND",
        "No se pudo resolver el muro para la abertura.",
        "Pasá roomName o wallId.",
        detalles
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
    const height = args.height ?? (args.kind === "door" ? 2.1 : 1.5);
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

    const conflicto = aberturasDeMuro(nodes, wall.id).find(
      (abertura) =>
        Math.abs(abertura.position[0] - distance) <
        half + abertura.width / 2 + 0.02
    );
    if (conflicto) {
      const huecos = huecosLibresEnMuro(wall, nodes, width).map(
        ([inicio, fin]) => ({ start: round(inicio), end: round(fin) })
      );
      const sugerido = huecoLibreEnMuro(wall, nodes, width);
      return fail(
        "OPENING_OVERLAP",
        `La abertura se superpone con "${conflicto.name ?? conflicto.id}".`,
        sugerido !== null
          ? `Movela a otra posición o reintentá sin distanceFromStart: el hueco libre más grande está a ${round(sugerido)} m del inicio.`
          : "Movela a otra posición del muro o usá un ancho menor.",
        {
          wallId: wall.id,
          length: round(length),
          width,
          distanceFromStart: round(distance),
          freeSlots: huecos,
          suggestedDistance: sugerido === null ? null : round(sugerido),
        }
      );
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
      ...(zona ? { roomId: zona.id, roomName: zona.name ?? zona.id } : {}),
      name,
      distanceFromStart: round(distance),
      width,
      height,
      side: args.side,
      ...(args.kind === "window" ? { sill: args.sill } : {}),
    });
  },
};
