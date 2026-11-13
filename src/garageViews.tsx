import { renderToStaticMarkup } from "react-dom/server";
import { garageFootprint } from "./garage";
import { exteriorDimensionSegments } from "./exterior";
import {
  buildingGeometry,
  roofHeightAt,
  wallTopAt,
  type BuildingRoof,
  type BuildingWall,
} from "./building";
import { dist, pointsBox, rotate, type Plan, type Point } from "./model";
import type { SheetDrawing } from "./sheets";

export const garageViewNames = {
  section: "Section A-A",
  front: "Elevation A - Front",
  right: "Elevation B - Right",
  rear: "Elevation C - Rear",
  left: "Elevation D - Left",
} as const;
export type GarageView = keyof typeof garageViewNames;
export const garageViews = Object.keys(garageViewNames) as GarageView[];
export type TerrainProfile = { existing?: Point[]; proposed?: Point[] };
export type GarageStructure = {
  floor?: number;
  wallHeight?: number;
  roofPitch?: number;
  roofThickness?: number;
  ridge?: "long" | "short";
  openings?: Record<string, { sill?: number; height?: number }>;
  terrain?: Partial<Record<GarageView, TerrainProfile>>;
};

const epsilon = 1e-6;
const difference = (a: Point, b: Point): Point => ({
  x: a.x - b.x,
  y: a.y - b.y,
});
const scale = (p: Point, k: number): Point => ({ x: p.x * k, y: p.y * k });
const offset = (p: Point, v: Point): Point => ({ x: p.x + v.x, y: p.y + v.y });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;

function lineHits(origin: Point, direction: Point, edges: [Point, Point][]) {
  return edges
    .flatMap(([a, b], edge) => {
      const side = difference(b, a);
      const denominator = cross(direction, side);
      if (Math.abs(denominator) < epsilon) return [];
      const t = cross(difference(a, origin), side) / denominator;
      const u = cross(difference(a, origin), direction) / denominator;
      if (u < -epsilon || u > 1 + epsilon) return [];
      return [{ point: offset(origin, scale(direction, t)), t, edge }];
    })
    .sort((a, b) => a.t - b.t);
}

function sectionCut(
  footprint: ReturnType<typeof garageFootprint>,
  roof: BuildingRoof,
) {
  const { corners } = footprint;
  const origin = scale(offset(corners[0], corners[2]), 0.5);
  const shortSide =
    dist(corners[0], corners[1]) <= dist(corners[1], corners[2])
      ? difference(corners[1], corners[0])
      : difference(corners[2], corners[1]);
  const direction =
    roof.type === "flat"
      ? scale(shortSide, 1 / Math.hypot(shortSide.x, shortSide.y))
      : rotate(
          { x: 1, y: 0 },
          roof.direction + (roof.type === "gable" ? 90 : 0),
        );
  const outer = lineHits(origin, direction, exteriorDimensionSegments(corners));
  const inner = lineHits(
    origin,
    direction,
    exteriorDimensionSegments(footprint.insideCorners),
  );
  return {
    direction,
    from: outer[0],
    to: outer.at(-1)!,
    innerFrom: inner[0],
    innerTo: inner.at(-1)!,
  };
}

function sectionStations(plan: Plan) {
  if (!plan.garage?.structure?.terrain) return;
  try {
    const footprint = garageFootprint(plan);
    const { roof } = buildingGeometry(plan);
    if (!roof) return;
    const { from, to } = sectionCut(footprint, roof);
    return [from.point, to.point] as const;
  } catch {
    return undefined;
  }
}

export function garageSectionBounds(plan: Plan) {
  const points = sectionStations(plan);
  if (points) {
    const b = pointsBox([...points]);
    return { x: b.x - 45, y: b.y - 45, w: b.w + 90, h: b.h + 90 };
  }
}

export function GarageSectionMark({ plan }: { plan: Plan }) {
  const stations = sectionStations(plan);
  if (!stations) return null;
  const [a, b] = stations;
  const length = dist(a, b);
  const x = (b.x - a.x) / length,
    y = (b.y - a.y) / length;
  const start = { x: a.x - x * 25, y: a.y - y * 25 };
  const end = { x: b.x + x * 25, y: b.y + y * 25 };
  return (
    <g pointerEvents="none" aria-label="Section A-A" data-section-line="true">
      <line
        x1={start.x}
        y1={start.y}
        x2={end.x}
        y2={end.y}
        stroke="#195d55"
        strokeWidth={1.8}
        strokeDasharray="15 7 3 7"
      />
      {[start, end].map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r={11} fill="#195d55" />
          <text
            x={p.x}
            y={p.y + 5}
            fontSize={14}
            fontFamily="Arial"
            textAnchor="middle"
            fill="white"
          >
            A
          </text>
        </g>
      ))}
    </g>
  );
}

const elevationEdge: Record<Exclude<GarageView, "section">, number> = {
  front: 0,
  right: 1,
  rear: 2,
  left: 3,
};
const m = (cm: number) => `${(cm / 100).toFixed(2)} m`;

function svgPoints(points: Point[]) {
  return points.map(({ x, y }) => `${x},${y}`).join(" ");
}

function roofProjection(roof: BuildingRoof, origin: Point, forward: Point) {
  const station = (point: Point) => dot(difference(point, origin), forward);
  const depth = (point: Point) => cross(forward, difference(point, origin));
  // Back roof faces paint first. Each face has a constant vertical offset
  // from its underside, including the fascia at the footprint edges.
  return roof.facets
    .map((facet) => ({
      depth: facet.reduce((sum, point) => sum + depth(point), 0) / facet.length,
      surfaces: [
        facet.map((point) => ({
          x: station(point),
          y: -point.z - roof.verticalThickness,
        })),
        ...facet.map((point, index) => {
          const next = facet[(index + 1) % facet.length];
          return [
            { x: station(point), y: -point.z },
            { x: station(next), y: -next.z },
            { x: station(next), y: -next.z - roof.verticalThickness },
            { x: station(point), y: -point.z - roof.verticalThickness },
          ];
        }),
      ],
    }))
    .sort((a, b) => a.depth - b.depth)
    .flatMap(({ surfaces }) => surfaces);
}

function nearRoofEdge(a: Point, b: Point, roof: BuildingRoof) {
  const ridge = roof.ridge;
  const vector = difference(b, a);
  const across = ridge && difference(ridge[1], ridge[0]);
  const determinant = across && cross(vector, across);
  if (!ridge || !across || Math.abs(determinant ?? 0) < epsilon) return [a, b];
  const t = cross(difference(ridge[0], a), across) / determinant!;
  return t > epsilon && t < 1 - epsilon
    ? [a, offset(a, scale(vector, t)), b]
    : [a, b];
}

function nearestWallOnSide(
  id: string[],
  point: Point,
  walls: Map<string, BuildingWall>,
) {
  return id
    .map((id) => walls.get(id)!)
    .reduce((nearest, item) =>
      dist(item.wall.a, point) + dist(item.wall.b, point) <
      dist(nearest.wall.a, point) + dist(nearest.wall.b, point)
        ? item
        : nearest,
    );
}

export function garageViewSheet(plan: Plan, view: GarageView): SheetDrawing {
  const footprint = garageFootprint(plan);
  const model = buildingGeometry(plan);
  const { floorLevel: floor, roof } = model;
  if (!roof)
    throw Error(
      `Incomplete ${garageViewNames[view].toLowerCase()}. Set a roof in Building and close the exterior walls.`,
    );

  const edges = exteriorDimensionSegments(footprint.corners);
  const cut = view === "section" ? sectionCut(footprint, roof) : undefined;
  const edge = view === "section" ? cut!.from.edge : elevationEdge[view];
  const [from, to] = cut
    ? [cut.from.point, cut.to.point]
    : [...edges[edge]].reverse();
  const span = dist(from, to);
  const direction = scale(difference(to, from), 1 / span);
  const station = (p: Point) => dot(difference(p, from), direction);
  const atStation = (s: number) => offset(from, scale(direction, s));
  const path = (a: Point, b: Point, at: (p: Point) => number) =>
    nearRoofEdge(a, b, roof).map((p) => ({ x: station(p), y: -at(p) }));

  const terrain = plan.garage?.structure?.terrain?.[view];
  const missing: string[] = [];
  for (const kind of ["existing", "proposed"] as const) {
    const profile = terrain?.[kind];
    if (!profile || profile.length < 2) missing.push(`${kind} terrain profile`);
    else if (
      profile[0].x > 0 ||
      profile.at(-1)!.x < span - epsilon ||
      profile.some((p, index) => index > 0 && profile[index - 1].x >= p.x)
    ) {
      missing.push(
        `${kind} terrain spanning stations 0 to ${m(span)} in ascending order`,
      );
    }
  }

  const walls = new Map(model.walls.map((item) => [item.wall.id, item]));
  const sideWalls = cut
    ? [
        nearestWallOnSide(footprint.wallIds[cut.from.edge], from, walls),
        nearestWallOnSide(footprint.wallIds[cut.to.edge], to, walls),
      ]
    : footprint.wallIds[edge].map((id) => walls.get(id)!);
  const openings = sideWalls.flatMap((wall) =>
    wall.openings.flatMap((item) => {
      const position = cut
        ? dist(wall.wall.a, item.center)
        : station(item.center);
      const touchesCut =
        !cut ||
        Math.abs(
          position -
            dot(
              difference(wall === sideWalls[0] ? from : to, wall.wall.a),
              scale(
                difference(wall.wall.b, wall.wall.a),
                1 / dist(wall.wall.a, wall.wall.b),
              ),
            ),
        ) <=
          item.opening.width / 2;
      if (!touchesCut) return [];
      if (!item.fits)
        missing.push(
          `${item.opening.name || item.opening.type} opening within the wall height`,
        );
      return [{ ...item, wall, x: position - item.opening.width / 2 }];
    }),
  );
  if (missing.length)
    throw Error(
      `Incomplete ${garageViewNames[view].toLowerCase()}. Enter ${missing.join(", ")}.`,
    );

  const base = -floor;
  const low = roof.base + roof.verticalThickness;
  const high =
    Math.max(...roof.facets.flatMap((facet) => facet.map((p) => p.z))) +
    roof.verticalThickness;
  const roofShapes = cut
    ? [
        [
          ...path(from, to, (p) => roofHeightAt(roof, p, "top")),
          ...path(to, from, (p) => roofHeightAt(roof, p)),
        ],
      ]
    : roofProjection(roof, from, direction);
  const existing = terrain!.existing!;
  const proposed = terrain!.proposed!;
  const profileBounds = pointsBox(
    [...existing, ...proposed].map(({ x, y }) => ({ x, y: -y })),
  );
  const left = Math.min(-145, profileBounds.x - 10);
  const right = Math.max(span + 230, profileBounds.x + profileBounds.w + 10);
  const top = Math.min(-high - 45, profileBounds.y - 16);
  const bottom = Math.max(base + 95, profileBounds.y + profileBounds.h + 40);
  const clear = Math.min(...sideWalls.map((wall) => wall.height));
  const wallPanels = cut
    ? sideWalls.flatMap((wall, index) => {
        const range =
          index === 0
            ? [0, station(cut.innerFrom.point)]
            : [station(cut.innerTo.point), span];
        const opening = openings.find((item) => item.wall === wall);
        const [a, b] = range;
        const upper = path(atStation(a), atStation(b), (p) =>
          wallTopAt(wall, p, roof),
        );
        return [
          [
            ...upper,
            { x: b, y: opening ? -opening.top : base },
            { x: a, y: opening ? -opening.top : base },
          ],
          ...(opening && opening.bottom > floor
            ? [
                [
                  { x: a, y: base },
                  { x: b, y: base },
                  { x: b, y: -opening.bottom },
                  { x: a, y: -opening.bottom },
                ],
              ]
            : []),
        ];
      })
    : sideWalls.map((wall) => {
        const ends = [station(wall.wall.a), station(wall.wall.b)].sort(
          (a, b) => a - b,
        );
        const leftmost = Math.min(
          ...sideWalls.map(({ wall }) =>
            Math.min(station(wall.a), station(wall.b)),
          ),
        );
        const rightmost = Math.max(
          ...sideWalls.map(({ wall }) =>
            Math.max(station(wall.a), station(wall.b)),
          ),
        );
        const a = ends[0] === leftmost ? 0 : ends[0];
        const b = ends[1] === rightmost ? span : ends[1];
        return [
          ...path(atStation(a), atStation(b), (p) => wallTopAt(wall, p, roof)),
          { x: b, y: base },
          { x: a, y: base },
        ];
      });

  return {
    title: garageViewNames[view],
    bounds: { x: left, y: top, w: right - left, h: bottom - top },
    legend: [
      "Existing terrain (dashed brown)",
      "Proposed terrain (solid green)",
    ],
    markup: renderToStaticMarkup(
      <g
        fontFamily="Arial"
        fontSize={16}
        fill="#234039"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        {roofShapes.map((points, index) => (
          <polygon
            key={index}
            points={svgPoints(points)}
            fill="#d2e3d9"
            stroke="#263e37"
            strokeWidth={2}
          />
        ))}
        {wallPanels.map((points, index) => (
          <polygon
            key={index}
            points={svgPoints(points)}
            fill={cut ? "#d2e3d9" : "#f0f4ef"}
            stroke="#263e37"
            strokeWidth={2}
          />
        ))}
        {cut && (
          <>
            <line
              x1={0}
              x2={span}
              y1={base}
              y2={base}
              stroke="#263e37"
              strokeWidth={4}
            />
            <text x={span / 2} y={base - 38} textAnchor="middle">
              Garage
            </text>
            <text
              x={span / 2}
              y={-high + roof.verticalThickness + 35}
              textAnchor="middle"
            >
              Roof pitch {roof.pitch}° · Roof thickness {roof.thickness} cm
            </text>
            <text x={span / 2} y={base - 16} textAnchor="middle">
              Wall thickness {sideWalls[0].wall.thickness} /{" "}
              {sideWalls[1].wall.thickness} cm
            </text>
            <Measure
              x1={station(cut.innerFrom.point) + 32}
              x2={station(cut.innerFrom.point) + 32}
              y1={base - clear}
              y2={base}
              label={`Clear height ${m(clear)}`}
              vertical
            />
          </>
        )}
        {!cut &&
          openings.map(({ opening, x, top, bottom }) => (
            <g key={opening.id} stroke="#263e37" strokeWidth={2}>
              <rect
                x={x}
                y={-top}
                width={opening.width}
                height={top - bottom}
                fill={opening.type === "window" ? "#d8ebed" : "#e2e9df"}
              />
              {opening.type === "window" && (
                <line
                  x1={x + opening.width / 2}
                  x2={x + opening.width / 2}
                  y1={-top}
                  y2={-bottom}
                />
              )}
              {opening.type === "door" &&
                [1, 2, 3].map((n) => (
                  <line
                    key={n}
                    x1={x}
                    x2={x + opening.width}
                    y1={-bottom - ((top - bottom) * n) / 4}
                    y2={-bottom - ((top - bottom) * n) / 4}
                  />
                ))}
            </g>
          ))}
        <polyline
          points={existing.map(({ x, y }) => `${x},${-y}`).join(" ")}
          fill="none"
          stroke="#816141"
          strokeWidth={2.5}
          strokeDasharray="9 7"
        />
        <polyline
          points={proposed.map(({ x, y }) => `${x},${-y}`).join(" ")}
          fill="none"
          stroke="#23684e"
          strokeWidth={2.5}
        />
        <Measure
          x1={0}
          x2={span}
          y1={bottom - 28}
          y2={bottom - 28}
          label={m(span)}
        />
        <Measure
          x1={span + 32}
          x2={span + 32}
          y1={-low}
          y2={base}
          label={`${roof.type === "flat" ? "Roof top" : "Eaves"} ${m(low - floor)} above floor`}
          vertical
        />
        {roof.type !== "flat" && (
          <Measure
            x1={span + 75}
            x2={span + 75}
            y1={-high}
            y2={base}
            label={`${roof.type === "gable" ? "Ridge" : "High edge"} ${m(high - floor)} above floor`}
            vertical
          />
        )}
        <text x={-10} y={base - 5} textAnchor="end">
          Floor {m(floor)}
        </text>
      </g>,
    ),
  };
}

function Measure({
  x1,
  y1,
  x2,
  y2,
  label,
  vertical,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  vertical?: boolean;
}) {
  const x = (x1 + x2) / 2,
    y = (y1 + y2) / 2;
  return (
    <g stroke="#627b6e" strokeWidth={1.2}>
      <path
        fill="none"
        d={`M ${x1} ${y1} L ${x2} ${y2} M ${x1 - 4} ${y1 + 4} l 8 -8 M ${x2 - 4} ${y2 + 4} l 8 -8`}
      />
      <text
        x={x}
        y={y - 6}
        textAnchor="middle"
        stroke="none"
        transform={vertical ? `rotate(-90 ${x} ${y})` : undefined}
      >
        {label}
      </text>
    </g>
  );
}
