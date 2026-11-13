import type { Item, Plan } from "./model";

export type Layer = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
};

export const defaultLayer: Layer = {
  id: "default",
  name: "Default",
  visible: true,
  locked: false,
};

export function drawingLayers(plan: Plan): readonly Layer[] {
  return plan.layers ?? [defaultLayer];
}

export function activeLayer(plan: Plan): Layer {
  return (
    drawingLayers(plan).find((layer) => layer.id === plan.activeLayerId) ??
    drawingLayers(plan).find((layer) => layer.id === defaultLayer.id)!
  );
}

export function itemLayerId(plan: Plan, item: Item): string {
  if (item.type === "door" || item.type === "window")
    return (
      plan.items.find((host) => host.id === item.hostId)?.layerId ??
      defaultLayer.id
    );
  return item.layerId ?? defaultLayer.id;
}

export function isLayerLocked(plan: Plan, item: Item): boolean {
  return drawingLayers(plan).some(
    (layer) => layer.id === itemLayerId(plan, item) && layer.locked,
  );
}

export function isObjectLocked(item: Item): boolean {
  return !!(
    item.locked ||
    (item.type === "group" && item.children?.some(isObjectLocked))
  );
}

export function isLayerVisible(plan: Plan, item: Item): boolean {
  return drawingLayers(plan).some(
    (layer) => layer.id === itemLayerId(plan, item) && layer.visible,
  );
}

export function isItemLocked(plan: Plan, item: Item): boolean {
  return (
    isLayerLocked(plan, item) ||
    isObjectLocked(item) ||
    ((item.type === "door" || item.type === "window") &&
      !!plan.items.find((host) => host.id === item.hostId)?.locked)
  );
}

export function isEditProtected(plan: Plan, item: Item): boolean {
  return !isLayerVisible(plan, item) || isItemLocked(plan, item);
}

export function visiblePlan(plan: Plan): Plan {
  if (!plan.layers) return plan;
  const idToLayer = new Map(plan.layers.map((layer, i) => [layer.id, i]));
  const wallToLayer = new Map(
    plan.items
      .filter((item) => item.type === "wall")
      .map((wall) => [wall.id, wall.layerId ?? defaultLayer.id]),
  );
  const byLayer: Item[][] = plan.layers.map(() => []);
  for (const item of plan.items) {
    const id =
      item.type === "door" || item.type === "window"
        ? wallToLayer.get(item.hostId)
        : (item.layerId ?? defaultLayer.id);
    const index = id === undefined ? undefined : idToLayer.get(id);
    if (index !== undefined && plan.layers[index].visible)
      byLayer[index].push(item);
  }
  const items = byLayer.flat();
  return items.length === plan.items.length &&
    items.every((item, i) => item === plan.items[i])
    ? plan
    : { ...plan, items };
}

export function placeOnActiveLayer<T extends Item>(plan: Plan, item: T): T {
  const layer = activeLayer(plan);
  if (!layer.visible || layer.locked)
    throw Error("Choose a visible, unlocked layer to place objects.");
  if (item.type === "door" || item.type === "window") return item;
  return layer.id === defaultLayer.id ? item : { ...item, layerId: layer.id };
}

export function moveToLayer(plan: Plan, ids: string[], target: string): Plan {
  const layer = drawingLayers(plan).find((entry) => entry.id === target);
  if (!layer?.visible || layer.locked)
    throw Error("Choose a visible, unlocked destination layer.");
  const selected = new Set(ids);
  return {
    ...plan,
    items: plan.items.map((item) => {
      if (
        !selected.has(item.id) ||
        itemLayerId(plan, item) === target ||
        item.type === "door" ||
        item.type === "window" ||
        isEditProtected(plan, item)
      )
        return item;
      return { ...item, layerId: target };
    }),
  };
}

export function deleteLayer(plan: Plan, id: string): Plan {
  if (id === defaultLayer.id)
    throw Error("The Default layer remains in every drawing.");
  if (drawingLayers(plan).find((layer) => layer.id === id)?.locked)
    throw Error("Unlock the layer before removing it.");
  return {
    ...plan,
    activeLayerId:
      plan.activeLayerId === id ? defaultLayer.id : plan.activeLayerId,
    layers: drawingLayers(plan).filter((layer) => layer.id !== id),
    items: plan.items.map((item) =>
      item.layerId === id ? { ...item, layerId: defaultLayer.id } : item,
    ),
  };
}

/** Changes to an attached object may be indirect, for example when its wall moves. */
export function blockedDrawingEdit(
  before: Plan,
  after: Plan,
): Item | undefined {
  const next = new Map(after.items.map((item) => [item.id, item]));
  return before.items.find((item) => {
    if (!isEditProtected(before, item)) return false;
    const updated = next.get(item.id);
    if (!updated) return true;
    if (updated !== item) {
      const mayUnlock =
        item.locked &&
        updated.locked === false &&
        isLayerVisible(before, item) &&
        !isLayerLocked(before, item);
      if (
        JSON.stringify(mayUnlock ? { ...item, locked: false } : item) !==
        JSON.stringify(updated)
      )
        return true;
    }
    if (item.type === "door" || item.type === "window") {
      const host = before.items.find((entry) => entry.id === item.hostId);
      const updatedHost = next.get(item.hostId);
      return (
        host?.type === "wall" &&
        updatedHost?.type === "wall" &&
        (host.a.x !== updatedHost.a.x ||
          host.a.y !== updatedHost.a.y ||
          host.b.x !== updatedHost.b.x ||
          host.b.y !== updatedHost.b.y ||
          host.thickness !== updatedHost.thickness)
      );
    }
    return false;
  });
}
