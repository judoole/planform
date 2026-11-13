import { describe, expect, it } from "vitest";
import { applyCommands } from "../src/commands";
import {
  blockedDrawingEdit,
  defaultLayer,
  deleteLayer,
  moveToLayer,
  visiblePlan,
} from "../src/layers";
import {
  emptyPlan,
  groupItems,
  setCorner,
  ungroupItems,
  type Plan,
} from "../src/model";
import { addProposal, activePlan } from "../src/project";
import { renderPlanSvg } from "../src/preview";
import {
  readProject,
  readProjectFile,
  validateProject,
} from "../src/validation";

const plan = (): Plan => ({
  ...emptyPlan(),
  layers: [
    defaultLayer,
    { id: "reference", name: "Reference", visible: true, locked: false },
  ],
  activeLayerId: "reference",
  items: [
    {
      type: "wall",
      id: "wall",
      name: "Wall",
      a: { x: 0, y: 0 },
      b: { x: 300, y: 0 },
      thickness: 20,
      layerId: "reference",
    },
    {
      type: "wall",
      id: "other",
      name: "Other",
      a: { x: 300, y: 0 },
      b: { x: 300, y: 300 },
      thickness: 20,
    },
    {
      type: "door",
      id: "door",
      name: "Door",
      hostId: "wall",
      t: 0.5,
      width: 80,
      hinge: 1,
      swing: 1,
    },
    {
      type: "text",
      id: "label-a",
      name: "Reference label",
      text: "Reference label",
      x: 40,
      y: 40,
      w: 150,
      h: 28,
      rotation: 0,
      fontSize: 18,
      layerId: "reference",
    },
    {
      type: "text",
      id: "label-b",
      name: "Note",
      text: "Note",
      x: 60,
      y: 50,
      w: 100,
      h: 28,
      rotation: 0,
      fontSize: 18,
      layerId: "reference",
    },
  ],
});

describe("Drawing layers", () => {
  it("hides a wall and its opening from the same editor and export projection", () => {
    const initial = plan();
    initial.layers![1] = { ...initial.layers![1], visible: false };
    const restored = readProject(JSON.stringify(initial));
    expect(restored).toEqual(initial);
    expect(visiblePlan(restored).items.map(({ id }) => id)).toEqual(["other"]);
    const svg = renderPlanSvg(restored);
    expect(svg).not.toContain("Reference label");
    expect(svg.match(/data-item-type="wall"/g)).toHaveLength(1);
    expect(svg).not.toContain('data-item-type="door"');
    expect(visiblePlan(restored).items[0]).toBe(restored.items[1]);
  });

  it("draws layers in order and prevents a connected wall from changing a locked layer", () => {
    const initial = plan();
    expect(visiblePlan(initial).items.map(({ id }) => id)).toEqual([
      "other",
      "wall",
      "door",
      "label-a",
      "label-b",
    ]);
    initial.layers![1] = { ...initial.layers![1], locked: true };
    expect(
      blockedDrawingEdit(
        initial,
        setCorner(initial, "other", "a", { x: 400, y: 0 }),
      )?.id,
    ).toBe("wall");
    expect(() =>
      applyCommands(initial, {
        format: "planform-commands",
        version: 1,
        operations: [
          { op: "corner", wallId: "other", end: "a", point: { x: 400, y: 0 } },
        ],
      }),
    ).toThrow("locked");
  });

  it("retains symbol groups and hosted openings when moving or deleting their layer", () => {
    const grouped = groupItems(plan(), ["label-a", "label-b"]);
    const group = grouped.items.find((item) => item.type === "group");
    if (!group || group.type !== "group") throw Error("Expected a group.");
    expect(group.layerId).toBe("reference");
    expect(group.children!.every((item) => !item.layerId)).toBe(true);
    const moved = moveToLayer(grouped, ["wall"], defaultLayer.id);
    expect(moved.items.find((item) => item.id === "door")).toEqual(
      grouped.items[2],
    );
    const reassigned = deleteLayer(moved, "reference");
    expect(reassigned.activeLayerId).toBe(defaultLayer.id);
    expect(
      validateProject(ungroupItems(reassigned, group.id)).items,
    ).toHaveLength(5);
  });

  it("rejects bad layer relations while preserving a legacy drawing and cloning layer data in proposals", () => {
    const initial = plan();
    const { layers: _layers, activeLayerId: _active, ...unlayered } = initial;
    const legacy = {
      ...unlayered,
      version: 1,
      items: unlayered.items.map(({ layerId: _id, ...item }) => item),
    };
    const migrated = readProject(JSON.stringify(legacy));
    expect(migrated.items).toEqual(legacy.items);
    expect(visiblePlan(migrated)).toBe(migrated);
    expect(() =>
      validateProject({ ...initial, activeLayerId: "missing" }),
    ).toThrow("existing layer");
    expect(() =>
      validateProject({ ...initial, layers: [defaultLayer, defaultLayer] }),
    ).toThrow("unique");
    const project = addProposal(initial, initial, "option");
    activePlan(project).layers![1].visible = false;
    expect(project.drawings[0].plan.layers![1].visible).toBe(true);
    expect(readProjectFile(JSON.stringify(project))).toEqual(project);
  });
});
