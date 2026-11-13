import { garageFootprint } from "./garage";
import { buildingGeometry } from "./building";
import { add, dist, pointsBox, rotate, type Plan, type Point } from "./model";
import type { EmbeddedRaster } from "./reference";

export const siteFeatureNames = {
  boundary: "Property boundary",
  road: "Road centreline",
  building: "Nearby building edge",
  utility: "Utility",
  buildingLine: "Building line",
  access: "Proposed access",
  parking: "Proposed parking",
};
export type SiteFeatureKind = keyof typeof siteFeatureNames;
export type SiteFeature = {
  kind: SiteFeatureKind;
  name: string;
  points: Point[];
  correction?: string;
};
export type GarageSite = {
  map: EmbeddedRaster;
  calibration?: { a: Point; b: Point; distanceM: number };
  placement?: { center: Point; rotation: number };
  northDegrees: number;
  features: SiteFeature[];
};

const difference = (a: Point, b: Point) => ({ x: a.x - b.x, y: a.y - b.y });
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const interpolate = (a: Point, b: Point, t: number) => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

export function siteScale(site: GarageSite) {
  const calibration = site.calibration;
  if (
    calibration &&
    dist(calibration.a, calibration.b) > 0 &&
    calibration.distanceM > 0
  )
    return (calibration.distanceM * 100) / dist(calibration.a, calibration.b);
}

export function siteGarageGeometry(plan: Plan, site: GarageSite) {
  const scale = siteScale(site);
  if (!scale) throw Error("Calibrate the site map using a known distance.");
  if (!site.placement) throw Error("Place the building on the calibrated map.");
  const { center, rotation } = site.placement;
  const { corners } = garageFootprint(plan);
  const box = pointsBox(corners);
  const origin = { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  const transform = (point: Point) => {
    const p = rotate(difference(point, origin), rotation);
    return add(center, { x: p.x / scale, y: p.y / scale });
  };
  const ridge = buildingGeometry(plan).roof?.ridge;
  return {
    scale,
    corners: corners.map(transform),
    ridge: ridge?.map(transform),
  };
}

function nearestPoint(p: Point, start: Point, end: Point) {
  const d = difference(end, start),
    offset = difference(p, start);
  const length = d.x * d.x + d.y * d.y;
  const t = length
    ? Math.max(0, Math.min(1, (offset.x * d.x + offset.y * d.y) / length))
    : 0;
  return interpolate(start, end, t);
}

function segmentDistance(a: Point, b: Point, c: Point, d: Point) {
  const ab = difference(b, a),
    cd = difference(d, c),
    ac = difference(c, a);
  const determinant = cross(ab, cd);
  if (determinant !== 0) {
    const t = cross(ac, cd) / determinant;
    const u = cross(ac, ab) / determinant;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      const point = interpolate(a, b, t);
      return { a: point, b: point, distance: 0 };
    }
  }
  const candidates = [
    { a, b: nearestPoint(a, c, d) },
    { a: b, b: nearestPoint(b, c, d) },
    { a: nearestPoint(c, a, b), b: c },
    { a: nearestPoint(d, a, b), b: d },
  ].map((p) => ({ ...p, distance: dist(p.a, p.b) }));
  return candidates.reduce((shortest, p) =>
    p.distance < shortest.distance ? p : shortest,
  );
}

function pointInside(polygon: Point[], p: Point) {
  const signs = polygon.map((a, i) =>
    cross(difference(polygon[(i + 1) % polygon.length], a), difference(p, a)),
  );
  return (
    signs.every((value) => value >= 0) || signs.every((value) => value <= 0)
  );
}

export function nearestSiteDistance(corners: Point[], line: Point[]) {
  if (line.length < 2) return;
  const inside = line.find((point) => pointInside(corners, point));
  if (inside) return { a: inside, b: inside, distance: 0 };
  let result: ReturnType<typeof segmentDistance> | undefined;
  corners.forEach((a, edge) => {
    for (let i = 1; i < line.length; i++) {
      const next = segmentDistance(
        a,
        corners[(edge + 1) % corners.length],
        line[i - 1],
        line[i],
      );
      if (!result || next.distance < result.distance) result = next;
    }
  });
  return result;
}

export function siteDistances(
  corners: Point[],
  features: SiteFeature[],
  scale: number,
) {
  return features.flatMap((feature, index) => {
    if (feature.kind === "access" || feature.kind === "parking") return [];
    const nearest = nearestSiteDistance(corners, feature.points);
    return nearest
      ? [
          {
            ...nearest,
            distanceM: (nearest.distance * scale) / 100,
            feature,
            index,
          },
        ]
      : [];
  });
}

export function siteMapProblem(site: GarageSite) {
  const { width, height } = site.map;
  const onMap = (p: Point) =>
    p.x >= 0 && p.y >= 0 && p.x <= width && p.y <= height;
  if (
    site.calibration &&
    (!onMap(site.calibration.a) ||
      !onMap(site.calibration.b) ||
      !siteScale(site))
  )
    return "Calibrate with two different points on the map and a positive distance.";
  if (site.placement && !onMap(site.placement.center))
    return "Place the building centre within the map.";
  if (site.features.some((feature) => feature.points.some((p) => !onMap(p))))
    return "Map annotations must lie within the source map.";
}
