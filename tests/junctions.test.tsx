import { describe, expect, it } from "vitest";
import { applyCommands } from "../src/commands";
import { joinWalls, splitWall } from "../src/junctions";
import {
  History,
  calibrate,
  duplicateItems,
  emptyPlan,
  openingFrame,
  setCorner,
  type Opening,
  type Wall,
} from "../src/model";
import { renderPlanSvg } from "../src/preview";
import { readProject, validateProject } from "../src/validation";

const wall: Wall = {
  id: "north",
  name: "North",
  type: "wall",
  a: { x: 0, y: 0 },
  b: { x: 600, y: 0 },
  thickness: 20,
};
const side: Wall = {
  ...wall,
  id: "side",
  name: "Side",
  a: { x: 300, y: 200 },
  b: { x: 300, y: 0 },
  thickness: 12,
};
const door: Opening = {
  id: "door",
  name: "Door",
  type: "door",
  hostId: wall.id,
  t: 0.2,
  width: 90,
  hinge: 1,
  swing: 1,
};
const windowItem: Opening = {
  ...door,
  id: "window",
  name: "Window",
  type: "window",
  t: 0.8,
  width: 100,
};
const sample = () => ({
  ...emptyPlan(),
  items: structuredClone([wall, door, windowItem]),
});
const lookupWall = (items: ReturnType<typeof emptyPlan>["items"], id: string) =>
  items.find((item) => item.id === id) as Wall;
const lookupOpening = (
  items: ReturnType<typeof emptyPlan>["items"],
  id: string,
) => items.find((item) => item.id === id) as Opening;

describe("wall junctions", () => {
  it("splits without moving hosted openings, keeps exact endpoints and round trips", () => {
    const plan = sample();
    const output = splitWall(plan, wall.id, 320, "second", "joint");
    const reopened = readProject(JSON.stringify(output));
    const first = lookupWall(reopened.items, wall.id);
    const second = lookupWall(reopened.items, "second");
    expect(first.a).toEqual(wall.a);
    expect(second.b).toEqual(wall.b);
    expect(first.b).toEqual(second.a);
    expect(first.junctions?.b).toBe(second.junctions?.a);
    expect(lookupOpening(reopened.items, door.id).hostId).toBe(first.id);
    expect(lookupOpening(reopened.items, windowItem.id).hostId).toBe(second.id);
    for (const opening of [door, windowItem]) {
      const result = lookupOpening(reopened.items, opening.id);
      expect(result.width).toBe(opening.width);
      expect(openingFrame(result, reopened.items)?.center.x).toBeCloseTo(
        opening.t * 600,
        10,
      );
    }
    expect(plan).toEqual(sample());
  });

  it("rejects a split through an opening without changing the document", () => {
    const plan = sample();
    expect(() => splitWall(plan, wall.id, 120, "second", "joint")).toThrow(
      'passes through "Door"',
    );
    expect(plan).toEqual(sample());
  });

  it("joins and moves a mixed-thickness T with stable identity, undo and drawing output", () => {
    const plan = { ...sample(), items: [...sample().items, side] };
    const history = new History();
    history.push(plan);
    const joined = joinWalls(plan, side.id, "b", wall.id, 300, "second", "tee");
    const moved = setCorner(joined, side.id, "b", { x: 320, y: 16 });
    expect(lookupWall(moved.items, wall.id).b).toEqual({ x: 320, y: 16 });
    expect(lookupWall(moved.items, "second").a).toEqual({ x: 320, y: 16 });
    expect(lookupWall(moved.items, side.id).junctions?.b).toBe("tee");
    expect(lookupWall(moved.items, wall.id).junctions?.b).toBe("tee");
    expect(lookupWall(moved.items, "second").junctions?.a).toBe("tee");
    expect(renderPlanSvg(moved)).toContain('r="10"');
    expect(history.undo(joined)).toBe(plan);
    expect(history.redo(plan)).toBe(joined);
    const calibrated = calibrate(moved, 100, 200);
    expect(validateProject(calibrated)).toEqual(calibrated);
    const duplicated = duplicateItems(calibrated, [
      wall.id,
      "second",
      side.id,
    ]).plan;
    expect(validateProject(duplicated)).toEqual(duplicated);
    expect(duplicated.items.slice(0, 3)).toEqual(calibrated.items.slice(0, 3));
  });

  it("uses the same operations for CLI batches and rejects inconsistent junctions", () => {
    const plan = { ...sample(), items: [...sample().items, side] };
    const result = applyCommands(plan, {
      format: "planform-commands",
      version: 1,
      operations: [
        {
          op: "joinWalls",
          sourceWallId: side.id,
          sourceEnd: "b",
          targetWallId: wall.id,
          targetOffset: 300,
          segmentId: "second",
          junctionId: "tee",
        },
        { op: "corner", wallId: side.id, end: "b", point: { x: 310, y: 15 } },
      ],
    });
    expect(result.changedIds).toEqual(
      expect.arrayContaining([
        side.id,
        wall.id,
        "second",
        door.id,
        windowItem.id,
      ]),
    );
    const invalid = structuredClone(result.plan);
    lookupWall(invalid.items, "second").a.x += 0.01;
    expect(() => validateProject(invalid)).toThrow(
      "identical endpoint coordinates",
    );
  });
});
