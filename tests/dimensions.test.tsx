import { describe, expect, it } from "vitest";
import { applyCommands } from "../src/commands";
import { dimensionEndpoints } from "../src/dimensions";
import { splitWall } from "../src/junctions";
import {
  History,
  calibrate,
  duplicateItems,
  emptyPlan,
  removeItems,
  setCorner,
  translate,
  type Dimension,
  type Opening,
  type Wall,
} from "../src/model";
import { renderPlanSvg } from "../src/preview";
import { readProject, validateProject } from "../src/validation";

const wall: Wall = {
  id: "wall",
  name: "Wall",
  type: "wall",
  a: { x: 0, y: 0 },
  b: { x: 600, y: 0 },
  thickness: 20,
};
const other: Wall = { ...wall, id: "other", a: wall.b, b: { x: 600, y: 400 } };
const windowItem: Opening = {
  id: "window",
  name: "Window",
  type: "window",
  hostId: wall.id,
  t: 0.75,
  width: 40,
  hinge: 1,
  swing: 1,
};
const dimension: Dimension = {
  id: "dim",
  name: "Width",
  type: "dimension",
  a: wall.a,
  b: wall.b,
  offset: -30,
  anchors: {
    a: { itemId: wall.id, point: "a" },
    b: { itemId: wall.id, point: "b" },
  },
};
const fixture = () => ({
  ...emptyPlan(),
  items: structuredClone([wall, other, windowItem, dimension]),
});

describe("attached dimensions", () => {
  it("follows shared geometry, retains offset and recalibrates using current points", () => {
    const moved = setCorner(fixture(), other.id, "a", { x: 700, y: 0 });
    expect(renderPlanSvg(moved)).toContain("700.0 cm");
    expect(moved.items[3]).toEqual(dimension);
    const calibrated = calibrate(moved, 700, 1400);
    expect(renderPlanSvg(calibrated)).toContain("1400.0 cm");
    expect(calibrated.items[3]).toMatchObject({
      anchors: dimension.anchors,
      offset: -60,
    });
    expect(readProject(JSON.stringify(calibrated))).toEqual(calibrated);
  });

  it("preserves the original wall endpoint when split and remaps duplicated anchors", () => {
    const split = splitWall(fixture(), wall.id, 300, "second", "junction");
    const dim = split.items.find((i) => i.id === dimension.id) as Dimension;
    expect(dim.anchors).toEqual({
      a: dimension.anchors?.a,
      b: { itemId: "second", point: "b" },
    });
    expect(dimensionEndpoints(dim, split.items)).toEqual({
      a: wall.a,
      b: wall.b,
    });
    const copy = duplicateItems(split, [wall.id, "second", dim.id]);
    const copied = copy.plan.items.find(
      (i) => i.id === copy.ids[2],
    ) as Dimension;
    expect(copied.anchors).toEqual({
      a: { itemId: copy.ids[0], point: "a" },
      b: { itemId: copy.ids[1], point: "b" },
    });
    expect(dimensionEndpoints(copied, copy.plan.items)).toEqual({
      a: { x: 30, y: 30 },
      b: { x: 630, y: 30 },
    });
    expect(copied.offset).toBe(dimension.offset);
    const isolated = duplicateItems(split, [dim.id]);
    const free = isolated.plan.items.find(
      (i) => i.id === isolated.ids[0],
    ) as Dimension;
    expect(free.anchors).toBeUndefined();
    expect(free.a).toEqual({ x: 30, y: 30 });
    expect(validateProject(copy.plan)).toEqual(copy.plan);
  });

  it("cascades deletions through hosted openings, keeps undo/redo and requires explicit CLI cascade", () => {
    const p = fixture();
    (p.items[3] as Dimension).anchors!.a = {
      itemId: windowItem.id,
      point: "center",
    };
    const history = new History();
    history.push(p);
    const deleted = removeItems(p, [wall.id]);
    expect(deleted.items.map((i) => i.id)).toEqual([other.id]);
    expect(history.undo(deleted)).toBe(p);
    expect(history.redo(p)).toBe(deleted);
    const commands = {
      format: "planform-commands",
      version: 1,
      operations: [{ op: "delete", ids: [wall.id], cascade: false }],
    };
    expect(() => applyCommands(p, commands)).toThrow("cascade");
    commands.operations[0].cascade = true;
    expect(applyCommands(p, commands)).toMatchObject({
      plan: deleted,
      deletedIds: [wall.id, windowItem.id, dimension.id],
    });
  });

  it("preserves legacy free points and rejects an invalid object reference", () => {
    const { anchors, ...independent } = dimension;
    const old = readProject(
      JSON.stringify({ ...emptyPlan(), version: 1, items: [independent] }),
    );
    expect(old.items).toEqual([independent]);
    expect(
      translate(old, [dimension.id], { x: 5, y: 7 }).items[0],
    ).toMatchObject({ a: { x: 5, y: 7 }, b: { x: 605, y: 7 } });
    expect(() => validateProject({ ...old, items: [dimension] })).toThrow(
      "top-level wall endpoint",
    );
  });
});
