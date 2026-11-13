import {
  defaultLayer,
  itemLayerId,
  type Layer,
  type RenovationStatus,
  type RenovationView,
} from "./layers";
import type { BuildingSettings } from "./building";
import { readProject } from "./validation";
import type { GarageDetails } from "./garage";
import {
  detachRemovedAnchors,
  dimensionDependsOn,
  dimensionEndpoints,
  mapDimensionAnchors,
} from "./dimensions";
import {
  checkWallEdits,
  connectedEndpoints,
  wallEnds,
  type EditProtection,
  type WallEnd,
} from "./junctions";
import type { Project } from "./project";
import type { FurnitureKind } from "./furniture";
import { traceBounds, type TraceReference } from "./reference";
export type Point = { x: number; y: number };
export type Box = Point & { w: number; h: number };
export type Evidence = { basis: "measured" | "estimated"; note: string };
type Base = {
  id: string;
  name: string;
  locked?: boolean;
  evidence?: Evidence;
  layerId?: string;
};
export type Wall = Base & {
  type: "wall";
  a: Point;
  b: Point;
  thickness: number;
  junctions?: Partial<Record<WallEnd, string>>;
  renovationStatus?: RenovationStatus;
  height?: number;
};
export type DoorStyle = "hinged" | "sliding";
export type Opening = Base & {
  type: "door" | "window";
  hostId: string;
  t: number;
  width: number;
  height?: number;
  sill?: number;
  hinge: number;
  swing: number;
  style?: DoorStyle;
  slideDirection?: -1 | 1;
};
export type RectItem = Base &
  Box & {
    type: "furniture" | "stairs" | "text" | "group";
    rotation: number;
    kind?: FurnitureKind;
    steps?: number;
    text?: string;
    fontSize?: number;
    sourceBox?: Box;
    children?: Item[];
  };
export type DimensionAnchor = { itemId: string; point: WallEnd | "center" };
export type Dimension = Base & {
  type: "dimension";
  a: Point;
  b: Point;
  offset: number;
  anchors?: Partial<Record<WallEnd, DimensionAnchor>>;
};
export type Item = Wall | Opening | RectItem | Dimension;
export type Plan = {
  format: "planform";
  version: 2;
  name: string;
  units: "cm";
  items: Item[];
  showExteriorDimensions?: boolean;
  garage?: GarageDetails;
  traceReference?: TraceReference;
  layers?: Layer[];
  activeLayerId?: string;
  renovationView?: RenovationView;
  building?: BuildingSettings;
  calibration: {
    calibrated: boolean;
    imported: boolean;
    factor: number;
    source?: string;
  };
  source?: { file: string; page?: number; notes: string[] };
  grid: number;
};
export const uid = () => crypto.randomUUID();
export const emptyPlan = (): Plan => ({
  format: "planform",
  version: 2,
  name: "Untitled plan",
  units: "cm",
  items: [],
  calibration: { calibrated: true, imported: false, factor: 1 },
  grid: 10,
});
export const clone = <T>(v: T): T => structuredClone(v);
export const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);
export const angle = (a: Point, b: Point) =>
  (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
export const add = (a: Point, b: Point): Point => ({
  x: a.x + b.x,
  y: a.y + b.y,
});
export const same = (a: Point, b: Point) => dist(a, b) < 1e-6;
export const isRect = (i: Item): i is RectItem => "rotation" in i;
export function rotate(p: Point, deg: number): Point {
  const r = (deg * Math.PI) / 180;
  return {
    x: p.x * Math.cos(r) - p.y * Math.sin(r),
    y: p.x * Math.sin(r) + p.y * Math.cos(r),
  };
}
export function project(p: Point, w: Wall) {
  const l = dist(w.a, w.b);
  const t = l
    ? Math.max(
        0,
        Math.min(
          1,
          ((p.x - w.a.x) * (w.b.x - w.a.x) + (p.y - w.a.y) * (w.b.y - w.a.y)) /
            (l * l),
        ),
      )
    : 0;
  const point = {
    x: w.a.x + (w.b.x - w.a.x) * t,
    y: w.a.y + (w.b.y - w.a.y) * t,
  };
  return { t, point, distance: dist(point, p) };
}
export function openingFrame(o: Opening, items: Item[]) {
  const w = items.find((i) => i.id === o.hostId) as Wall | undefined;
  if (!w || w.type !== "wall") return null;
  return {
    wall: w,
    center: {
      x: w.a.x + (w.b.x - w.a.x) * o.t,
      y: w.a.y + (w.b.y - w.a.y) * o.t,
    },
    angle: angle(w.a, w.b),
  };
}
export function normalizeOpenings(plan: Plan): Plan {
  const p = {
    ...plan,
    items: plan.items.map((i) =>
      i.type === "door" || i.type === "window" ? { ...i } : i,
    ),
  };
  p.items = p.items.filter((i) => {
    if (i.type !== "door" && i.type !== "window") return true;
    const w = p.items.find((x) => x.id === i.hostId) as Wall | undefined;
    if (!w || w.type !== "wall" || dist(w.a, w.b) < 5) return false;
    const l = dist(w.a, w.b);
    i.width = Math.min(Math.max(1, i.width), l);
    const half = i.width / (2 * l);
    i.t = Math.max(half, Math.min(1 - half, i.t));
    return true;
  });
  // Fit openings to free spans in deterministic drawing order; remove those with no space.
  const occupied = new Map<string, { start: number; end: number }[]>();
  p.items = p.items.filter((i) => {
    if (i.type !== "door" && i.type !== "window") return true;
    const w = p.items.find((x) => x.id === i.hostId) as Wall;
    const l = dist(w.a, w.b);
    const spans = occupied.get(w.id) || [];
    const gaps: { start: number; end: number }[] = [];
    let start = 0;
    for (const s of [...spans].sort((a, b) => a.start - b.start)) {
      if (s.start > start) gaps.push({ start, end: s.start });
      start = s.end;
    }
    if (start < l) gaps.push({ start, end: l });
    let gap = gaps
      .filter((g) => g.end - g.start >= i.width - 1e-6)
      .sort(
        (a, b) =>
          Math.abs((a.start + a.end) / 2 - i.t * l) -
          Math.abs((b.start + b.end) / 2 - i.t * l),
      )[0];
    if (!gap) {
      gap = gaps.sort((a, b) => b.end - b.start - (a.end - a.start))[0];
      if (!gap || gap.end - gap.start < 5) return false;
      i.width = Math.min(i.width, gap.end - gap.start);
    }
    const center = Math.max(
      gap.start + i.width / 2,
      Math.min(gap.end - i.width / 2, i.t * l),
    );
    i.t = center / l;
    spans.push({ start: center - i.width / 2, end: center + i.width / 2 });
    occupied.set(w.id, spans);
    return true;
  });
  const remaining = new Set(p.items.map((item) => item.id));
  const removed = new Set(
    plan.items.filter((item) => !remaining.has(item.id)).map((item) => item.id),
  );
  if (removed.size)
    p.items = p.items.filter((item) => !dimensionDependsOn(item, removed));
  return p;
}
export function bounds(i: Item, items: Item[]): Box {
  if (i.type === "wall" || i.type === "dimension") {
    const pad = i.type === "wall" ? i.thickness / 2 : Math.abs(i.offset) + 10;
    const { a, b } = i.type === "wall" ? i : dimensionEndpoints(i, items);
    return {
      x: Math.min(a.x, b.x) - pad,
      y: Math.min(a.y, b.y) - pad,
      w: Math.abs(b.x - a.x) + 2 * pad,
      h: Math.abs(b.y - a.y) + 2 * pad,
    };
  }
  if (i.type === "door" || i.type === "window") {
    const f = openingFrame(i, items);
    if (!f) return { x: 0, y: 0, w: 0, h: 0 };
    const half = i.width / 2,
      thickness = f.wall.thickness / 2;
    const swingTip =
      i.type === "door" && i.style !== "sliding" ? -i.width * i.swing : 0;
    const yMin = Math.min(swingTip, -thickness);
    const yMax = Math.max(swingTip, thickness);
    return pointsBox(
      [
        { x: -half, y: yMin },
        { x: half, y: yMin },
        { x: half, y: yMax },
        { x: -half, y: yMax },
      ].map((p) => add(rotate(p, f.angle), f.center)),
    );
  }
  if (!isRect(i)) throw Error("Unknown item");
  const pts = [
    { x: 0, y: 0 },
    { x: i.w, y: 0 },
    { x: i.w, y: i.h },
    { x: 0, y: i.h },
  ].map((p) => add(rotate(p, i.rotation), i));
  return pointsBox(pts);
}
export function pointsBox(pts: Point[]): Box {
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y);
  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}
export function unionBoxes(boxes: Box[]): Box {
  if (!boxes.length) return { x: 0, y: 0, w: 800, h: 600 };
  return pointsBox(
    boxes.flatMap((b) => [
      { x: b.x, y: b.y },
      { x: b.x + b.w, y: b.y + b.h },
    ]),
  );
}
export function planBounds(p: Plan) {
  const boxes = p.items.map((i) => bounds(i, p.items));
  if (p.traceReference?.visible) boxes.push(traceBounds(p.traceReference));
  return unionBoxes(boxes);
}
export function setCorner(
  plan: Plan,
  wallId: string,
  which: "a" | "b",
  p: Point,
  normalize = true,
  protectedItem: EditProtection = (item) => Boolean(item.locked),
): Plan {
  const wall = plan.items.find((i) => i.id === wallId) as Wall;
  const old = wall[which];
  const connected = connectedEndpoints(plan, old);
  checkWallEdits(
    plan,
    connected.map(({ wall }) => wall),
    protectedItem,
  );
  if (
    connected.some(
      ({ wall, end }) => dist(wall[end === "a" ? "b" : "a"], p) < 0.001,
    )
  )
    throw Error("A wall endpoint cannot be moved onto its opposite endpoint.");
  const next = {
    ...plan,
    items: plan.items.map((i) => {
      if (i.type !== "wall" || (!same(i.a, old) && !same(i.b, old))) return i;
      return {
        ...i,
        a: same(i.a, old) ? { ...p } : i.a,
        b: same(i.b, old) ? { ...p } : i.b,
      };
    }),
  };
  return normalize ? normalizeOpenings(next) : next;
}
export function translate(
  plan: Plan,
  ids: string[],
  delta: Point,
  protectedItem: EditProtection = (item) => Boolean(item.locked),
): Plan {
  const corners: Point[] = [];
  for (const i of plan.items)
    if (ids.includes(i.id) && i.type === "wall") corners.push(i.a, i.b);
  checkWallEdits(
    plan,
    corners.flatMap((point) =>
      connectedEndpoints(plan, point).map(({ wall }) => wall),
    ),
    protectedItem,
  );
  const items = plan.items.map((i) => {
    if (i.type === "wall") {
      const a = corners.some((c) => same(c, i.a)),
        b = corners.some((c) => same(c, i.b));
      if (!a && !b) return i;
      const wall = {
        ...i,
        a: a ? add(i.a, delta) : i.a,
        b: b ? add(i.b, delta) : i.b,
      };
      if (dist(wall.a, wall.b) < 0.001)
        throw Error(
          "A wall endpoint cannot be moved onto its opposite endpoint.",
        );
      return wall;
    }
    if (!ids.includes(i.id)) return i;
    if (isRect(i)) return { ...i, x: i.x + delta.x, y: i.y + delta.y };
    if (i.type === "dimension") {
      if (!i.anchors) return { ...i, a: add(i.a, delta), b: add(i.b, delta) };
      if (
        wallEnds.some((end) => {
          const anchor = i.anchors?.[end];
          return anchor && ids.includes(anchor.itemId);
        })
      )
        return i;
      const { a, b } = dimensionEndpoints(i, plan.items);
      const length = dist(a, b);
      const extra = length
        ? ((b.x - a.x) * delta.y - (b.y - a.y) * delta.x) / length
        : 0;
      return { ...i, offset: i.offset + extra };
    }
    const w = plan.items.find((x) => x.id === i.hostId) as Wall;
    const f = openingFrame(i, plan.items);
    return f && !ids.includes(w.id)
      ? { ...i, t: project(add(f.center, delta), w).t }
      : i;
  });
  return normalizeOpenings({ ...plan, items });
}
export function deletionIds(plan: Plan, ids: readonly string[]): Set<string> {
  const removed = new Set(ids);
  for (const item of plan.items) {
    if (
      (item.type === "door" || item.type === "window") &&
      removed.has(item.hostId)
    )
      removed.add(item.id);
  }
  for (const item of plan.items) {
    if (dimensionDependsOn(item, removed)) removed.add(item.id);
  }
  return removed;
}

export function removeItems(plan: Plan, ids: string[]): Plan {
  const removed = deletionIds(plan, ids);
  return { ...plan, items: plan.items.filter((item) => !removed.has(item.id)) };
}
export function duplicateItems(
  plan: Plan,
  ids: string[],
  delta: Point = { x: 30, y: 30 },
) {
  const p = clone(plan),
    map = new Map<string, string>(),
    junctions = new Map<string, string>();
  const source = plan.items.filter(
    (i) =>
      ids.includes(i.id) ||
      ((i.type === "door" || i.type === "window") && ids.includes(i.hostId)),
  );
  function assign(i: Item) {
    map.set(i.id, uid());
    if (isRect(i)) i.children?.forEach(assign);
  }
  source.forEach(assign);
  function remap(i: Item): Item {
    const c =
      i.type === "dimension"
        ? mapDimensionAnchors(clone(i), plan.items, (anchor) => {
            const id = map.get(anchor.itemId);
            return id ? { ...anchor, itemId: id } : undefined;
          })
        : clone(i);
    c.id = map.get(i.id)!;
    if ((c.type === "door" || c.type === "window") && map.has(c.hostId))
      c.hostId = map.get(c.hostId)!;
    if (c.type === "wall" && c.junctions) {
      for (const end of wallEnds) {
        const original = c.junctions[end];
        if (!original) continue;
        const copy = junctions.get(original) ?? uid();
        junctions.set(original, copy);
        c.junctions[end] = copy;
      }
    }
    if (isRect(c) && c.children) c.children = c.children.map(remap);
    return c;
  }
  const copies = source
    .map(remap)
    .map((item) =>
      item.type === "wall" || (item.type === "dimension" && item.anchors)
        ? { ...item, a: add(item.a, delta), b: add(item.b, delta) }
        : item,
    );
  const copiedIds = new Set(copies.map((item) => item.id));
  const moved = copies.filter(
    (item) =>
      item.type !== "wall" &&
      !(item.type === "dimension" && item.anchors) &&
      !(
        (item.type === "door" || item.type === "window") &&
        copiedIds.has(item.hostId)
      ),
  );
  const next = translate(
    { ...p, items: [...p.items, ...copies] },
    moved.map((item) => item.id),
    delta,
  );
  const remaining = new Set(next.items.map((item) => item.id));
  return {
    plan: next,
    ids: source
      .filter(
        (item) => ids.includes(item.id) && remaining.has(map.get(item.id)!),
      )
      .map((item) => map.get(item.id)!),
  };
}
export function calibrate(plan: Plan, measured: number, real: number): Plan {
  if (
    !Number.isFinite(real) ||
    !Number.isFinite(measured) ||
    real <= 0 ||
    measured < 1e-9
  )
    throw Error("Choose two different points and a positive real distance.");
  const p = clone(plan),
    s = real / measured;
  const scalePt = (a: Point): Point => ({ x: a.x * s, y: a.y * s });
  for (const i of p.items) {
    if (isRect(i)) {
      i.x *= s;
      i.y *= s;
      i.w *= s;
      i.h *= s;
      if (i.type === "text") i.fontSize = (i.fontSize || 18) * s;
    } else if (i.type === "wall" || i.type === "dimension") {
      i.a = scalePt(i.a);
      i.b = scalePt(i.b);
      if (i.type === "wall") i.thickness *= s;
      else i.offset *= s;
    } else i.width *= s;
  }
  if (p.traceReference) {
    const reference = p.traceReference;
    reference.x *= s;
    reference.y *= s;
    reference.width *= s;
    reference.calibrated = true;
  }
  p.calibration.calibrated = true;
  p.calibration.factor *= s;
  return normalizeOpenings(p);
}
export function snapPoint(
  p: Point,
  plan: Plan,
  enabled: boolean,
  tolerance: number,
  exclude: string[] = [],
  origin?: Point,
) {
  if (!enabled) return { point: p, kind: "" };
  const candidates = plan.items
    .filter((i) => !exclude.includes(i.id))
    .flatMap((i) =>
      i.type === "dimension"
        ? Object.values(dimensionEndpoints(i, plan.items))
        : i.type === "wall"
          ? [i.a, i.b]
          : isRect(i)
            ? [{ x: i.x, y: i.y }]
            : [],
    );
  const end = candidates.find((c) => dist(c, p) < tolerance);
  if (end) return { point: { ...end }, kind: "Endpoint" };
  let point = {
      x: Math.round(p.x / plan.grid) * plan.grid,
      y: Math.round(p.y / plan.grid) * plan.grid,
    },
    kind = "Grid";
  for (const c of [...candidates, ...(origin ? [origin] : [])]) {
    if (Math.abs(p.x - c.x) < tolerance) {
      point.x = c.x;
      kind = "Alignment";
    }
    if (Math.abs(p.y - c.y) < tolerance) {
      point.y = c.y;
      kind = "Alignment";
    }
  }
  return { point, kind };
}
export function groupItems(plan: Plan, ids: string[]): Plan {
  const p = clone(plan),
    children = p.items.filter((i) => ids.includes(i.id));
  if (children.length < 2 || children.some((i) => !isRect(i)))
    throw Error(
      "Group two or more symbols, labels or groups. Walls retain shared corners and host relationships.",
    );
  const layerId = itemLayerId(p, children[0]);
  if (children.some((child) => itemLayerId(p, child) !== layerId))
    throw Error("Move symbols onto the same layer before grouping them.");
  const box = unionBoxes(children.map((i) => bounds(i, p.items)));
  const group: RectItem = {
    id: uid(),
    type: "group",
    name: "Group",
    ...box,
    rotation: 0,
    sourceBox: box,
    ...(layerId === defaultLayer.id ? {} : { layerId }),
    children: children.map(({ layerId: _layerId, ...child }) => child),
  };
  const first = p.items.findIndex((i) => i.id === children[0].id);
  p.items = p.items.filter((i) => !ids.includes(i.id));
  p.items.splice(first, 0, group);
  return detachRemovedAnchors(plan, p);
}
export function ungroupItems(plan: Plan, id: string): Plan {
  const p = clone(plan),
    g = p.items.find((i) => i.id === id);
  if (!g || g.type !== "group" || !g.sourceBox) return p;
  const b = g.sourceBox,
    sx = g.w / (b.w || 1),
    sy = g.h / (b.h || 1);
  if (
    Math.abs(sx - sy) > 1e-6 &&
    (g.children || []).some(
      (i) =>
        isRect(i) && Math.abs(Math.sin((i.rotation * Math.PI) / 180)) > 1e-6,
    )
  )
    throw Error(
      "Use uniform group scaling before ungrouping rotated children; non-uniform scaling would introduce shear.",
    );
  const children = (g.children || []).map((c) => {
    const i = clone(c) as RectItem;
    const q = rotate({ x: (i.x - b.x) * sx, y: (i.y - b.y) * sy }, g.rotation);
    i.x = g.x + q.x;
    i.y = g.y + q.y;
    i.w *= sx;
    i.h *= sy;
    i.rotation += g.rotation;
    if (g.layerId !== undefined) i.layerId = g.layerId;
    return i;
  });
  p.items.splice(p.items.indexOf(g), 1, ...children);
  return detachRemovedAnchors(plan, p);
}
export function serialize(project: Project) {
  return JSON.stringify(project, null, 2);
}
export function parseProject(text: string): Plan {
  return readProject(text);
}
export class History {
  past: Plan[] = [];
  future: Plan[] = [];
  push(p: Plan) {
    this.past.push(p);
    if (this.past.length > 60) this.past.shift();
    this.future = [];
  }
  updateSnapshots(update: (p: Plan) => Plan) {
    this.past = this.past.map(update);
    this.future = this.future.map(update);
  }
  undo(current: Plan) {
    const p = this.past.pop();
    if (!p) return current;
    this.future.push(current);
    return p;
  }
  redo(current: Plan) {
    const p = this.future.pop();
    if (!p) return current;
    this.past.push(current);
    return p;
  }
}
