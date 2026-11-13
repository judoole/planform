import { fixed, type Language } from "./messages";
import polygonClipping, { type Polygon, type Ring } from "polygon-clipping";
import polylabel from "polylabel";
import { type Item, type Point, type Wall, dist, same } from "./model";

export type Room = {
  polygon: Polygon;
  areaCm2: number;
  label: Point;
  clearance: number;
};

// Translate before applying the shoelace formula to retain precision far from 0,0.
function ringArea(ring: Ring): number {
  const [x, y] = ring[0];
  let twiceArea = 0;
  for (let i = 1; i < ring.length - 1; i++) {
    twiceArea +=
      (ring[i][0] - x) * (ring[i + 1][1] - y) -
      (ring[i + 1][0] - x) * (ring[i][1] - y);
  }
  return Math.abs(twiceArea) / 2;
}

/** Derive enclosed floor regions from architectural walls, in model centimeters.
 * Door/window symbols preserve the room boundary. Furniture and other symbols
 * do not define rooms. Wall intersections, thickness and islands are handled by
 * subtracting the wall footprints from a padded surrounding rectangle.
 */
export function findRooms(items: Item[]): Room[] {
  const walls = items.filter(
    (i): i is Wall => i.type === "wall" && dist(i.a, i.b) > 1e-6,
  );
  if (walls.length < 3) return [];

  const footprints: Polygon[] = [];
  const joints: { point: Point; radius: number; count: number }[] = [];
  for (const wall of walls) {
    const length = dist(wall.a, wall.b);
    const nx = ((-(wall.b.y - wall.a.y) / length) * wall.thickness) / 2;
    const ny = (((wall.b.x - wall.a.x) / length) * wall.thickness) / 2;
    const { a, b } = wall;
    footprints.push([
      [
        [a.x + nx, a.y + ny],
        [b.x + nx, b.y + ny],
        [b.x - nx, b.y - ny],
        [a.x - nx, a.y - ny],
        [a.x + nx, a.y + ny],
      ],
    ]);
    for (const point of [a, b]) {
      const joint = joints.find((j) => same(j.point, point));
      if (joint) {
        joint.count++;
        joint.radius = Math.max(joint.radius, wall.thickness / 2);
      } else joints.push({ point, radius: wall.thickness / 2, count: 1 });
    }
  }
  // Match the rounded shared-corner fills in WallShape. A 64-sided circle keeps
  // the approximation below the displayed 0.01 m² for ordinary wall thicknesses.
  for (const { point, radius, count } of joints) {
    if (count < 2) continue;
    const ring: Ring = Array.from({ length: 64 }, (_, n) => {
      const angle = (n * Math.PI) / 32;
      // Remove trigonometric residue at cardinal directions so touching edges
      // remain coincident in the polygon sweep. Stored wall coordinates stay exact.
      return [
        point.x + Math.round(Math.cos(angle) * radius * 1e8) / 1e8,
        point.y + Math.round(Math.sin(angle) * radius * 1e8) / 1e8,
      ];
    });
    ring.push(ring[0]);
    footprints.push([ring]);
  }

  let left = Infinity,
    top = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const [ring] of footprints)
    for (const [x, y] of ring) {
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  const padding = Math.max(100, right - left, bottom - top) * 0.1;
  left -= padding;
  top -= padding;
  right += padding;
  bottom += padding;
  const surround: Polygon = [
    [
      [left, top],
      [right, top],
      [right, bottom],
      [left, bottom],
      [left, top],
    ],
  ];
  const floor = polygonClipping.difference(surround, ...footprints);
  const rooms: Room[] = [];
  for (const polygon of floor) {
    // The region reaching the surrounding rectangle is outside the building.
    if (
      polygon[0].some(
        ([x, y]) => x <= left || x >= right || y <= top || y >= bottom,
      )
    )
      continue;
    const areaCm2 =
      ringArea(polygon[0]) -
      polygon.slice(1).reduce((sum, hole) => sum + ringArea(hole), 0);
    if (areaCm2 < 1e-6) continue;
    const label = polylabel(polygon, 0.1);
    rooms.push({
      polygon,
      areaCm2,
      label: { x: label[0], y: label[1] },
      clearance: label.distance,
    });
  }
  // Stable spatial numbering, independent of wall order and direction.
  return rooms.sort(
    (a, b) =>
      a.polygon[0][0][1] - b.polygon[0][0][1] ||
      a.polygon[0][0][0] - b.polygon[0][0][0],
  );
}

export function formatRoomArea(
  areaCm2: number,
  language: Language = "en",
): string {
  const squareMeters = areaCm2 / 10_000;
  return squareMeters > 0 && squareMeters < 0.005
    ? `< ${fixed(0.01, 2, language)} m²`
    : `${fixed(squareMeters, 2, language)} m²`;
}
