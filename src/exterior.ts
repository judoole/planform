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

type ExteriorCorners = [Point, Point, Point, Point];
export type ExteriorContour =
  | { status: "uncalibrated" | "open" | "unsupported" }
  | { status: "ready"; corners: ExteriorCorners };

function wallLoop(walls: Wall[]) {
  const [first, ...remaining] = walls;
  const loop = [first];
  let end = first.b;
  while (remaining.length) {
    const index = remaining.findIndex(
      (wall) => same(wall.a, end) || same(wall.b, end),
    );
    if (index === -1) return;
    const [wall] = remaining.splice(index, 1);
    const next = same(wall.a, end) ? wall : { ...wall, a: wall.b, b: wall.a };
    loop.push(next);
    end = next.b;
  }
  if (same(end, first.a)) return loop;
}

/** The four clockwise intersections of neighboring outside wall faces, in cm.
 * The first edge points most nearly right, then down on a tie. Openings and
 * drawn join fills do not interrupt or extend these measurement planes.
 */
export function deriveExteriorContour(plan: Plan): ExteriorContour {
  if (!plan.calibration.calibrated) return { status: "uncalibrated" };
  const walls = plan.items.filter((item): item is Wall => item.type === "wall");
  if (walls.length < 3) return { status: "open" };
  if (walls.length > 4) return { status: "unsupported" };
  let loop = wallLoop(walls);
  if (!loop) return { status: "open" };
  if (loop.length !== 4) return { status: "unsupported" };

  const [first, second] = loop;
  const cross =
    (first.b.x - first.a.x) * (second.b.y - second.a.y) -
    (first.b.y - first.a.y) * (second.b.x - second.a.x);
  if (cross < 0)
    loop = loop.reverse().map((wall) => ({ ...wall, a: wall.b, b: wall.a }));

  const directionX = (wall: Wall) =>
    (wall.b.x - wall.a.x) / dist(wall.a, wall.b);
  const topIndex = loop.indexOf(
    loop.reduce((best, wall) => {
      const difference = directionX(wall) - directionX(best);
      return difference > 0 || (difference === 0 && wall.b.y > wall.a.y)
        ? wall
        : best;
    }),
  );
  const [top, right, bottom, left] = [
    ...loop.slice(topIndex),
    ...loop.slice(0, topIndex),
  ];
  const width = dist(top.a, top.b);
  const ux = directionX(top);
  const uy = (top.b.y - top.a.y) / width;
  const height = -(left.a.x - top.a.x) * uy + (left.a.y - top.a.y) * ux;
  const point = (x: number, y: number) => ({
    x: top.a.x + x * ux - y * uy,
    y: top.a.y + x * uy + y * ux,
  });
  if (
    !(
      width > (left.thickness + right.thickness) / 2 &&
      height > (top.thickness + bottom.thickness) / 2
    ) ||
    !same(point(width, height), bottom.a) ||
    !same(point(0, height), left.a)
  )
    return { status: "unsupported" };

  const x1 = -left.thickness / 2;
  const x2 = width + right.thickness / 2;
  const y1 = -top.thickness / 2;
  const y2 = height + bottom.thickness / 2;
  return {
    status: "ready",
    corners: [point(x1, y1), point(x2, y1), point(x2, y2), point(x1, y2)],
  };
}

export const exteriorDimensionOffset = -36;
export const exteriorDimensionSegments = ([a, b, c, d]: ExteriorCorners): [
  Point,
  Point,
][] => [
  [a, b],
  [b, c],
  [c, d],
  [d, a],
];
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
