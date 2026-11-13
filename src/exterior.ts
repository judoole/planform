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
  | { status: "ready"; corners: Point[] };

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

const reverseWall = (wall: Wall): Wall => ({ ...wall, a: wall.b, b: wall.a });

function wallFace(wall: Wall) {
  const delta = subtract(wall.b, wall.a);
  const length = dist(wall.a, wall.b);
  const direction = { x: delta.x / length, y: delta.y / length };
  return {
    ...wall,
    direction,
    // Clockwise in the drawing's Y-down coordinates.
    outward: {
      x: (direction.y * wall.thickness) / 2,
      y: (-direction.x * wall.thickness) / 2,
    },
  };
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

/** Intersections of neighboring outside wall faces, in clockwise order in cm.
 * The first edge points most nearly right, then down on a tie. Each edge
 * corresponds to one wall in a single convex loop of straight walls.
 */
export function deriveExteriorContour(plan: Plan): ExteriorContour {
  if (!plan.calibration.calibrated) return { status: "uncalibrated" };
  const walls = plan.items.filter((item): item is Wall => item.type === "wall");
  if (walls.length < 3) return { status: "open" };
  if (walls.some((wall) => same(wall.a, wall.b)))
    return { status: "unsupported" };
  const path = wallLoop(walls);
  if (path.status !== "closed") return { status: path.status };

  let faces = path.loop.map(wallFace);
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
    faces = path.loop.reverse().map((wall) => wallFace(reverseWall(wall)));

  const first = faces.indexOf(
    faces.reduce((best, face) => {
      const difference = face.direction.x - best.direction.x;
      return difference > 0 ||
        (difference === 0 && face.direction.y > best.direction.y)
        ? face
        : best;
    }),
  );
  faces = [...faces.slice(first), ...faces.slice(0, first)];

  const corners = offsetCorners(faces, 1);
  const forwardEdges = (points: Point[]) =>
    exteriorDimensionSegments(points).every(
      ([a, b], i) => dot(subtract(b, a), faces[i].direction) > tolerance,
    );
  // Extreme thickness differences can make an offset edge disappear, and
  // excessive thickness can fill the enclosure entirely.
  if (!forwardEdges(corners) || !forwardEdges(offsetCorners(faces, -1)))
    return { status: "unsupported" };
  return { status: "ready", corners };
}

export const exteriorDimensionOffset = -36;
export const exteriorDimensionSegments = (corners: Point[]): [Point, Point][] =>
  corners.map((point, i) => [point, corners[(i + 1) % corners.length]]);
export const exteriorDimensionLabel = (a: Point, b: Point) =>
  `${(dist(a, b) / 100).toFixed(2)} m`;

export function visibleExteriorContour(plan: Plan) {
  if (plan.showExteriorDimensions) return deriveExteriorContour(plan);
}

/** Include the dimension marks and their text when fitting or exporting. */
export function annotatedPlanBounds(
  plan: Plan,
  exterior = visibleExteriorContour(plan),
) {
  const drawing = planBounds(plan);
  if (exterior?.status !== "ready") return drawing;
  const marks = exteriorDimensionSegments(exterior.corners).map(([a, b]) => {
    const length = dist(a, b);
    // Allow for the text halo and the rotated tick marks at either end.
    const textHalfWidth = exteriorDimensionLabel(a, b).length * 7.5;
    const x1 = Math.min(-5, length / 2 - textHalfWidth);
    const x2 = Math.max(length + 5, length / 2 + textHalfWidth);
    const y = exteriorDimensionOffset - 25;
    return pointsBox(
      [
        { x: x1, y },
        { x: x2, y },
        { x: x2, y: 1 },
        { x: x1, y: 1 },
      ].map((p) => add(a, rotate(p, angle(a, b)))),
    );
  });
  return unionBoxes([drawing, ...marks]);
}
