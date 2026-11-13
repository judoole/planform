import { describe, expect, it } from "vitest";
import example from "../public/agent/example.planform.json";
import {
  buildingGeometry,
  DEFAULT_ROOF_THICKNESS,
  openingVertical,
  roofHeightAt,
  wallHeight,
  wallTopAt,
} from "../src/building";
import { applyCommands } from "../src/commands";
import {
  calibrate,
  emptyPlan,
  rotate,
  serialize,
  type Opening,
  type Plan,
  type Wall,
} from "../src/model";
import {
  projectWarnings,
  readProject,
  validateProject,
} from "../src/validation";

function garage(): Plan {
  const corners = [
    { x: 10, y: 10 },
    { x: 590, y: 10 },
    { x: 590, y: 690 },
    { x: 10, y: 690 },
  ];
  return {
    ...emptyPlan(),
    items: corners.map((a, index): Wall => ({
      id: `wall-${index}`,
      name: `Wall ${index + 1}`,
      type: "wall",
      a,
      b: corners[(index + 1) % corners.length],
      thickness: 20,
    })),
  };
}

describe("building geometry", () => {
  it("reuses the exterior wall faces of a house with partitions and split perimeter walls", () => {
    const plan = validateProject(example);
    plan.building = { roof: { type: "gable", pitch: 30 } };
    const geometry = buildingGeometry(plan);
    expect(geometry.issues).toEqual([]);
    expect(geometry.footprint?.corners).toEqual([
      { x: -10, y: -10 },
      { x: 1010, y: -10 },
      { x: 1010, y: 810 },
      { x: -10, y: 810 },
    ]);
    expect(geometry.footprint?.edgeWallIds[0]).toEqual([
      "north-living",
      "north-bedroom",
    ]);
    expect(geometry.walls.filter((wall) => !wall.exterior)).toHaveLength(3);
    expect(geometry.roof?.facets).toHaveLength(2);
    const [ridgeA, ridgeB] = geometry.roof!.ridge!;
    expect(ridgeA.x).toBeCloseTo(-10);
    expect(ridgeB.x).toBeCloseTo(1010);
    expect(ridgeA.y).toBeCloseTo(400);
    expect(ridgeB.y).toBeCloseTo(400);
  });

  it("uses the outside span, pitch and roof type to compute a common 3D section datum", () => {
    const plan = garage();
    plan.building = {
      floorLevel: 35,
      defaultWallHeight: 250,
      roof: { type: "gable", direction: 90, pitch: 45 },
    };
    const result = buildingGeometry(plan);
    const roof = result.roof!;
    expect(roof.base).toBe(285);
    expect(roof.footprint).toEqual([
      { x: 0, y: 0 },
      { x: 600, y: 0 },
      { x: 600, y: 700 },
      { x: 0, y: 700 },
    ]);
    expect(roof.ridge?.[0].x).toBeCloseTo(300);
    expect(roof.ridge?.[1].y).toBeCloseTo(700);
    expect(roofHeightAt(roof, { x: 300, y: 350 })).toBeCloseTo(585);
    expect(roofHeightAt(roof, { x: 300, y: 350 }, "top")).toBeCloseTo(
      585 + DEFAULT_ROOF_THICKNESS * Math.sqrt(2),
    );
    expect(wallTopAt(result.walls[0], { x: 300, y: 0 }, roof)).toBeCloseTo(585);

    plan.building.roof = { type: "shed", direction: 90, pitch: 45 };
    const shed = buildingGeometry(plan).roof!;
    expect(shed.ridge).toBeUndefined();
    expect(roofHeightAt(shed, { x: 300, y: 0 })).toBeCloseTo(285);
    expect(roofHeightAt(shed, { x: 300, y: 700 })).toBeCloseTo(985);
    plan.building.roof = { type: "flat", pitch: 45 };
    const flat = buildingGeometry(plan).roof!;
    expect(flat.facets).toHaveLength(1);
    expect(roofHeightAt(flat, { x: 300, y: 700 }, "top")).toBe(309);
  });

  it("matches rotated shell faces after reordering or reversing wall endpoints", () => {
    const plan = garage();
    const angle = 26;
    plan.items = (plan.items as Wall[]).reverse().map((wall) => ({
      ...wall,
      a: rotate(wall.b, angle),
      b: rotate(wall.a, angle),
    }));
    plan.building = {
      roof: { type: "gable", direction: angle + 90, pitch: 45 },
    };
    const building = buildingGeometry(plan);
    const roof = building.roof!;
    expect(building.issues).toEqual([]);
    for (const wall of building.walls) expect(wall.exterior).toBe(true);
    expect(roof.ridge?.[0].z).toBeCloseTo(540);
  });

  it("keeps walls available for open or unsupported roof geometry and detects unconfirmed scale", () => {
    const plan = garage();
    plan.building = { roof: { type: "gable" } };
    plan.items.pop();
    const open = buildingGeometry(plan);
    expect(open.roof).toBeUndefined();
    expect(open.walls).toHaveLength(3);
    expect(open.issues[0].code).toBe("unsupported_roof_footprint");

    plan.calibration.calibrated = false;
    expect(buildingGeometry(plan).walls).toEqual([]);
    expect(buildingGeometry(plan).issues[0].code).toBe("uncalibrated");
  });

  it("retains a low wall override and infills only exterior walls at the roof base", () => {
    const plan = garage();
    plan.building = { roof: { type: "shed", direction: 0, pitch: 35 } };
    (plan.items[1] as Wall).height = 220;
    const result = buildingGeometry(plan);
    expect(result.issues[0].code).toBe("uneven_wall_heights");
    expect(wallTopAt(result.walls[1], { x: 600, y: 350 }, result.roof)).toBe(
      220,
    );
    expect(
      wallTopAt(result.walls[0], { x: 600, y: 0 }, result.roof),
    ).toBeGreaterThan(500);
  });
});

describe("building model files and commands", () => {
  it("inherits wall defaults, retains an opening that no longer fits and supports resetting overrides", () => {
    const operations = [
      {
        op: "setBuilding",
        building: {
          defaultWallHeight: 185,
          floorLevel: 30,
          roof: { type: "flat" },
        },
      },
      { op: "update", id: "wall-3", changes: { height: 260 } },
      {
        op: "opening",
        id: "window",
        name: "Window",
        type: "window",
        hostId: "wall-0",
        offset: 125,
        width: 110,
        height: 150,
        sill: 65,
      },
      { op: "update", id: "window", changes: { height: 145 } },
    ];
    const original = garage();
    const run = (plan: Plan, operations: unknown[]) =>
      applyCommands(plan, {
        format: "planform-commands",
        version: 1,
        operations,
      }).plan;
    const saved = run(original, operations);
    expect(original.building).toBeUndefined();
    const plan = readProject(serialize(saved));
    const opening = plan.items[4] as Opening;
    expect(openingVertical(plan, opening)).toEqual({
      sill: 65,
      height: 145,
      bottom: 95,
      top: 240,
      fits: false,
    });
    expect(buildingGeometry(plan).issues).toContainEqual(
      expect.objectContaining({
        code: "opening_above_wall",
        itemId: opening.id,
      }),
    );
    expect(projectWarnings(plan)).toContain(
      "Window rises above Wall 1. Adjust its sill or height, or raise the wall.",
    );
    expect(wallHeight(plan, plan.items[3] as Wall)).toBe(260);

    const reset = run(plan, [
      { op: "update", id: "wall-3", changes: { height: null } },
      { op: "update", id: "window", changes: { height: null, sill: null } },
      { op: "setBuilding", building: null },
    ]);
    expect(reset.building).toBeUndefined();
    expect(wallHeight(reset, reset.items[3] as Wall)).toBe(240);
    expect(openingVertical(reset, reset.items[4] as Opening)).toEqual({
      sill: 90,
      height: 100,
      bottom: 90,
      top: 190,
      fits: true,
    });
  });

  it("calibrates the footprint without rescaling vertical measurements", () => {
    const plan = garage();
    plan.building = {
      floorLevel: 25,
      defaultWallHeight: 280,
      roof: { type: "flat", thickness: 35 },
    };
    (plan.items[0] as Wall).height = 250;
    const result = calibrate(plan, 100, 200);
    expect(result.building).toEqual(plan.building);
    expect((result.items[0] as Wall).height).toBe(250);
    expect((result.items[0] as Wall).b.x).toBe(1180);
    expect(buildingGeometry(result).roof?.base).toBe(305);
  });
});
