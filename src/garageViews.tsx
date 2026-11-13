import { renderToStaticMarkup } from "react-dom/server";
import { garageFootprint } from "./garage";
import { exteriorDimensionSegments } from "./exterior";
import {
  dist,
  openingFrame,
  pointsBox,
  type Plan,
  type Point,
  type Wall,
} from "./model";
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

const midpoint = (a: Point, b: Point) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

function garageGeometry(plan: Plan) {
  const footprint = garageFootprint(plan);
  const edges = exteriorDimensionSegments(footprint.corners);
  const ridge = plan.garage?.structure?.ridge ?? "long";
  const firstIsLongest = dist(...edges[0]) >= dist(...edges[1]);
  const ridgeEdge = firstIsLongest === (ridge === "long") ? 0 : 1;
  return { footprint, edges, ridgeEdge };
}

export function garageRidgeAngle(plan: Plan) {
  const { edges, ridgeEdge } = garageGeometry(plan);
  const [a, b] = edges[ridgeEdge];
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}

function sectionStations(plan: Plan) {
  if (!plan.garage?.structure) return;
  try {
    const { edges, ridgeEdge } = garageGeometry(plan);
    return [
      midpoint(...edges[ridgeEdge]),
      midpoint(...edges[ridgeEdge + 2]),
    ] as const;
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

export function garageViewSheet(plan: Plan, view: GarageView): SheetDrawing {
  const { footprint, edges, ridgeEdge } = garageGeometry(plan);
  const input = plan.garage?.structure;
  const isSection = view === "section";
  const edge = view === "section" ? (ridgeEdge + 1) % 4 : elevationEdge[view];
  const span = dist(...edges[edge]);
  const gable = (edge - ridgeEdge) % 2 !== 0;
  const [edgeA, edgeB] = edges[edge];
  const widthAcrossRoof = dist(...edges[(ridgeEdge + 1) % 4]);
  const missing: string[] = [];
  if (input?.floor === undefined) missing.push("finished floor level");
  if (input?.wallHeight === undefined)
    missing.push("clear wall height to the roof underside");
  if (input?.roofPitch === undefined) missing.push("roof pitch");
  if (input?.roofThickness === undefined) missing.push("roof thickness");
  const terrain = input?.terrain?.[view];
  for (const kind of ["existing", "proposed"] as const) {
    const profile = terrain?.[kind];
    if (!profile || profile.length < 2) missing.push(`${kind} terrain profile`);
    else if (
      profile[0].x > 0 ||
      profile.at(-1)!.x < span - 1e-6 ||
      profile.some((p, index) => index > 0 && profile[index - 1].x >= p.x)
    )
      missing.push(
        `${kind} terrain spanning stations 0 to ${m(span)} in ascending order`,
      );
  }

  const openings = isSection
    ? []
    : plan.items.flatMap((item) => {
        if (
          (item.type !== "door" && item.type !== "window") ||
          !footprint.wallIds[edge].includes(item.hostId)
        )
          return [];
        const frame = openingFrame(item, plan.items);
        if (!frame) return [];
        const entry = Object.hasOwn(input?.openings ?? {}, item.id)
          ? input?.openings?.[item.id]
          : undefined;
        const sill = entry?.sill ?? (item.type === "door" ? 0 : undefined);
        if (sill === undefined || entry?.height === undefined) {
          missing.push(`${item.name || item.type} sill or opening height`);
          return [];
        }
        if (sill + entry.height > (input?.wallHeight ?? Infinity))
          missing.push(
            `${item.name || item.type} opening within the wall height`,
          );
        const center =
          ((frame.center.x - edgeA.x) * (edgeB.x - edgeA.x) +
            (frame.center.y - edgeA.y) * (edgeB.y - edgeA.y)) /
          span;
        return [
          {
            x: span - center - item.width / 2,
            width: item.width,
            sill,
            height: entry.height,
            id: item.id,
            type: item.type,
          },
        ];
      });
  if (missing.length)
    throw Error(
      `Incomplete ${garageViewNames[view].toLowerCase()}. Enter ${missing.join(", ")}.`,
    );

  const floor = input!.floor!,
    wall = input!.wallHeight!,
    pitch = input!.roofPitch!,
    thickness = input!.roofThickness!;
  const angle = (pitch * Math.PI) / 180;
  const verticalThickness = thickness / Math.cos(angle);
  const rise = (widthAcrossRoof / 2) * Math.tan(angle);
  const eavesY = -floor - wall;
  const ridgeY = eavesY - rise - verticalThickness;
  const floorY = -floor;
  const eaveTop = eavesY - verticalThickness;
  const existing = terrain!.existing!,
    proposed = terrain!.proposed!;
  const profileBounds = pointsBox(
    [...existing, ...proposed].map(({ x, y }) => ({ x, y: -y })),
  );
  const roofTop = gable
    ? `0,${eaveTop} ${span / 2},${ridgeY} ${span},${eaveTop}`
    : `0,${ridgeY} ${span},${ridgeY}`;
  const roofBottom =
    isSection && gable
      ? `${span},${eavesY} ${span / 2},${ridgeY + verticalThickness} 0,${eavesY}`
      : `${span},${eavesY} 0,${eavesY}`;
  const walls = footprint.wallIds.map(
    (id) => plan.items.find((item) => item.id === id[0]) as Wall,
  );
  const firstThickness = walls[ridgeEdge].thickness;
  const lastThickness = walls[(ridgeEdge + 2) % 4].thickness;
  const left = Math.min(-145, profileBounds.x - 10);
  const right = Math.max(span + 200, profileBounds.x + profileBounds.w + 10);
  const top = Math.min(ridgeY - 40, profileBounds.y - 16);
  const bottom = Math.max(floorY + 95, profileBounds.y + profileBounds.h + 40);

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
        <rect
          x={0}
          y={eavesY}
          width={span}
          height={wall}
          fill={isSection ? "white" : "#f0f4ef"}
          stroke="#263e37"
          strokeWidth={2}
        />
        <polygon
          points={`${roofTop} ${roofBottom}`}
          fill="#d2e3d9"
          stroke="#263e37"
          strokeWidth={2}
        />
        {!gable && (
          <line
            x1={0}
            x2={span}
            y1={eaveTop}
            y2={eaveTop}
            stroke="#263e37"
            strokeWidth={2}
          />
        )}
        {isSection && (
          <>
            <rect
              x={0}
              y={eavesY}
              width={firstThickness}
              height={wall}
              fill="#d2e3d9"
              stroke="#263e37"
              strokeWidth={2}
            />
            <rect
              x={span - lastThickness}
              y={eavesY}
              width={lastThickness}
              height={wall}
              fill="#d2e3d9"
              stroke="#263e37"
              strokeWidth={2}
            />
            <line
              x1={0}
              y1={floorY}
              x2={span}
              y2={floorY}
              stroke="#263e37"
              strokeWidth={4}
            />
            <text x={span / 2} y={floorY - 38} textAnchor="middle">
              Garage
            </text>
            <text
              x={span / 2}
              y={ridgeY + verticalThickness + 35}
              textAnchor="middle"
            >
              Roof pitch {pitch}° · Roof thickness {thickness} cm
            </text>
            <text x={span / 2} y={floorY - 16} textAnchor="middle">
              Wall thickness {firstThickness} / {lastThickness} cm
            </text>
            <Measure
              x1={firstThickness + 32}
              y1={eavesY}
              x2={firstThickness + 32}
              y2={floorY}
              label={`Clear height ${m(wall)}`}
              vertical
            />
          </>
        )}
        {openings.map((opening) => (
          <g key={opening.id} stroke="#263e37" strokeWidth={2}>
            <rect
              x={opening.x}
              y={floorY - opening.sill - opening.height}
              width={opening.width}
              height={opening.height}
              fill={opening.type === "window" ? "#d8ebed" : "#e2e9df"}
            />
            {opening.type === "window" && (
              <line
                x1={opening.x + opening.width / 2}
                x2={opening.x + opening.width / 2}
                y1={floorY - opening.sill - opening.height}
                y2={floorY - opening.sill}
              />
            )}
            {opening.type === "door" &&
              [1, 2, 3].map((n) => (
                <line
                  key={n}
                  x1={opening.x}
                  x2={opening.x + opening.width}
                  y1={floorY - opening.sill - (opening.height * n) / 4}
                  y2={floorY - opening.sill - (opening.height * n) / 4}
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
          y1={eaveTop}
          y2={floorY}
          label={`Eaves ${m(floorY - eaveTop)} above floor`}
          vertical
        />
        <Measure
          x1={span + 75}
          x2={span + 75}
          y1={ridgeY}
          y2={floorY}
          label={`Ridge ${m(floorY - ridgeY)} above floor`}
          vertical
        />
        <text x={-10} y={floorY - 5} textAnchor="end">
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
