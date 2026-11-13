import { fixed, translate, type Language } from "./messages";
import { buildingGeometry } from "./building";
import { dist, pointsBox, rotate, type Plan, type Point } from "./model";
import { nearestSiteDistance } from "./siteMap";

export type Location = { lon: number; lat: number };
export type Property = { number: string; label: string; location: Location };
export type MapPlacement = { center: Location; rotation: number };
export type PropertyMap = { property: Property; placement?: MapPlacement };

export type Parcel = { number: string; rings: Point[][] };
export type ParcelMap = { selected: Parcel[]; nearby: Parcel[] };

const radius = 6378137;
const radians = Math.PI / 180;
const eccentricitySquared = 0.00669437999014;
export const maxLatitude = 85.05112878;

export function projectLocation({ lon, lat }: Location): Point {
  return {
    x: radius * lon * radians,
    y: radius * Math.asinh(Math.tan(lat * radians)),
  };
}

export function mapLocation({ x, y }: Point): Location {
  return {
    lon: Math.max(-180, Math.min(180, x / (radius * radians))),
    lat: Math.max(
      -maxLatitude,
      Math.min(maxLatitude, Math.atan(Math.sinh(y / radius)) / radians),
    ),
  };
}

// Ground meters per Web Mercator meter at the anchor on the WGS84 ellipsoid.
export function groundScale({ lat }: Location): Point {
  const phi = lat * radians;
  const denominator = Math.sqrt(1 - eccentricitySquared * Math.sin(phi) ** 2);
  const east = Math.cos(phi) / denominator;
  return {
    x: east,
    y: (east * (1 - eccentricitySquared)) / denominator ** 2,
  };
}

export function mapFootprint(plan: Plan) {
  const corners = buildingGeometry(plan).footprint?.corners;
  if (!corners) return;
  const bounds = pointsBox(corners);
  return {
    width: bounds.w / 100,
    height: bounds.h / 100,
    points: corners.map(({ x, y }) => ({
      x: (x - bounds.x - bounds.w / 2) / 100,
      y: (y - bounds.y - bounds.h / 2) / 100,
    })),
  };
}

export function placedFootprint(
  footprint: NonNullable<ReturnType<typeof mapFootprint>>,
  placement: MapPlacement,
) {
  const center = projectLocation(placement.center);
  const scale = groundScale(placement.center);
  return footprint.points.map((point) => {
    const { x, y } = rotate(point, placement.rotation);
    return { x: center.x + x / scale.x, y: center.y - y / scale.y };
  });
}

function ringContains(ring: Point[], { x, y }: Point) {
  let inside = false;
  for (let i = 1; i < ring.length; i++) {
    const [a, b] = [ring[i - 1], ring[i]];
    if (
      a.y > y !== b.y > y &&
      x < a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y)
    )
      inside = !inside;
  }
  return inside;
}

export type BoundaryDistance = { a: Point; b: Point; meters: number };

export function boundaryMeasurements(
  corners: Point[],
  parcels: Parcel[],
  location: Location,
  language: Language = "en",
) {
  const center = projectLocation(location);
  const scale = groundScale(location);
  const toGround = (p: Point) => ({
    x: (p.x - center.x) * scale.x,
    y: (p.y - center.y) * scale.y,
  });
  const toMap = (p: Point) => ({
    x: center.x + p.x / scale.x,
    y: center.y + p.y / scale.y,
  });
  const footprint = corners.map(toGround);
  const closestByDirection = new Map<number, BoundaryDistance>();
  let contact: BoundaryDistance | undefined;
  for (const { rings } of parcels) {
    for (const ring of rings) {
      const points = ring.map(toGround);
      for (let i = 1; i < points.length; i++) {
        if (dist(points[i - 1], points[i]) < 0.001) continue;
        const next = nearestSiteDistance(footprint, [
          points[i - 1],
          points[i],
        ])!;
        const measurement = {
          a: toMap(next.a),
          b: toMap(next.b),
          meters: next.distance,
        };
        if (next.distance < 1e-6) {
          contact ??= { ...measurement, meters: 0 };
          continue;
        }
        // Keep only the closest edge in each direction so short cadastral segments do not crowd the map.
        const angle = Math.atan2(next.b.y - next.a.y, next.b.x - next.a.x);
        const direction = Math.round(angle / (Math.PI / 2) + 4) % 4;
        const previous = closestByDirection.get(direction);
        if (!previous || next.distance < previous.meters)
          closestByDirection.set(direction, measurement);
      }
    }
  }
  const distances = [...closestByDirection.values()].sort(
    (a, b) => a.meters - b.meters,
  );
  const nearest = contact ?? distances[0];
  if (!nearest) return;
  const inside = parcels.some(
    ({ rings: [outer, ...holes] }) =>
      ringContains(outer, center) &&
      !holes.some((ring) => ringContains(ring, center)),
  );
  const t = translate(language);
  return {
    distances: contact ? [contact] : distances,
    summary: contact
      ? t("Building touches or crosses a mapped boundary")
      : t(
          inside
            ? "Nearest mapped boundary: {distance}"
            : "Nearest mapped boundary: {distance} (outside parcel)",
          { distance: boundaryDistanceLabel(nearest.meters, language) },
        ),
  };
}

export function boundaryDistanceLabel(
  meters: number,
  language: Language = "en",
) {
  return meters > 0 && meters < 0.05
    ? `<${fixed(0.1, 1, language)} m`
    : `${fixed(meters, 1, language)} m`;
}
