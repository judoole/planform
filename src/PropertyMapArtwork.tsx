import { renderToStaticMarkup } from "react-dom/server";
import {
  boundaryMeasurement,
  groundScale,
  mapFootprint,
  placedFootprint,
  projectLocation,
  type Parcel,
  type ParcelMap,
  type PropertyMap,
} from "./propertyMap";
import { pointsBox, type Plan, type Point } from "./model";
import type { SheetDrawing } from "./sheets";
import { mapAttributionUrl, printBackground } from "./mapProvider";

const footprintColor = "#18583f";
const measurementColor = "#203d72";

export const mapPoints = (points: Point[], toView: (point: Point) => Point) =>
  points
    .map((point) => toView(point))
    .map(({ x, y }) => `${x},${y}`)
    .join(" ");

export function ParcelArtwork({
  parcels,
  toView,
  unit = 1,
  plain = false,
}: {
  parcels: ParcelMap;
  toView: (point: Point) => Point;
  unit?: number;
  plain?: boolean;
}) {
  function paths(entries: Parcel[], selected: boolean) {
    return entries.map(({ rings }, index) => (
      <path
        key={index}
        d={rings.map((ring) => `M${mapPoints(ring, toView)}Z`).join(" ")}
        fill={selected ? "#d6eade" : plain ? "#eef0ea" : "none"}
        fillOpacity={plain ? 1 : 0.45}
        fillRule="evenodd"
        stroke={selected ? "#835135" : plain ? "#83908a" : "#685c50"}
        strokeWidth={(selected ? 1.7 : 0.9) * unit}
      />
    ));
  }
  return (
    <g pointerEvents="none">
      {paths(parcels.nearby, false)}
      {paths(parcels.selected, true)}
    </g>
  );
}

export function NorthArrow({ x, y, unit = 1 }: Point & { unit?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${unit})`} pointerEvents="none">
      <circle r="20" fill="white" stroke="#4b6559" />
      <path d="M0 -13 L-6 4 L0 1 L6 4Z" fill="#183b2c" />
      <text
        y="14"
        textAnchor="middle"
        fontFamily="Arial"
        fontSize="11"
        fill="#183b2c"
      >
        N
      </text>
    </g>
  );
}

export function MapMeasurement({
  measurement,
  toView,
  unit = 1,
}: {
  measurement?: ReturnType<typeof boundaryMeasurement>;
  toView: (point: Point) => Point;
  unit?: number;
}) {
  if (!measurement) return null;
  const a = toView(measurement.a);
  const b = toView(measurement.b);
  return (
    <g stroke={measurementColor} strokeWidth={2 * unit} pointerEvents="none">
      <line
        x1={a.x}
        y1={a.y}
        x2={b.x}
        y2={b.y}
        strokeDasharray={`${4 * unit} ${3 * unit}`}
      />
      <circle cx={b.x} cy={b.y} r={2 * unit} fill={measurementColor} />
    </g>
  );
}

export function propertyMapSheet(
  plan: Plan,
  map: PropertyMap,
  parcels: ParcelMap,
): SheetDrawing | undefined {
  const footprint = mapFootprint(plan);
  const placement = map.placement;
  if (!footprint || !placement) return;
  const corners = placedFootprint(footprint, placement);
  const measurement = boundaryMeasurement(
    corners,
    parcels.selected,
    placement.center,
  );
  const origin = projectLocation(placement.center);
  const scale = groundScale(placement.center);
  const toView = ({ x, y }: Point) => ({
    x: (x - origin.x) * scale.x * 100,
    y: (origin.y - y) * scale.y * 100,
  });
  const footprintBounds = pointsBox(corners.map((point) => toView(point)));
  const w = Math.max(9000, footprintBounds.w + 1000);
  const h = Math.max(6000, footprintBounds.h + 1000);
  const bounds = { x: -w / 2, y: -h / 2, w, h };
  return {
    title: "Property map",
    bounds,
    markup: renderToStaticMarkup(
      <g>
        <defs>
          <clipPath id="property-map-frame">
            <rect x={bounds.x} y={bounds.y} width={w} height={h} />
          </clipPath>
        </defs>
        <rect
          x={bounds.x}
          y={bounds.y}
          width={w}
          height={h}
          fill="#fafbf7"
          stroke="#aebbb0"
          strokeWidth={10}
        />
        <g clipPath="url(#property-map-frame)">
          <ParcelArtwork parcels={parcels} toView={toView} unit={18} plain />
          <polygon
            points={mapPoints(corners, toView)}
            fill="#b9e2cb"
            stroke={footprintColor}
            strokeWidth={22}
          />
          <MapMeasurement measurement={measurement} toView={toView} unit={18} />
        </g>
        <NorthArrow x={w / 2 - 600} y={-h / 2 + 600} unit={22} />
      </g>,
    ),
    legendLinks: { 1: mapAttributionUrl },
    legend: [
      map.property.number,
      `${printBackground.attribution} · Matrikkelen - Eiendomskart Teig · CC BY 4.0`,
      measurement ? measurement.label : "Selected parcel boundary unavailable.",
      "Mapped boundaries and horizontal distances are approximate.",
    ],
  };
}
