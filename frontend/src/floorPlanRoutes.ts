export type FloorPlanPoint = {
  locationId: string;
  floor: string;
  x: number;
  y: number;
  offsetSeconds?: number;
};

type RouteNode = {
  id: string;
  floor: string;
  x: number;
  y: number;
  links: string[];
};

export const floorPlanPositions: Record<string, { x: number; y: number }> = {
  WP01: { x: 10.0, y: 76.5 },
  WP02: { x: 10.2, y: 51.4 },
  WP03: { x: 23.2, y: 38.6 },
  WP04: { x: 19.7, y: 12.7 },
  WP05: { x: 40.6, y: 36.2 },
  WP06: { x: 50.7, y: 12.7 },
  WP07: { x: 61.0, y: 47.0 },
  WP08: { x: 35.0, y: 69.2 },
  WP09: { x: 50.4, y: 69.2 },
  WP10: { x: 61.8, y: 71.5 },
  WP11: { x: 77.1, y: 21.7 },
  WP12: { x: 90.7, y: 22.0 },
  WP13: { x: 76.4, y: 54.4 },
  WP14: { x: 89.8, y: 58.5 },
  WP15: { x: 81.4, y: 79.8 },
};

export const floorPlanZones: Record<
  string,
  { x: number; y: number; width: number; height: number; polygon?: string }
> = {
  WP01: { x: 6.2, y: 69.0, width: 11.2, height: 24.5 },
  WP02: { x: 6.5, y: 42.3, width: 9.0, height: 25.0 },
  WP03: { x: 15.2, y: 28.5, width: 13.6, height: 26.5 },
  WP04: { x: 14.1, y: 4.7, width: 14.6, height: 22.6 },
  WP05: { x: 28.4, y: 26.5, width: 28.5, height: 26.5 },
  WP06: { x: 44.6, y: 4.8, width: 14.6, height: 22.5 },
  WP07: {
    x: 57.5,
    y: 20.5,
    width: 8.7,
    height: 51.0,
    polygon: "0 0, 58% 0, 58% 20%, 100% 20%, 100% 100%, 0 100%",
  },
  WP08: {
    x: 26.5,
    y: 55.6,
    width: 18.0,
    height: 35.4,
    polygon: "0 0, 100% 0, 100% 100%, 15% 100%, 15% 58%, 0 58%",
  },
  WP09: {
    x: 44.4,
    y: 55.8,
    width: 12.4,
    height: 35.0,
    polygon: "0 0, 100% 0, 100% 100%, 22% 100%, 22% 70%, 0 70%",
  },
  WP10: { x: 57.7, y: 61.5, width: 8.0, height: 27.0 },
  WP11: { x: 71.0, y: 10.5, width: 11.8, height: 25.0 },
  WP12: {
    x: 83.0,
    y: 3.0,
    width: 13.2,
    height: 33.0,
    polygon: "0 0, 100% 0, 100% 100%, 0 100%, 0 27%",
  },
  WP13: {
    x: 70.8,
    y: 40.2,
    width: 12.2,
    height: 30.5,
    polygon: "0 0, 85% 0, 85% 68%, 100% 68%, 100% 100%, 0 100%",
  },
  WP14: {
    x: 83.0,
    y: 42.4,
    width: 13.4,
    height: 27.0,
    polygon: "0 0, 100% 0, 100% 100%, 0 100%, 0 18%",
  },
  WP15: {
    x: 72.2,
    y: 72.0,
    width: 18.5,
    height: 21.6,
    polygon:
      "0 0, 45% 0, 45% 12%, 65% 12%, 65% 0, 100% 0, 100% 100%, 0 100%",
  },
};

const routeGraph: RouteNode[] = [
  { id: "WP01", floor: "1", x: 10.0, y: 76.5, links: ["F1_LEFT_LOWER"] },
  { id: "WP02", floor: "1", x: 10.2, y: 51.4, links: ["F1_LEFT_LOWER"] },
  { id: "WP03", floor: "1", x: 23.2, y: 38.6, links: ["F1_UPPER_LEFT", "F1_LOWER_LEFT"] },
  { id: "WP04", floor: "1", x: 19.7, y: 12.7, links: ["F1_UPPER_LEFT"] },
  { id: "WP05", floor: "1", x: 40.6, y: 36.2, links: ["F1_WP05_NORTH", "F1_WP05_SOUTH"] },
  { id: "WP06", floor: "1", x: 50.7, y: 12.7, links: ["F1_UPPER_MID"] },
  { id: "WP07", floor: "1", x: 61.0, y: 47.0, links: ["F1_EAST_MID"] },
  { id: "WP08", floor: "1", x: 35.0, y: 69.2, links: ["F1_LOWER_MID"] },
  { id: "WP09", floor: "1", x: 50.4, y: 69.2, links: ["F1_LOWER_RIGHT"] },
  { id: "WP10", floor: "1", x: 61.8, y: 71.5, links: ["F1_EAST_LOWER"] },
  { id: "F1_LEFT_LOWER", floor: "1", x: 10.0, y: 62.0, links: ["WP01", "WP02", "F1_LOWER_LEFT"] },
  { id: "F1_LOWER_LEFT", floor: "1", x: 23.2, y: 62.0, links: ["WP03", "F1_LEFT_LOWER", "F1_LOWER_MID"] },
  { id: "F1_LOWER_MID", floor: "1", x: 35.0, y: 62.0, links: ["WP08", "F1_LOWER_LEFT", "F1_WP05_SOUTH"] },
  { id: "F1_WP05_SOUTH", floor: "1", x: 40.6, y: 53.5, links: ["WP05", "F1_LOWER_MID", "F1_LOWER_RIGHT"] },
  { id: "F1_LOWER_RIGHT", floor: "1", x: 50.4, y: 62.0, links: ["WP09", "F1_WP05_SOUTH", "F1_EAST_LOWER"] },
  { id: "F1_EAST_LOWER", floor: "1", x: 61.8, y: 62.0, links: ["WP10", "F1_LOWER_RIGHT", "F1_EAST_MID"] },
  { id: "F1_EAST_MID", floor: "1", x: 61.8, y: 47.0, links: ["WP07", "F1_EAST_LOWER", "F1_EAST_UPPER"] },
  { id: "F1_EAST_UPPER", floor: "1", x: 61.8, y: 28.0, links: ["F1_EAST_MID", "F1_UPPER_MID"] },
  { id: "F1_UPPER_MID", floor: "1", x: 50.7, y: 28.0, links: ["WP06", "F1_EAST_UPPER", "F1_WP05_NORTH"] },
  { id: "F1_WP05_NORTH", floor: "1", x: 40.6, y: 28.0, links: ["WP05", "F1_UPPER_MID", "F1_UPPER_LEFT"] },
  { id: "F1_UPPER_LEFT", floor: "1", x: 23.2, y: 28.0, links: ["WP03", "WP04", "F1_WP05_NORTH"] },
  { id: "WP11", floor: "2", x: 77.1, y: 21.7, links: ["F2_UPPER_LEFT"] },
  { id: "WP12", floor: "2", x: 90.7, y: 22.0, links: ["F2_UPPER_RIGHT"] },
  { id: "WP13", floor: "2", x: 76.4, y: 54.4, links: ["F2_MID_LEFT"] },
  { id: "WP14", floor: "2", x: 89.8, y: 58.5, links: ["F2_MID_RIGHT"] },
  { id: "WP15", floor: "2", x: 81.4, y: 79.8, links: ["F2_LOWER_MID"] },
  { id: "F2_UPPER_LEFT", floor: "2", x: 77.1, y: 36.5, links: ["WP11", "F2_UPPER_RIGHT", "F2_MID_LEFT"] },
  { id: "F2_UPPER_RIGHT", floor: "2", x: 90.7, y: 36.5, links: ["WP12", "F2_UPPER_LEFT", "F2_MID_RIGHT"] },
  { id: "F2_MID_LEFT", floor: "2", x: 76.4, y: 70.5, links: ["WP13", "F2_UPPER_LEFT", "F2_LOWER_MID"] },
  { id: "F2_MID_RIGHT", floor: "2", x: 89.8, y: 70.5, links: ["WP14", "F2_UPPER_RIGHT", "F2_LOWER_MID"] },
  { id: "F2_LOWER_MID", floor: "2", x: 81.4, y: 70.5, links: ["WP15", "F2_MID_LEFT", "F2_MID_RIGHT"] },
];

const routeNodes = new Map(routeGraph.map((node) => [node.id, node]));

function distance(a: Pick<FloorPlanPoint, "x" | "y">, b: Pick<FloorPlanPoint, "x" | "y">) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function shortestRouteIds(fromId: string, toId: string) {
  const start = routeNodes.get(fromId);
  const end = routeNodes.get(toId);
  if (!start || !end || start.floor !== end.floor) return [];

  const distances = new Map<string, number>([[fromId, 0]]);
  const previous = new Map<string, string>();
  const unvisited = new Set(routeGraph.filter((node) => node.floor === start.floor).map((node) => node.id));

  while (unvisited.size > 0) {
    const currentId = Array.from(unvisited).sort(
      (a, b) => (distances.get(a) ?? Infinity) - (distances.get(b) ?? Infinity),
    )[0];
    if (!currentId || (distances.get(currentId) ?? Infinity) === Infinity) break;
    if (currentId === toId) break;

    unvisited.delete(currentId);
    const current = routeNodes.get(currentId);
    if (!current) continue;

    current.links.forEach((linkId) => {
      if (!unvisited.has(linkId)) return;
      const linked = routeNodes.get(linkId);
      if (!linked || linked.floor !== current.floor) return;
      const nextDistance = (distances.get(currentId) ?? 0) + distance(current, linked);
      if (nextDistance < (distances.get(linkId) ?? Infinity)) {
        distances.set(linkId, nextDistance);
        previous.set(linkId, currentId);
      }
    });
  }

  if (fromId !== toId && !previous.has(toId)) return [];

  const path = [toId];
  while (path[0] !== fromId) {
    const next = previous.get(path[0]);
    if (!next) return [];
    path.unshift(next);
  }
  return path;
}

function withInterpolatedOffsets<T extends FloorPlanPoint>(
  points: T[],
  startOffset = 0,
  endOffset = startOffset,
) {
  if (points.length < 2 || startOffset === endOffset) {
    return points.map((point) => ({ ...point, offsetSeconds: point.offsetSeconds ?? startOffset }));
  }

  const segmentLengths = points.slice(1).map((point, index) => distance(points[index], point));
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);
  let traveled = 0;

  return points.map((point, index) => {
    if (index > 0) traveled += segmentLengths[index - 1];
    const progress = totalLength > 0 ? traveled / totalLength : 0;
    return {
      ...point,
      offsetSeconds: startOffset + (endOffset - startOffset) * progress,
    };
  });
}

function routeHop<T extends FloorPlanPoint>(from: T, to: T) {
  const routeIds = shortestRouteIds(from.locationId, to.locationId);
  if (routeIds.length === 0) return [from, to];

  const routePoints = routeIds
    .map((id) => routeNodes.get(id))
    .filter((node): node is RouteNode => Boolean(node))
    .map((node) => ({
      ...from,
      locationId: node.id.startsWith("WP") ? node.id : from.locationId,
      floor: node.floor,
      x: node.x,
      y: node.y,
    }));

  return withInterpolatedOffsets(
    routePoints as T[],
    from.offsetSeconds,
    to.offsetSeconds,
  );
}

export function buildRoutedPath<T extends FloorPlanPoint>(points: T[]) {
  if (points.length < 2) return points;

  return points.slice(1).reduce<T[]>((path, point, index) => {
    const previous = points[index];
    const hop = routeHop(previous, point);
    if (path.length > 0) hop.shift();
    return [...path, ...hop];
  }, [points[0]]);
}

export function splitRouteSegments<T extends FloorPlanPoint>(points: T[]) {
  return points.reduce<T[][]>((segments, point) => {
    const currentSegment = segments.at(-1);
    const lastPoint = currentSegment?.at(-1);
    if (!currentSegment || lastPoint?.floor !== point.floor) {
      segments.push([point]);
    } else {
      currentSegment.push(point);
    }
    return segments;
  }, []);
}

export function buildRouteSegments<T extends FloorPlanPoint>(points: T[]) {
  return splitRouteSegments(buildRoutedPath(points));
}

export function formatRoutePoints(points: FloorPlanPoint[]) {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}
