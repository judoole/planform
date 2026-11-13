import {
  add,
  dist,
  isRect,
  openingFrame,
  rotate,
  type Dimension,
  type DimensionAnchor,
  type Item,
  type Plan,
  type Point,
} from "./model";
import { wallEnds } from "./junctions";

export function resolveDimensionAnchor(
  anchor: DimensionAnchor,
  items: Item[],
): Point | undefined {
  const item = items.find((i) => i.id === anchor.itemId);
  if (!item) return;
  if (anchor.point !== "center")
    return item.type === "wall" ? item[anchor.point] : undefined;
  if (isRect(item))
    return add(item, rotate({ x: item.w / 2, y: item.h / 2 }, item.rotation));
  if (item.type === "door" || item.type === "window")
    return openingFrame(item, items)?.center;
}

export function dimensionEndpoints(dimension: Dimension, items: Item[]) {
  return {
    a:
      (dimension.anchors?.a &&
        resolveDimensionAnchor(dimension.anchors.a, items)) ??
      dimension.a,
    b:
      (dimension.anchors?.b &&
        resolveDimensionAnchor(dimension.anchors.b, items)) ??
      dimension.b,
  };
}

export function dimensionDependsOn(item: Item, ids: ReadonlySet<string>) {
  return (
    item.type === "dimension" &&
    wallEnds.some((end) => {
      const anchor = item.anchors?.[end];
      return anchor && ids.has(anchor.itemId);
    })
  );
}

export function mapDimensionAnchors(
  dimension: Dimension,
  items: Item[],
  remap: (anchor: DimensionAnchor) => DimensionAnchor | undefined,
): Dimension {
  if (!dimension.anchors) return dimension;
  const { anchors: _anchors, ...dimensionWithoutAnchors } = dimension;
  const result = {
    ...dimensionWithoutAnchors,
    ...dimensionEndpoints(dimension, items),
  };
  const a = dimension.anchors.a && remap(dimension.anchors.a);
  const b = dimension.anchors.b && remap(dimension.anchors.b);
  return a || b
    ? { ...result, anchors: { ...(a ? { a } : {}), ...(b ? { b } : {}) } }
    : result;
}

export function detachRemovedAnchors(previous: Plan, next: Plan): Plan {
  const remaining = new Set(next.items.map((item) => item.id));
  return {
    ...next,
    items: next.items.map((item) =>
      item.type === "dimension" && item.anchors
        ? mapDimensionAnchors(item, previous.items, (anchor) =>
            remaining.has(anchor.itemId) ? anchor : undefined,
          )
        : item,
    ),
  };
}

export function findDimensionAnchor(
  point: Point,
  items: Item[],
  tolerance: number,
) {
  let best: { anchor: DimensionAnchor; point: Point; name: string } | undefined;
  let distance = tolerance;

  for (const item of items) {
    if (item.type === "dimension") continue;
    const points = item.type === "wall" ? wallEnds : (["center"] as const);
    for (const kind of points) {
      const anchor = { itemId: item.id, point: kind };
      const candidate =
        item.type === "wall" && kind !== "center"
          ? item[kind]
          : resolveDimensionAnchor(anchor, items);
      if (!candidate || dist(candidate, point) >= distance) continue;
      distance = dist(candidate, point);
      const label = kind === "a" ? "start" : kind === "b" ? "end" : "center";
      best = {
        anchor,
        point: candidate,
        name: `${item.name || item.id} ${label}`,
      };
    }
  }
  return best;
}
