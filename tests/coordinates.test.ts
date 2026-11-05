import { describe, it, expect } from "vitest";
import {
  screenToWorld,
  worldToScreen,
  zoomAt,
  pinchCamera,
} from "../src/coordinates";
import {
  bounds,
  emptyPlan,
  translate,
  duplicateItems,
  groupItems,
  parseProject,
  serialize,
  type RectItem,
  type Wall,
  type Opening,
} from "../src/model";
describe("screen and real-world coordinates", () => {
  it("keeps centimeter positions exact across zoom and pan", () => {
    const p = { x: 123.4567890123, y: -321.987654321 };
    for (const k of [0.02, 0.15, 1, 4, 20]) {
      const camera = { x: 285.876, y: -82.765, k };
      const restored = screenToWorld(worldToScreen(p, camera), camera);
      expect(restored.x).toBeCloseTo(p.x, 10);
      expect(restored.y).toBeCloseTo(p.y, 10);
    }
  });
  it("anchors zoom at the pointer", () => {
    const c = { x: 51, y: -32, k: 0.75 },
      a = { x: 580, y: 290 },
      q = screenToWorld(a, c);
    const next = zoomAt(c, a, 3.8);
    expect(screenToWorld(a, next).x).toBeCloseTo(q.x, 10);
    expect(screenToWorld(a, next).y).toBeCloseTo(q.y, 10);
  });
  it("anchors pinch zoom at its moving midpoint and clamps extremes", () => {
    const c = { x: 100, y: 80, k: 0.5 },
      a = { x: 300, y: 250 },
      b = { x: 340, y: 270 };
    const next = pinchCamera(c, a, b, 100, 250);
    expect(next.k).toBe(1.25);
    expect(screenToWorld(b, next)).toEqual(screenToWorld(a, c));
    expect(zoomAt(c, a, 100).k).toBe(20);
    expect(zoomAt(c, a, 0).k).toBe(0.02);
  });
});
describe("dense drawing updates and export bounds", () => {
  const v: RectItem = {
    id: "v",
    name: "Sofa",
    type: "furniture",
    kind: "sofa",
    x: 0,
    y: 0,
    w: 100,
    h: 80,
    rotation: 0,
  };
  it("preserves references of untouched symbols during interactive moves", () => {
    const p = {
      ...emptyPlan(),
      items: Array.from({ length: 2658 }, (_, n) => ({
        ...v,
        id: "v" + n,
        x: n,
      })),
    };
    const result = translate(p, ["v0"], { x: 10, y: 20 });
    expect(result.items[0]).not.toBe(p.items[0]);
    expect(result.items[2657]).toBe(p.items[2657]);
    expect(p.items[0].id).toBe("v0");
  });
  it("regenerates nested group IDs when duplicating", () => {
    const p = { ...emptyPlan(), items: [v, { ...v, id: "v2", x: 150 }] };
    const grouped = groupItems(p, ["v", "v2"]),
      r = duplicateItems(grouped, [grouped.items[0].id]);
    expect(() => parseProject(serialize(r.plan))).not.toThrow();
    expect(r.plan.items).toHaveLength(2);
    const [a, b] = r.plan.items as RectItem[];
    expect(a.children![0].id).not.toBe(b.children![0].id);
  });
  it("includes the entire door swing at every wall angle", () => {
    for (const rot of [0, 30, 90, 180]) {
      const a = (rot * Math.PI) / 180;
      const wall: Wall = {
        id: "w",
        name: "w",
        type: "wall",
        a: { x: 0, y: 0 },
        b: { x: 500 * Math.cos(a), y: 500 * Math.sin(a) },
        thickness: 20,
      };
      const door: Opening = {
        id: "d",
        name: "d",
        type: "door",
        hostId: "w",
        width: 100,
        t: 0.5,
        hinge: 1,
        swing: 1,
      };
      const b = bounds(door, [wall, door]);
      const tip = {
        x: 250 * Math.cos(a) - 50 * Math.cos(a) + 100 * Math.sin(a),
        y: 250 * Math.sin(a) - 50 * Math.sin(a) - 100 * Math.cos(a),
      };
      expect(tip.x).toBeGreaterThanOrEqual(b.x - 1e-8);
      expect(tip.x).toBeLessThanOrEqual(b.x + b.w + 1e-8);
      expect(tip.y).toBeGreaterThanOrEqual(b.y - 1e-8);
      expect(tip.y).toBeLessThanOrEqual(b.y + b.h + 1e-8);
    }
  });
});
