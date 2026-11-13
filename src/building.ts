import { deriveExteriorContour } from "./exterior";
import {
  dist,
  openingFrame,
  rotate,
  type Opening,
  type Plan,
  type Point,
  type Wall,
} from "./model";

export type RoofSettings = {
  type: "flat" | "shed" | "gable";
  pitch?: number;
  direction?: number;
  thickness?: number;
};
export type BuildingSettings = {
  defaultWallHeight?: number;
  floorLevel?: number;
  roof?: RoofSettings;
};
export const DEFAULT_WALL_HEIGHT = 240;
export const DEFAULT_ROOF_PITCH = 30;
export const DEFAULT_ROOF_THICKNESS = 24;

export type Point3 = Point & { z: number };
export type BuildingFootprint = {
  corners: Point[];
  wallIds: string[];
  /** Perimeter wall IDs by clockwise outside edge, starting at corners[0]. */
  edgeWallIds: string[][];
};
export type BuildingOpening = {
  opening: Opening;
  center: Point;
  sill: number;
  height: number;
  bottom: number;
  top: number;
  fits: boolean;
};
export type BuildingWall = {
  wall: Wall;
  height: number;
  bottom: number;
  top: number;
  exterior: boolean;
  openings: BuildingOpening[];
};
export type BuildingRoof = {
  type: RoofSettings["type"];
  pitch: number;
  direction: number;
  thickness: number;
  verticalThickness: number;
  base: number;
  footprint: Point[];
  /** Plan vertices and elevations of the roof underside in a common datum. */
  facets: Point3[][];
  ridge?: [Point3, Point3];
  /** Unit direction of ascent (shed) or perpendicular to the ridge (gable). */
  axis: Point;
  origin: Point;
  low: number;
  span: number;
  slope: number;
};
export type BuildingIssue = { code: string; message: string; itemId?: string };
export type BuildingGeometry = {
  floorLevel: number;
  footprint?: BuildingFootprint;
  walls: BuildingWall[];
  roof?: BuildingRoof;
  issues: BuildingIssue[];
};

const tolerance = 1e-6;
const subtract = (a: Point, b: Point): Point => ({
  x: a.x - b.x,
  y: a.y - b.y,
});
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const interpolate = (a: Point, b: Point, t: number): Point => ({
  x: a.x + t * (b.x - a.x),
  y: a.y + t * (b.y - a.y),
});

export function wallHeight(plan: Plan, wall: Wall) {
  return wall.height ?? plan.building?.defaultWallHeight ?? DEFAULT_WALL_HEIGHT;
}

export function openingVertical(plan: Plan, opening: Opening, host?: Wall) {
  host ??= plan.items.find(
    (item): item is Wall => item.type === "wall" && item.id === opening.hostId,
  );
  const sill = opening.sill ?? (opening.type === "door" ? 0 : 90);
  const height = opening.height ?? (opening.type === "door" ? 210 : 100);
  const bottom = (plan.building?.floorLevel ?? 0) + sill;
  return {
    sill,
    height,
    bottom,
    top: bottom + height,
    fits: Boolean(host && sill + height <= wallHeight(plan, host) + tolerance),
  };
}

function convexHull(points: Point[]) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const unique = sorted.filter(
    (point, i) => !i || dist(point, sorted[i - 1]) > tolerance,
  );
  const half = (sequence: Point[]) => {
    const chain: Point[] = [];
    for (const point of sequence) {
      while (chain.length >= 2) {
        const a = chain[chain.length - 2],
          b = chain[chain.length - 1];
        if (cross(subtract(b, a), subtract(point, a)) > tolerance * dist(a, b))
          break;
        chain.pop();
      }
      chain.push(point);
    }
    chain.pop();
    return chain;
  };
  return [...half(unique), ...half(unique.reverse())];
}

/** Find wall-backed supporting edges, retaining collinear subdivisions. */
function buildingFootprint(
  plan: Plan,
  walls: Wall[],
): BuildingFootprint | undefined {
  if (walls.length < 3) return;
  const hull = convexHull(walls.flatMap((wall) => [wall.a, wall.b]));
  if (hull.length < 3) return;
  const center = hull.reduce(
    (sum, p) => ({
      x: sum.x + p.x / hull.length,
      y: sum.y + p.y / hull.length,
    }),
    { x: 0, y: 0 },
  );
  const polarAngle = (p: Point) => Math.atan2(p.y - center.y, p.x - center.x);
  const edges = hull
    .map((a, i) => {
      const b = hull[(i + 1) % hull.length];
      const length = dist(a, b);
      return {
        a,
        b,
        length,
        angle: polarAngle(a),
        direction: { x: (b.x - a.x) / length, y: (b.y - a.y) / length },
        segments: [] as { wall: Wall; start: number; end: number }[],
      };
    })
    .sort((a, b) => a.angle - b.angle);

  for (const wall of walls) {
    const theta = polarAngle(interpolate(wall.a, wall.b, 0.5));
    let left = 0,
      right = edges.length;
    while (left < right) {
      const mid = (left + right) >>> 1;
      if (edges[mid].angle <= theta) left = mid + 1;
      else right = mid;
    }
    const edge = edges[(left + edges.length - 1) % edges.length];
    const a = subtract(wall.a, edge.a),
      b = subtract(wall.b, edge.a);
    if (
      Math.abs(cross(edge.direction, a)) > tolerance ||
      Math.abs(cross(edge.direction, b)) > tolerance
    )
      continue;
    const projections = [dot(a, edge.direction), dot(b, edge.direction)];
    edge.segments.push({
      wall,
      start: Math.min(...projections),
      end: Math.max(...projections),
    });
  }

  for (const edge of edges) {
    const sorted = edge.segments.sort((a, b) => a.start - b.start);
    if (!sorted.length) return;
    let end = 0;
    for (const segment of sorted) {
      // Gaps, overlaps and thickness steps do not form a single supported,
      // straight outside face.
      if (
        Math.abs(segment.start - end) > tolerance ||
        Math.abs(segment.wall.thickness - sorted[0].wall.thickness) > tolerance
      )
        return;
      end = segment.end;
    }
    if (Math.abs(end - edge.length) > tolerance) return;
  }

  const contour = deriveExteriorContour({
    ...plan,
    items: edges.map((edge, index): Wall => ({
      id: String(index),
      name: "",
      type: "wall",
      a: edge.a,
      b: edge.b,
      thickness: edge.segments[0].wall.thickness,
    })),
  });
  if (contour.status !== "ready") return;
  // Match each offset contour edge to its centerline edge by direction. Both
  // lists are clockwise, so one alignment maps every edge in linear time.
  const first = subtract(contour.corners[1], contour.corners[0]);
  const length = Math.hypot(first.x, first.y);
  const start = edges.findIndex(
    ({ direction }) =>
      dot(direction, first) > 0 &&
      Math.abs(cross(direction, first)) <= tolerance * length,
  );
  if (start < 0) return;
  const edgeWallIds = contour.corners.map((_, index) =>
    edges[(index + start) % edges.length].segments.map(({ wall }) => wall.id),
  );
  return { corners: contour.corners, wallIds: edgeWallIds.flat(), edgeWallIds };
}

export function roofHeightAt(
  roof: BuildingRoof,
  point: Point,
  surface: "underside" | "top" = "underside",
) {
  const run = Math.max(
    0,
    Math.min(
      roof.span,
      dot(subtract(point, roof.origin), roof.axis) - roof.low,
    ),
  );
  const rise = roof.type === "gable" ? Math.min(run, roof.span - run) : run;
  return (
    roof.base +
    roof.slope * rise +
    (surface === "top" ? roof.verticalThickness : 0)
  );
}

export function wallTopAt(
  wall: BuildingWall,
  point: Point,
  roof?: BuildingRoof,
) {
  return roof && wall.exterior && Math.abs(wall.top - roof.base) <= tolerance
    ? roofHeightAt(roof, point)
    : wall.top;
}

function splitFootprint(
  points: Point[],
  signedDistance: (point: Point) => number,
) {
  const low: Point[] = [],
    high: Point[] = [],
    ridge: Point[] = [];
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length];
    const d = signedDistance(a),
      next = signedDistance(b);
    if (d <= tolerance) low.push(a);
    if (d >= -tolerance) high.push(a);
    if (Math.abs(d) <= tolerance) ridge.push(a);
    if (
      (d < -tolerance && next > tolerance) ||
      (d > tolerance && next < -tolerance)
    ) {
      const hit = interpolate(a, b, d / (d - next));
      low.push(hit);
      high.push(hit);
      ridge.push(hit);
    }
  });
  return { facets: [low, high], ridge };
}

function buildRoof(
  settings: RoofSettings,
  footprint: BuildingFootprint,
  base: number,
): BuildingRoof {
  const { type } = settings;
  const pitch = type === "flat" ? 0 : (settings.pitch ?? DEFAULT_ROOF_PITCH);
  const direction = settings.direction ?? 0;
  const thickness = settings.thickness ?? DEFAULT_ROOF_THICKNESS;
  const angle = (pitch * Math.PI) / 180;
  const axis = rotate({ x: 1, y: 0 }, direction + (type === "gable" ? 90 : 0));
  const origin = footprint.corners[0];
  const projections = footprint.corners.map((point) =>
    dot(subtract(point, origin), axis),
  );
  const low = projections.reduce(
    (min, value) => Math.min(min, value),
    Infinity,
  );
  const high = projections.reduce(
    (max, value) => Math.max(max, value),
    -Infinity,
  );
  const span = high - low;
  const roof: BuildingRoof = {
    type,
    pitch,
    direction,
    thickness,
    verticalThickness: thickness / Math.cos(angle),
    base,
    footprint: footprint.corners,
    facets: [],
    axis,
    origin,
    low,
    span,
    slope: Math.tan(angle),
  };
  const lift = (point: Point): Point3 => ({
    ...point,
    z: roofHeightAt(roof, point),
  });
  if (type === "gable") {
    const sections = splitFootprint(
      roof.footprint,
      (p) => dot(subtract(p, origin), axis) - low - span / 2,
    );
    roof.facets = sections.facets.map((facet) => facet.map(lift));
    const alongRidge = rotate({ x: 1, y: 0 }, direction);
    sections.ridge.sort((a, b) => dot(subtract(a, b), alongRidge));
    if (sections.ridge.length >= 2)
      roof.ridge = [
        lift(sections.ridge[0]),
        lift(sections.ridge[sections.ridge.length - 1]),
      ];
  } else {
    roof.facets = [roof.footprint.map(lift)];
  }
  return roof;
}

/** Read a building from the drawing's plan geometry and vertical dimensions. */
export function buildingGeometry(plan: Plan): BuildingGeometry {
  const floorLevel = plan.building?.floorLevel ?? 0;
  const issues: BuildingIssue[] = [];
  if (!plan.calibration.calibrated)
    return {
      floorLevel,
      walls: [],
      issues: [
        {
          code: "uncalibrated",
          message:
            "Calibrate the floor plan to preview its real dimensions in 3D.",
        },
      ],
    };

  const items = plan.items.filter(
    (item): item is Wall =>
      item.type === "wall" && dist(item.a, item.b) > tolerance,
  );
  const footprint = buildingFootprint(plan, items);
  const exterior = new Set(footprint?.wallIds);
  const walls = items.map((wall): BuildingWall => {
    const height = wallHeight(plan, wall);
    return {
      wall,
      height,
      bottom: floorLevel,
      top: floorLevel + height,
      exterior: exterior.has(wall.id),
      openings: [],
    };
  });
  const byId = new Map(walls.map((wall) => [wall.wall.id, wall]));
  for (const item of plan.items) {
    if (item.type !== "door" && item.type !== "window") continue;
    const host = byId.get(item.hostId);
    if (!host) continue;
    const frame = openingFrame(item, [host.wall])!;
    const vertical = openingVertical(plan, item, host.wall);
    host.openings.push({ opening: item, center: frame.center, ...vertical });
    if (!vertical.fits)
      issues.push({
        code: "opening_above_wall",
        itemId: item.id,
        message: `${item.name || "An opening"} rises above ${host.wall.name || "its wall"}. Adjust its sill or height, or raise the wall.`,
      });
  }
  const settings = plan.building?.roof;
  if (!settings) return { floorLevel, footprint, walls, issues };
  if (!footprint) {
    issues.push({
      code: "unsupported_roof_footprint",
      message:
        "The roof needs one closed convex exterior loop with straight wall faces. Walls can still be previewed.",
    });
    return { floorLevel, walls, issues };
  }
  if (settings.type !== "flat" && settings.pitch === 0) {
    issues.push({
      code: "roof_pitch",
      message: "Give the sloped roof a positive pitch.",
    });
    return { floorLevel, footprint, walls, issues };
  }
  const base = walls.reduce(
    (highest, wall) => (wall.exterior ? Math.max(highest, wall.top) : highest),
    floorLevel,
  );
  const roof = buildRoof(settings, footprint, base);
  if (walls.some((wall) => wall.exterior && wall.top < base - tolerance))
    issues.push({
      code: "uneven_wall_heights",
      message:
        "The roof rests at the highest exterior wall. Shorter exterior walls leave a gap.",
    });
  for (const wall of walls) {
    if (
      !wall.exterior &&
      wall.top >
        Math.min(
          roofHeightAt(roof, wall.wall.a),
          roofHeightAt(roof, wall.wall.b),
        ) +
          tolerance
    )
      issues.push({
        code: "wall_above_roof",
        itemId: wall.wall.id,
        message: `${wall.wall.name || "An interior wall"} extends through the roof. Lower its height.`,
      });
  }
  return { floorLevel, footprint, walls, roof, issues };
}
