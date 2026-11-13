import { translate, type Language } from "./messages";
import { renderToStaticMarkup } from "react-dom/server";
import {
  boundaryDistanceLabel,
  boundaryMeasurements,
  type BoundaryDistance,
  groundScale,
  mapFootprint,
  placedFootprint,
  projectLocation,
  type Parcel,
  type ParcelMap,
  type PropertyMap,
} from "./propertyMap";
import { pointsBox, type Box, type Plan, type Point } from "./model";
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

export function MapMeasurements({
  distances = [],
  toView,
  bounds,
  unit = 1,
  language = "en",
}: {
  language?: Language;
  distances?: BoundaryDistance[];
  toView: (point: Point) => Point;
  bounds: Box;
  unit?: number;
}) {
  const inside = (point: Point, marginX = 0, marginY = marginX) =>
    point.x >= bounds.x + marginX &&
    point.x <= bounds.x + bounds.w - marginX &&
    point.y >= bounds.y + marginY &&
    point.y <= bounds.y + bounds.h - marginY;
  const labels: Box[] = [];
  const lines = distances.flatMap<{
    a: Point;
    b: Point;
    text: string;
    contact: boolean;
    label?: Box;
  }>((distance) => {
    const a = toView(distance.a);
    const b = toView(distance.b);
    if (!inside(b)) return [];
    const text = boundaryDistanceLabel(distance.meters, language);
    if (distance.meters === 0) return [{ a, b, text, contact: true }];
    const w = (text.length * 6.8 + 11) * unit;
    const h = 17 * unit;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = (b.y - a.y) / length;
    const ny = (a.x - b.x) / length;
    const position = [0.5, 0.72, 0.28]
      .flatMap((t) =>
        [1, -1].map((side) => ({
          x: a.x + (b.x - a.x) * t + nx * side * 13 * unit,
          y: a.y + (b.y - a.y) * t + ny * side * 13 * unit,
        })),
      )
      .find(
        (p) =>
          inside(p, w / 2 + unit, h / 2 + unit) &&
          !labels.some(
            (box) =>
              Math.abs(box.x - p.x) < (box.w + w) / 2 + 3 * unit &&
              Math.abs(box.y - p.y) < (box.h + h) / 2 + 3 * unit,
          ),
      );
    const label = position && { ...position, w, h };
    if (label) labels.push(label);
    return [{ a, b, text, contact: false, label }];
  });
  return (
    <g
      stroke={measurementColor}
      strokeWidth={1.5 * unit}
      pointerEvents="none"
      fontFamily="Arial"
    >
      {lines.map(({ a, b, contact }, i) =>
        contact ? (
          <circle
            key={i}
            cx={b.x}
            cy={b.y}
            r={4 * unit}
            fill="white"
            stroke="#a24447"
          />
        ) : (
          <g key={i}>
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              strokeDasharray={`${4 * unit} ${2 * unit}`}
            />
            <circle cx={a.x} cy={a.y} r={2.3 * unit} fill="white" />
            <circle cx={b.x} cy={b.y} r={2.3 * unit} fill="white" />
          </g>
        ),
      )}
      {lines.map(
        ({ label, text }, i) =>
          label && (
            <g key={i} data-boundary-distance={text}>
              <rect
                x={label.x - label.w / 2}
                y={label.y - label.h / 2}
                width={label.w}
                height={label.h}
                rx={3 * unit}
                fill="white"
                strokeWidth={0.75 * unit}
              />
              <text
                x={label.x}
                y={label.y + 4 * unit}
                textAnchor="middle"
                fontSize={12 * unit}
                fill={measurementColor}
                stroke="none"
              >
                {text}
              </text>
            </g>
          ),
      )}
    </g>
  );
}

export function propertyMapSheet(
  plan: Plan,
  map: PropertyMap,
  parcels: ParcelMap,
  language: Language = "en",
): SheetDrawing | undefined {
  const t = translate(language);
  const footprint = mapFootprint(plan);
  const placement = map.placement;
  if (!footprint || !placement) return;
  const corners = placedFootprint(footprint, placement);
  const measurements = boundaryMeasurements(
    corners,
    parcels.selected,
    placement.center,
    language,
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
    title: t("Property map"),
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
          <MapMeasurements
            distances={measurements?.distances}
            toView={toView}
            bounds={bounds}
            unit={18}
            language={language}
          />
        </g>
        <NorthArrow x={w / 2 - 600} y={-h / 2 + 600} unit={22} />
      </g>,
    ),
    legendLinks: { 1: mapAttributionUrl },
    legend: [
      map.property.number,
      `${printBackground.attribution} · Matrikkelen - Eiendomskart Teig · CC BY 4.0`,
      measurements?.summary ?? t("Selected parcel boundary unavailable."),
      t("Mapped boundaries and horizontal distances are approximate."),
    ],
  };
}
