import { buildingGeometry } from "./building";
import { pointsBox, rotate, type Plan, type Point } from "./model";
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

export function boundaryMeasurement(
  corners: Point[],
  parcels: Parcel[],
  location: Location,
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
  let nearest: ReturnType<typeof nearestSiteDistance>;
  for (const { rings } of parcels) {
    for (const ring of rings) {
      const next = nearestSiteDistance(footprint, ring.map(toGround));
      if (next && (!nearest || next.distance < nearest.distance))
        nearest = next;
    }
  }
  if (!nearest) return;
  const inside = parcels.some(
    ({ rings: [outer, ...holes] }) =>
      ringContains(outer, center) &&
      !holes.some((ring) => ringContains(ring, center)),
  );
  return {
    a: toMap(nearest.a),
    b: toMap(nearest.b),
    label:
      nearest.distance < 0.05
        ? "Touches or crosses mapped boundary"
        : `${nearest.distance.toFixed(1)} m to mapped boundary${inside ? "" : " (outside parcel)"}`,
  };
}
