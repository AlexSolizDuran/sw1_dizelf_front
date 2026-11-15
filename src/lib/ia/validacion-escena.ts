"use client";

import {
  type AnyNode,
  type AnyNodeId,
  type DoorNode,
  type LevelNode,
  type WallNode,
  type WindowNode,
  type ZoneNode,
  detectSpacesForLevel,
  validateBuildJson,
} from "@pascal-app/core";
import {
  childrenOfType,
  effectiveWallHeight,
  polygonArea,
  round,
  wallLength,
} from "./tools/helpers";
import { requiereVentana, tipoAmbiente } from "./tipos-ambiente";

/**
 * Validación de escena fuera del store.
 *
 * Es la misma cuenta que devuelve `validate_scene`, pero como función pura
 * sobre `nodes` para poder correrla sobre el borrador del turno (ver
 * `preview.ts`) y avisarle al modelo en el mismo mensaje de la tool.
 */

export type Issue = {
  severity: "error" | "warning";
  code: string;
  message: string;
  nodeId?: string;
};

export interface ReporteNivel {
  levelId: string;
  name: string;
  walls: number;
  zones: number;
  openings: number;
  slabs: number;
  ceilings: number;
  detectedSpaces: number;
}

export interface ValidacionEscena {
  ok: boolean;
  errorCount: number;
  warningCount: number;
  errors: Issue[];
  warnings: Issue[];
  truncated?: boolean;
  schemaIssueCount: number;
  stats: Record<string, unknown> | undefined;
  levels: ReporteNivel[];
}

/** Abertura imprescindible que le falta a un ambiente habitable. */
export interface AberturaFaltante {
  roomId?: string;
  roomName: string;
  falta: "door" | "window";
}

export interface OpcionesValidacion {
  nodes: Record<AnyNodeId, AnyNode>;
  rootNodeIds: AnyNodeId[];
  installedPlugins: string[];
  levelId?: string | null;
}

/** Devuelve `null` si se pidió un nivel que no existe. */
export function validarEscena({
  nodes,
  rootNodeIds,
  installedPlugins,
  levelId,
}: OpcionesValidacion): ValidacionEscena | null {
  if (levelId) {
    const candidato = nodes[levelId as AnyNodeId];
    if (candidato?.type !== "level") return null;
  }

  const validation = validateBuildJson({
    nodes,
    rootNodeIds,
    installedPlugins,
  } as never);

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
    .filter((candidate) => !levelId || candidate.id === levelId);

  const levelReports: ReporteNivel[] = [];

  for (const currentLevel of levels) {
    const id = currentLevel.id as AnyNodeId;
    const walls = childrenOfType(nodes, id, "wall");
    const zones = childrenOfType(nodes, id, "zone");
    const wallById = new Map<string, WallNode>(walls.map((wall) => [wall.id, wall]));

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
      const wall = opening.wallId ? wallById.get(opening.wallId) : undefined;
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

    const slabs = childrenOfType(nodes, id, "slab");
    const ceilings = childrenOfType(nodes, id, "ceiling");
    for (const slab of slabs) validatePolygon(slab, "slab", errors);
    for (const ceiling of ceilings) validatePolygon(ceiling, "ceiling", errors);

    // Un ambiente con techo propio es una estancia cerrada: avisar si le
    // faltan aberturas permite que el modelo complete el pedido en el mismo
    // turno. Los patios (sin techo) quedan afuera, y la ventana solo se exige
    // donde tiene sentido (ver `requiereVentana`): un pasillo o un vestidor no
    // necesitan una, y pedirla generaba trabajo de más para el modelo.
    for (const zone of zones) {
      const habitable = ceilings.some((ceiling) =>
        mismoPoligono(ceiling.polygon, zone.polygon)
      );
      if (!habitable) continue;
      const boundary = new Set<string>(zone.boundaryWallIds ?? []);
      if (boundary.size === 0) continue;
      const propias = openings.filter(
        (opening) => opening.wallId && boundary.has(opening.wallId)
      );
      if (!propias.some((opening) => opening.type === "door")) {
        warnings.push({
          severity: "warning",
          code: "zone_without_door",
          message: `El ambiente ${zone.name ?? zone.id} no tiene puerta.`,
          nodeId: zone.id,
        });
      }
      if (
        requiereVentana(tipoAmbiente(zone.name ?? "", polygonArea(zone.polygon))) &&
        !propias.some((opening) => opening.type === "window")
      ) {
        warnings.push({
          severity: "warning",
          code: "zone_without_window",
          message: `El ambiente ${zone.name ?? zone.id} no tiene ventana.`,
          nodeId: zone.id,
        });
      }
    }

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

  return {
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
    stats: validation.stats,
    levels: levelReports,
  };
}

function mismoPoligono(
  a: readonly [number, number][],
  b: readonly [number, number][]
): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (punto, indice) =>
      Math.abs(punto[0] - b[indice][0]) <= 0.01 &&
      Math.abs(punto[1] - b[indice][1]) <= 0.01
  );
}

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

/**
 * Lista completa de aberturas faltantes, sin el recorte de `detalle`.
 *
 * `resumirValidacion` muestra solo dos advertencias prioritarias; con cuatro
 * ambientes eso no alcanza para que el modelo sepa cuáles completar. Esta
 * lista viaja completa en la respuesta de cada tool y en el nudge.
 */
export function aberturasFaltantes(
  validacion: ValidacionEscena
): AberturaFaltante[] {
  const faltantes: AberturaFaltante[] = [];

  for (const issue of validacion.warnings) {
    const falta =
      issue.code === "zone_without_door"
        ? "door"
        : issue.code === "zone_without_window"
          ? "window"
          : null;
    if (!falta) continue;

    const prefijo = "El ambiente ";
    const sufijo =
      falta === "door" ? " no tiene puerta." : " no tiene ventana.";
    let roomName = issue.message;
    if (roomName.startsWith(prefijo)) roomName = roomName.slice(prefijo.length);
    if (roomName.endsWith(sufijo)) {
      roomName = roomName.slice(0, -sufijo.length);
    }

    faltantes.push({
      ...(issue.nodeId ? { roomId: issue.nodeId } : {}),
      roomName: roomName.trim() || issue.nodeId || "ambiente",
      falta,
    });
  }

  return faltantes;
}

/**
 * Versión corta para el mensaje que recibe el modelo: conteos, hasta cuatro
 * problemas y la lista completa de aberturas faltantes. El detalle completo
 * sigue disponible con `validate_scene`.
 */
export function resumirValidacion(validacion: ValidacionEscena): {
  errores: number;
  advertencias: number;
  detalle: string[];
  faltantes: AberturaFaltante[];
} {
  const prioritarias = validacion.warnings.filter(
    (issue) =>
      issue.code === "zone_without_door" ||
      issue.code === "zone_without_window"
  );
  const otras = validacion.warnings.filter(
    (issue) => !prioritarias.includes(issue)
  );
  const detalle = [
    ...validacion.errors.slice(0, 2),
    ...prioritarias.slice(0, 2),
    ...otras.slice(0, 2),
  ].map((issue) => `${issue.code}: ${issue.message}`.slice(0, 140));

  return {
    errores: validacion.errorCount,
    advertencias: validacion.warningCount,
    detalle,
    faltantes: aberturasFaltantes(validacion),
  };
}
