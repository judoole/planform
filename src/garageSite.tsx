import { renderToStaticMarkup } from "react-dom/server";
import { pointsBox, type Plan, type Point } from "./model";
import {
  siteDistances,
  siteGarageGeometry,
  siteScale,
  siteFeatureNames,
  siteMapProblem,
  type GarageSite,
} from "./siteMap";
import type { SheetDrawing } from "./sheets";

const points = (list: readonly Point[]) =>
  list.map(({ x, y }) => `${x},${y}`).join(" ");
const colors = {
  boundary: "#a24447",
  road: "#6a507e",
  building: "#79503c",
  utility: "#267890",
  buildingLine: "#805480",
  access: "#277553",
  parking: "#23747d",
};

export function SiteArtwork({ plan, site }: { plan: Plan; site: GarageSite }) {
  const { width, height, dataUrl } = site.map;
  let garage: ReturnType<typeof siteGarageGeometry> | undefined;
  if (siteScale(site) && site.placement) {
    try {
      garage = siteGarageGeometry(plan, site);
    } catch {
      /* The panel reports invalid geometry. */
    }
  }
  const unit = Math.max(0.25, Math.max(width, height) / 600);
  const font = unit * 12;
  const north = { x: width - 35 * unit, y: 35 * unit };
  const distances = garage
    ? siteDistances(garage.corners, site.features, garage.scale)
    : [];
  return (
    <>
      <image href={dataUrl} width={width} height={height} />
      <g fill="none" strokeWidth={2 * unit}>
        {site.features.map((feature, index) => (
          <g key={index} stroke={colors[feature.kind]}>
            {feature.kind === "parking" ? (
              <polygon
                points={points(feature.points)}
                fill="#f0f9fa"
                fillOpacity={0.6}
              />
            ) : (
              <polyline
                points={points(feature.points)}
                strokeDasharray={
                  feature.kind === "access"
                    ? `${5 * unit} ${3 * unit}`
                    : undefined
                }
              />
            )}
            <text
              x={feature.points[0].x + 4 * unit}
              y={feature.points[0].y - 4 * unit}
              fill={colors[feature.kind]}
              stroke="none"
              fontFamily="Arial"
              fontSize={font}
            >
              {index + 1}
            </text>
          </g>
        ))}
        {garage && (
          <g stroke="#174b3c">
            <polygon
              data-garage-footprint="true"
              points={points(garage.corners)}
              fill="#d7efe5"
              fillOpacity={0.85}
            />
            {garage.ridge && (
              <polyline
                points={points(garage.ridge)}
                strokeDasharray={`${5 * unit} ${3 * unit}`}
              />
            )}
          </g>
        )}
        {distances.map(({ a, b, distanceM, index }) => (
          <g key={index} stroke="#263b66">
            <line
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              strokeDasharray={`${3 * unit} ${2 * unit}`}
            />
            <text
              x={(a.x + b.x) / 2}
              y={(a.y + b.y) / 2 - 3 * unit}
              fontFamily="Arial"
              fontSize={font}
              fill="#263b66"
              stroke="white"
              strokeWidth={3 * unit}
              paintOrder="stroke"
              textAnchor="middle"
            >
              {index + 1} · {distanceM.toFixed(2)} m
            </text>
          </g>
        ))}
      </g>
      <g
        transform={`translate(${north.x} ${north.y}) rotate(${site.northDegrees})`}
      >
        <circle
          r={21 * unit}
          fill="white"
          stroke="#174b3c"
          strokeWidth={unit}
        />
        <path
          d={`M0 ${-13 * unit} L${-5 * unit} ${5 * unit} L0 ${2 * unit} L${5 * unit} ${5 * unit} Z`}
          fill="#174b3c"
        />
        <text
          y={15 * unit}
          textAnchor="middle"
          fontFamily="Arial"
          fontSize={font}
          fill="#174b3c"
        >
          N
        </text>
      </g>
    </>
  );
}

export function sitePlanSheet(plan: Plan, propertyId: string): SheetDrawing {
  const site = plan.garage?.site;
  if (!site) throw Error("Import a local municipal map.");
  const problem = siteMapProblem(site);
  if (problem) throw Error(problem);
  const { corners, scale } = siteGarageGeometry(plan, site);
  const { width, height } = site.map;
  const box = pointsBox(corners);
  if (box.x < 0 || box.y < 0 || box.x + box.w > width || box.y + box.h > height)
    throw Error(
      "Move the garage footprint fully within the map before exporting.",
    );
  if (!propertyId.trim())
    throw Error("Enter a property identifier in the Application package tab.");
  const distances = new Map(
    siteDistances(corners, site.features, scale).map((d) => [
      d.index,
      d.distanceM,
    ]),
  );
  return {
    title: "Site plan",
    bounds: { x: -5, y: -5, w: width * scale + 10, h: height * scale + 10 },
    markup: renderToStaticMarkup(
      <g transform={`scale(${scale})`}>
        <SiteArtwork plan={plan} site={site} />
      </g>,
    ),
    legend: [
      `Property: ${propertyId.trim()}`,
      "Distances measured horizontally from the garage exterior on the supplied map.",
      ...site.features.map((feature, i) => {
        const distance = distances.get(i);
        return `${i + 1}. ${feature.name || siteFeatureNames[feature.kind]}${distance !== undefined ? ` - ${distance.toFixed(2)} m` : ""}${feature.correction ? ` - ${feature.correction}` : ""}`;
      }),
    ],
  };
}
