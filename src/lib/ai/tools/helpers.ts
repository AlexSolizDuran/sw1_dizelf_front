import {
  type AnyNode,
  type AnyNodeId,
  type LevelNode,
  type WallNode,
  useScene,
} from "@pascal-app/core";

export const EPSILON = 0.01;
export const MIN_WALL_LENGTH = 0.05;
export const MIN_POLYGON_AREA = 0.5;

export function round(value: number, decimals = 3): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function sceneNodes(): Record<AnyNodeId, AnyNode> {
  return useScene.getState().nodes;
}

export function sceneNode(nodeId: string): AnyNode | null {
  return sceneNodes()[nodeId as AnyNodeId] ?? null;
}

export function findLevel(
  nodes: Record<AnyNodeId, AnyNode>,
  levelId?: string | null
): LevelNode | null {
  if (levelId) {
    const node = nodes[levelId as AnyNodeId];
    return node?.type === "level" ? node : null;
  }
  return (
    Object.values(nodes).find((node): node is LevelNode => node.type === "level") ??
    null
  );
}

export function levelIdOf(node: AnyNode, nodes: Record<AnyNodeId, AnyNode>): AnyNodeId | null {
  let current: AnyNode | undefined = node;
  while (current) {
    if (current.type === "level") return current.id as AnyNodeId;
    current = current.parentId ? nodes[current.parentId as AnyNodeId] : undefined;
  }
  return null;
}

export function wallLength(wall: Pick<WallNode, "start" | "end">): number {
  return Math.hypot(wall.end[0] - wall.start[0], wall.end[1] - wall.start[1]);
}

export function effectiveWallHeight(wall: WallNode): number {
  return wall.height ?? 2.5;
}

export function effectiveWallThickness(wall: WallNode): number {
  return wall.thickness ?? 0.1;
}

export function pointsEqual(
  a: readonly number[],
  b: readonly number[],
  tolerance = EPSILON
): boolean {
  return (
    Math.abs(a[0] - b[0]) <= tolerance &&
    Math.abs(a[1] - b[1]) <= tolerance
  );
}

export function sameSegment(
  aStart: readonly number[],
  aEnd: readonly number[],
  bStart: readonly number[],
  bEnd: readonly number[]
): boolean {
  return (
    (pointsEqual(aStart, bStart) && pointsEqual(aEnd, bEnd)) ||
    (pointsEqual(aStart, bEnd) && pointsEqual(aEnd, bStart))
  );
}

export function polygonArea(points: readonly [number, number][]): number {
  let area = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    area += (points[j][0] + points[i][0]) * (points[j][1] - points[i][1]);
  }
  return Math.abs(area / 2);
}

export function polygonPerimeter(points: readonly [number, number][]): number {
  let perimeter = 0;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    perimeter += Math.hypot(
      points[i][0] - points[j][0],
      points[i][1] - points[j][1]
    );
  }
  return perimeter;
}

export function polygonCentroid(
  points: readonly [number, number][]
): [number, number] {
  const sum = points.reduce(
    (acc, point) => [acc[0] + point[0], acc[1] + point[1]] as [number, number],
    [0, 0] as [number, number]
  );
  return [sum[0] / points.length, sum[1] / points.length];
}

export function pointInPolygon(
  x: number,
  z: number,
  points: readonly [number, number][]
): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, zi] = points[i];
    const [xj, zj] = points[j];
    if (
      zi > z !== zj > z &&
      x < ((xj - xi) * (z - zi)) / (zj - zi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function orientation(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number]
): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function pointOnSegment(
  a: readonly [number, number],
  b: readonly [number, number],
  p: readonly [number, number]
): boolean {
  return (
    p[0] >= Math.min(a[0], b[0]) - EPSILON &&
    p[0] <= Math.max(a[0], b[0]) + EPSILON &&
    p[1] >= Math.min(a[1], b[1]) - EPSILON &&
    p[1] <= Math.max(a[1], b[1]) + EPSILON
  );
}

export function segmentsIntersect(
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  d: readonly [number, number]
): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  if (Math.abs(o1) <= EPSILON && pointOnSegment(a, b, c)) return true;
  if (Math.abs(o2) <= EPSILON && pointOnSegment(a, b, d)) return true;
  if (Math.abs(o3) <= EPSILON && pointOnSegment(c, d, a)) return true;
  if (Math.abs(o4) <= EPSILON && pointOnSegment(c, d, b)) return true;
  return false;
}

export function isSimplePolygon(points: readonly [number, number][]): boolean {
  if (points.length < 3) return false;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    if (pointsEqual(a, b)) return false;

    for (let j = i + 1; j < points.length; j++) {
      const c = points[j];
      const d = points[(j + 1) % points.length];

      // Segmentos adyacentes comparten un extremo: no cuentan como cruce.
      if (
        i === j ||
        (i + 1) % points.length === j ||
        (j + 1) % points.length === i
      ) {
        continue;
      }

      if (segmentsIntersect(a, b, c, d)) return false;
    }
  }
  return true;
}

export function normalizePolygon(
  input: readonly [number, number][]
): [number, number][] {
  const points = input
    .filter(
      (point): point is [number, number] =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1])
    )
    .map((point) => [point[0], point[1]] as [number, number]);

  const deduped: [number, number][] = [];
  for (const point of points) {
    if (
      deduped.length === 0 ||
      !pointsEqual(deduped[deduped.length - 1], point)
    ) {
      deduped.push(point);
    }
  }

  if (
    deduped.length > 1 &&
    pointsEqual(deduped[0], deduped[deduped.length - 1])
  ) {
    deduped.pop();
  }

  return deduped;
}

export function countTypes(
  nodes: Record<AnyNodeId, AnyNode>
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of Object.values(nodes)) {
    counts[node.type] = (counts[node.type] ?? 0) + 1;
  }
  return counts;
}

export function childrenOfType<T extends AnyNode["type"]>(
  nodes: Record<AnyNodeId, AnyNode>,
  parentId: string,
  type: T
): Extract<AnyNode, { type: T }>[] {
  return Object.values(nodes).filter(
    (node): node is Extract<AnyNode, { type: T }> =>
      node.type === type && node.parentId === parentId
  );
}

export function descendants(
  nodes: Record<AnyNodeId, AnyNode>,
  rootId: string
): AnyNodeId[] {
  const out: AnyNodeId[] = [];
  const stack = [rootId];
  const seen = new Set<string>();

  while (stack.length > 0) {
    const id = stack.pop();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id as AnyNodeId);
    const node = nodes[id as AnyNodeId];
    if (!node || !("children" in node) || !Array.isArray(node.children)) {
      continue;
    }
    stack.push(...node.children);
  }

  return out;
}

const COMPACT_FIELDS: Record<string, string[]> = {
  wall: [
    "start",
    "end",
    "height",
    "thickness",
    "curveOffset",
    "children",
    "frontSide",
    "backSide",
    "materialPreset",
    "slots",
  ],
  zone: ["polygon", "boundaryWallIds", "autoFromWalls", "color"],
  slab: [
    "polygon",
    "holes",
    "elevation",
    "autoFromWalls",
    "materialPreset",
    "slots",
  ],
  ceiling: [
    "polygon",
    "holes",
    "height",
    "autoFromWalls",
    "materialPreset",
    "slots",
    "children",
  ],
  door: [
    "wallId",
    "position",
    "rotation",
    "side",
    "width",
    "height",
    "doorType",
    "doorCategory",
    "openingKind",
    "swingDirection",
    "leafCount",
    "slots",
  ],
  window: [
    "wallId",
    "position",
    "rotation",
    "side",
    "width",
    "height",
    "windowType",
    "openingKind",
    "sill",
    "slots",
  ],
  item: [
    "position",
    "rotation",
    "scale",
    "wallId",
    "wallT",
    "roofSegmentId",
    "roofFace",
    "collectionIds",
    "slots",
  ],
  column: [
    "position",
    "rotation",
    "width",
    "depth",
    "height",
    "style",
    "materialPreset",
    "slots",
  ],
  fence: [
    "start",
    "end",
    "thickness",
    "height",
    "materialPreset",
    "slots",
  ],
  shelf: [
    "position",
    "rotation",
    "width",
    "depth",
    "height",
    "style",
    "materialPreset",
    "slots",
  ],
  stair: [
    "position",
    "rotation",
    "stairType",
    "width",
    "totalRise",
    "stepCount",
    "thickness",
    "fromLevelId",
    "toLevelId",
    "children",
  ],
  roof: ["pitch", "children", "materialPreset"],
  "roof-segment": ["children", "materialPreset"],
  level: ["level", "children"],
  building: ["position", "rotation", "children"],
  site: ["polygon", "children"],
};

export function compactNode(node: AnyNode): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: node.id,
    type: node.type,
  };

  if (node.name) out.name = node.name;
  if (node.parentId) out.parentId = node.parentId;
  if (node.visible === false) out.visible = false;

  for (const key of COMPACT_FIELDS[node.type] ?? []) {
    const value = (node as unknown as Record<string, unknown>)[key];
    if (value !== undefined && value !== null) out[key] = value;
  }

  if (node.type === "wall") {
    out.length = round(wallLength(node));
  }

  if (node.type === "zone") {
    out.area_m2 = round(polygonArea(node.polygon));
    out.perimeter_m = round(polygonPerimeter(node.polygon));
  }

  if (node.type === "item") {
    out.asset = {
      id: node.asset.id,
      name: node.asset.name,
      category: node.asset.category,
      dimensions: node.asset.dimensions,
      attachTo: node.asset.attachTo,
      thumbnail: node.asset.thumbnail,
    };
  }

  return out;
}
