import { fixed, translate, type Language } from "./messages";
import { legendLayout } from "./layers";
import {
  add,
  angle,
  dist,
  planBounds,
  pointsBox,
  rotate,
  same,
  unionBoxes,
  type Plan,
  type Point,
  type Wall,
} from "./model";

const tolerance = 1e-6;
const subtract = (a: Point, b: Point): Point => ({
  x: a.x - b.x,
  y: a.y - b.y,
});
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;

export type ExteriorContour =
  | { status: "uncalibrated" | "open" | "unsupported" }
  | {
      status: "ready";
      corners: Point[];
      insideCorners: Point[];
      wallIds: string[][];
    };

function wallLoop(walls: Wall[]) {
  const key = ({ x, y }: Point) => `${x},${y}`;
  const byEndpoint = new Map<string, Wall[]>();
  for (const wall of walls) {
    for (const point of [wall.a, wall.b]) {
      const id = key(point);
      const adjacent = byEndpoint.get(id) ?? [];
      adjacent.push(wall);
      byEndpoint.set(id, adjacent);
    }
  }

  const [first, ...rest] = walls;
  const remaining = new Set(rest);
  const loop = [first];
  let end = first.b;
  while (remaining.size) {
    if (same(end, first.a)) return { status: "unsupported" } as const;
    const exact = byEndpoint
      .get(key(end))
      ?.filter((wall) => remaining.has(wall));
    // Match the editor's tolerance for imported endpoints that nearly coincide.
    const matches = exact?.length
      ? exact
      : [...remaining].filter((wall) => same(wall.a, end) || same(wall.b, end));
    if (matches.length > 1) return { status: "unsupported" } as const;
    const [wall] = matches;
    if (!wall) return { status: "open" } as const;
    const next = same(wall.a, end) ? wall : reverseWall(wall);
    remaining.delete(wall);
    loop.push(next);
    end = next.b;
  }
  return same(end, first.a)
    ? ({ status: "closed", loop } as const)
    : ({ status: "open" } as const);
}

const reverseWall = (wall: Wall): Wall => ({
  ...wall,
  a: wall.b,
  b: wall.a,
  ...(wall.junctions
    ? { junctions: { a: wall.junctions.b, b: wall.junctions.a } }
    : {}),
});

function wallFace(wall: Wall) {
  const delta = subtract(wall.b, wall.a);
  const length = dist(wall.a, wall.b);
  const direction = { x: delta.x / length, y: delta.y / length };
  return {
    ...wall,
    wallIds: [wall.id],
    direction,
    // Clockwise in the drawing's Y-down coordinates.
    outward: {
      x: (direction.y * wall.thickness) / 2,
      y: (-direction.x * wall.thickness) / 2,
    },
  };
}

function mergeStraightFaces(walls: Wall[]) {
  const faces = walls.map(wallFace);
  const adjacent = (a: (typeof faces)[number], b: (typeof faces)[number]) =>
    a.junctions?.b &&
    a.junctions.b === b.junctions?.a &&
    a.thickness === b.thickness &&
    Math.abs(cross(a.direction, b.direction)) <= tolerance &&
    dot(a.direction, b.direction) > 0;
  const start = faces.findIndex(
    (face, index) =>
      !adjacent(faces[(index + faces.length - 1) % faces.length], face),
  );
  if (start === -1) return faces;
  const reordered = [...faces.slice(start), ...faces.slice(0, start)];
  const result: typeof faces = [];
  for (const face of reordered) {
    const previous = result.at(-1);
    if (previous && adjacent(previous, face)) {
      previous.b = face.b;
      previous.junctions = { ...previous.junctions, b: face.junctions?.b };
      previous.wallIds.push(...face.wallIds);
    } else {
      result.push(face);
    }
  }
  return result;
}

function offsetCorners(faces: ReturnType<typeof wallFace>[], side: 1 | -1) {
  return faces.map((face, i) => {
    const previous = faces[(i + faces.length - 1) % faces.length];
    const start = add(face.a, {
      x: side * face.outward.x,
      y: side * face.outward.y,
    });
    const end = add(previous.b, {
      x: side * previous.outward.x,
      y: side * previous.outward.y,
    });
    // Intersect the two supporting lines at the shared corner.
    const t =
      cross(subtract(end, start), previous.direction) /
      cross(face.direction, previous.direction);
    return add(start, { x: t * face.direction.x, y: t * face.direction.y });
  });
}

const interpolate = (a: Point, b: Point, t: number): Point => ({
  x: a.x + t * (b.x - a.x),
  y: a.y + t * (b.y - a.y),
});

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
function convexWallShell(walls: Wall[]) {
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

  const contour = deriveSingleWallContour(
    edges.map((edge, index): Wall => ({
      id: String(index),
      name: "",
      type: "wall",
      a: edge.a,
      b: edge.b,
      thickness: edge.segments[0].wall.thickness,
    })),
  );
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
  return { ...contour, wallIds: edgeWallIds };
}

/** Intersections of neighboring outside wall faces, in clockwise order in cm.
 * The first edge points most nearly right, then down on a tie. Each edge
 * corresponds to a straight face, which can include explicitly split walls.
 */
export function deriveExteriorContour(plan: Plan): ExteriorContour {
  if (!plan.calibration.calibrated) return { status: "uncalibrated" };
  return outerWallContour(plan.items.filter((item) => item.type === "wall"));
}

/** Single wall loop required by tools that model an unenclosed interior for now. */
export function deriveSingleLoopContour(plan: Plan): ExteriorContour {
  if (!plan.calibration.calibrated) return { status: "uncalibrated" };
  return deriveSingleWallContour(
    plan.items.filter((item) => item.type === "wall"),
  );
}

function outerWallContour(walls: Wall[]): ExteriorContour {
  const single = deriveSingleWallContour(walls);
  return single.status === "ready"
    ? single
    : (convexWallShell(walls) ?? single);
}

function deriveSingleWallContour(walls: Wall[]): ExteriorContour {
  if (walls.length < 3) return { status: "open" };
  if (walls.some((wall) => same(wall.a, wall.b)))
    return { status: "unsupported" };
  const path = wallLoop(walls);
  if (path.status !== "closed") return { status: path.status };

  let faces = mergeStraightFaces(path.loop);
  const turns = faces.map(({ direction }, i) => {
    const next = faces[(i + 1) % faces.length].direction;
    return Math.atan2(cross(direction, next), dot(direction, next));
  });
  const winding = Math.sign(turns[0]);
  const totalTurn = turns.reduce((sum, turn) => sum + turn, 0);
  // A convex loop turns in one direction and winds exactly once.
  if (
    turns.some(
      (turn) =>
        turn * winding <= tolerance || Math.abs(turn) >= Math.PI - tolerance,
    ) ||
    Math.abs(Math.abs(totalTurn) - 2 * Math.PI) > tolerance
  )
    return { status: "unsupported" };
  if (winding < 0)
    faces = mergeStraightFaces(path.loop.reverse().map(reverseWall));

  const maxRight = faces.reduce(
    (right, face) => Math.max(right, face.direction.x),
    -1,
  );
  const first = faces.indexOf(
    faces
      .filter((face) => maxRight - face.direction.x <= tolerance)
      .reduce((best, face) =>
        face.direction.y > best.direction.y ? face : best,
      ),
  );
  faces = [...faces.slice(first), ...faces.slice(0, first)];

  const corners = offsetCorners(faces, 1);
  const insideCorners = offsetCorners(faces, -1);
  const forwardEdges = (points: Point[]) =>
    exteriorDimensionSegments(points).every(
      ([a, b], i) => dot(subtract(b, a), faces[i].direction) > tolerance,
    );
  // Extreme thickness differences can make an offset edge disappear, and
  // excessive thickness can fill the enclosure entirely.
  if (!forwardEdges(corners) || !forwardEdges(insideCorners))
    return { status: "unsupported" };
  return {
    status: "ready",
    corners,
    insideCorners,
    wallIds: faces.map((wall) => wall.wallIds),
  };
}

export function createExteriorContourReader() {
  const cache = new WeakMap<
    Plan["items"],
    { walls: Wall[]; contour: ExteriorContour }
  >();
  // Editor updates replace changed walls and reuse unchanged objects.
  const uncalibrated: ExteriorContour = { status: "uncalibrated" };
  let last: { walls: Wall[]; contour: ExteriorContour } | undefined;
  return (plan: Plan) => {
    if (!plan.calibration.calibrated) return uncalibrated;
    const cached = cache.get(plan.items);
    if (cached) {
      last = cached;
      return cached.contour;
    }
    const walls = plan.items.filter((item) => item.type === "wall");
    if (
      !last ||
      last.walls.length !== walls.length ||
      !walls.every((wall, index) => wall === last?.walls[index])
    )
      last = { walls, contour: outerWallContour(walls) };
    cache.set(plan.items, last);
    return last.contour;
  };
}

export const exteriorDimensionOffset = -36;
export const dimensionFontSize = 15;
export const dimensionLabelStroke = 5;
export const exteriorDimensionSegments = (corners: Point[]): [Point, Point][] =>
  corners.map((point, i) => [point, corners[(i + 1) % corners.length]]);
export const exteriorDimensionLabel = (
  a: Point,
  b: Point,
  language: Language = "en",
) => `${fixed(dist(a, b) / 100, 2, language)} m`;

export function visibleExteriorContour(
  plan: Plan,
  read = deriveExteriorContour,
) {
  if (plan.showExteriorDimensions !== false) return read(plan);
}

/** Share the label's explicit SVG advance and rotated bounds across renderers.
 * The bounds include the white stroke and vertical font extents.
 */
export function exteriorLabelLayout(
  length: number,
  rotation: number,
  label: string,
) {
  const center = length / 2;
  const textLength = label.length * dimensionFontSize * 0.56;
  const baseline = exteriorDimensionOffset - 6;
  const pivot = exteriorDimensionOffset - 11;
  const flipped = rotation >= 90 || rotation < -90;
  const padding = dimensionLabelStroke / 2;
  const x1 = center - textLength / 2 - padding;
  const x2 = center + textLength / 2 + padding;
  const top = baseline - dimensionFontSize - padding;
  const bottom = baseline + dimensionFontSize / 4 + padding;
  return {
    textLength,
    baseline,
    transform: flipped ? `rotate(180 ${center} ${pivot})` : undefined,
    bounds: {
      x1,
      x2,
      y1: flipped ? 2 * pivot - bottom : top,
      y2: flipped ? 2 * pivot - top : bottom,
    },
  };
}

/** Include the dimension marks and their text when fitting or exporting. */
export function annotatedPlanBounds(
  plan: Plan,
  exterior: ExteriorContour | undefined,
) {
  const geometry = geometryAnnotationBounds(plan, exterior);
  const legend = legendLayout(plan, geometry);
  return legend ? unionBoxes([geometry, legend.bounds]) : geometry;
}

export function geometryAnnotationBounds(
  plan: Plan,
  exterior: ExteriorContour | undefined,
) {
  const drawing = planBounds(plan);
  if (exterior?.status !== "ready") return drawing;
  const marks = exteriorDimensionSegments(exterior.corners).map(([a, b]) => {
    const length = dist(a, b);
    const rotation = angle(a, b);
    const { bounds } = exteriorLabelLayout(
      length,
      rotation,
      exteriorDimensionLabel(a, b),
    );
    const x1 = Math.min(-5, bounds.x1);
    const x2 = Math.max(length + 5, bounds.x2);
    const y1 = Math.min(exteriorDimensionOffset - 9, bounds.y1);
    const y2 = Math.max(1, bounds.y2);
    return pointsBox(
      [
        { x: x1, y: y1 },
        { x: x2, y: y1 },
        { x: x2, y: y2 },
        { x: x1, y: y2 },
      ].map((p) => add(a, rotate(p, rotation))),
    );
  });
  return unionBoxes([drawing, ...marks]);
}

export function exteriorWallLengthSummary(
  plan: Plan,
  language: Language = "en",
) {
  const contour = visibleExteriorContour(plan);
  if (contour?.status !== "ready") return;
  const labels = exteriorDimensionSegments(contour.corners).map(([a, b]) =>
    exteriorDimensionLabel(a, b, language),
  );
  const lengths = [...new Set(labels)].join(language === "nb" ? " · " : ", ");
  return translate(language)("Exterior wall lengths: {lengths}", { lengths });
}
