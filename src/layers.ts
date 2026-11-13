import type { Box, Item, Plan } from "./model";

export type Layer = {
  id: string;
  name: string;
  visible: boolean;
  locked: boolean;
};

export type RenovationStatus = "existing" | "demolish" | "new";
export type RenovationView = "all" | "existing" | "demolition" | "proposed";

export const renovationStyles = {
  existing: {
    label: "Existing",
    fill: "#52645a",
    line: "#344b3f",
    opening: "#dfedf0",
  },
  demolish: {
    label: "To demolish",
    fill: "#f4d4ca",
    line: "#994126",
    opening: "#f5dbd4",
    dash: "5 3",
  },
  new: { label: "New", fill: "#287f94", line: "#125365", opening: "#d9ecf2" },
} satisfies Record<
  RenovationStatus,
  {
    label: string;
    fill: string;
    line: string;
    opening: string;
    dash?: string;
  }
>;

export const renovationViews: Record<
  RenovationView,
  { title: string; statuses: RenovationStatus[] }
> = {
  all: { title: "All objects", statuses: ["existing", "demolish", "new"] },
  existing: { title: "Existing", statuses: ["existing", "demolish"] },
  demolition: { title: "Demolition", statuses: ["existing", "demolish"] },
  proposed: { title: "Proposed", statuses: ["existing", "new"] },
};

export function renovationStatus(
  plan: Plan,
  item: Item,
): RenovationStatus | undefined {
  if (item.type === "wall") return item.renovationStatus ?? "existing";
  if (item.type === "door" || item.type === "window") {
    const host = plan.items.find((entry) => entry.id === item.hostId);
    return host?.type === "wall"
      ? (host.renovationStatus ?? "existing")
      : undefined;
  }
  return undefined;
}

function showRenovationStatus(
  view: RenovationView | undefined,
  status?: RenovationStatus,
): boolean {
  return !view || !status || renovationViews[view].statuses.includes(status);
}

export function phaseLegendStyles(plan: Plan) {
  if (
    !plan.renovationView &&
    !plan.items.some((item) => item.type === "wall" && item.renovationStatus)
  )
    return undefined;
  const view = renovationViews[plan.renovationView ?? "all"];
  return {
    title: `Renovation view: ${view.title}`,
    entries: (plan.renovationView === "existing"
      ? ["existing" as const]
      : view.statuses
    ).map((status) => renovationStyles[status]),
  };
}

export function drawRenovationStatus(
  plan: Plan,
  status?: RenovationStatus,
): RenovationStatus {
  return plan.renovationView === "existing"
    ? "existing"
    : (status ?? "existing");
}

export function phaseLegend(plan: Plan): string[] {
  const legend = phaseLegendStyles(plan);
  return legend
    ? [legend.title, ...legend.entries.map((entry) => entry.label)]
    : [];
}

export function legendLayout(plan: Plan, drawing: Box) {
  const labels = phaseLegend(plan);
  if (!labels.length) return undefined;
  const fontSize = 16;
  const w =
    Math.max(...labels.map((label) => label.length)) * fontSize * 0.68 +
    fontSize * 2.8;
  const h = labels.length * fontSize * 1.4;
  const x = drawing.x;
  const y = drawing.y + drawing.h + fontSize * 1.5;
  return { fontSize, x, y, bounds: { x, y, w, h } };
}

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
  return (
    !isLayerVisible(plan, item) ||
    !showRenovationStatus(plan.renovationView, renovationStatus(plan, item)) ||
    isItemLocked(plan, item)
  );
}

export function visiblePlan(plan: Plan): Plan {
  if (!plan.layers && !plan.renovationView) return plan;
  const layers = drawingLayers(plan);
  const idToLayer = new Map(layers.map((layer, i) => [layer.id, i]));
  const walls = new Map(
    plan.items
      .filter((item) => item.type === "wall")
      .map((wall) => [wall.id, wall]),
  );
  const byLayer: Item[][] = layers.map(() => []);
  for (const item of plan.items) {
    const wall =
      item.type === "wall"
        ? item
        : item.type === "door" || item.type === "window"
          ? walls.get(item.hostId)
          : undefined;
    const index = idToLayer.get((wall ?? item).layerId ?? defaultLayer.id);
    if (
      index !== undefined &&
      layers[index].visible &&
      showRenovationStatus(
        plan.renovationView,
        wall?.renovationStatus ?? "existing",
      )
    )
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
  const layered =
    layer.id === defaultLayer.id ? item : { ...item, layerId: layer.id };
  if (
    layered.type === "wall" &&
    plan.renovationView === "proposed" &&
    !layered.renovationStatus
  )
    return { ...layered, renovationStatus: "new" };
  return layered;
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
        showRenovationStatus(
          before.renovationView,
          renovationStatus(before, item),
        ) &&
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
