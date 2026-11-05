import type { Point } from "./model";
export type Camera = { x: number; y: number; k: number };
export const screenToWorld = (p: Point, c: Camera): Point => ({
  x: (p.x - c.x) / c.k,
  y: (p.y - c.y) / c.k,
});
export const worldToScreen = (p: Point, c: Camera): Point => ({
  x: p.x * c.k + c.x,
  y: p.y * c.k + c.y,
});
export function zoomAt(c: Camera, anchor: Point, scale: number): Camera {
  const k = Math.max(0.02, Math.min(20, scale));
  return {
    k,
    x: anchor.x - ((anchor.x - c.x) * k) / c.k,
    y: anchor.y - ((anchor.y - c.y) * k) / c.k,
  };
}
export function pinchCamera(
  c: Camera,
  initialCenter: Point,
  currentCenter: Point,
  initialDistance: number,
  currentDistance: number,
): Camera {
  const zoomed = zoomAt(
    c,
    initialCenter,
    (c.k * currentDistance) / Math.max(initialDistance, 1),
  );
  return {
    ...zoomed,
    x: zoomed.x + currentCenter.x - initialCenter.x,
    y: zoomed.y + currentCenter.y - initialCenter.y,
  };
}
