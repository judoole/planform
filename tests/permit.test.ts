import { drawingPdfOptions, drawingPdfPages } from "../src/drawingPdfPages";
import { describe, expect, it } from "vitest";
import { splitWall } from "../src/junctions";
import { garageViews, garageViewSheet } from "../src/garageViews";
import { sitePlanSheet } from "../src/garageSite";
import {
  nearestSiteDistance,
  siteDistances,
  siteGarageGeometry,
} from "../src/siteMap";
import { garageAreas, garageAreaReport } from "../src/garage";
import { emptyPlan, type Plan, type Wall } from "../src/model";
import { floorPlanSheet } from "../src/planSheet";
import { layoutSheet, defaultSheetOptions, sheetPreview } from "../src/sheets";
import { applyCommands } from "../src/commands";
import { adoptLegacyGarageMeasurements } from "../src/legacyGarage";
import { validateProject } from "../src/validation";

function garage() {
  const points = [
    { x: 10, y: 10 },
    { x: 590, y: 10 },
    { x: 590, y: 690 },
    { x: 10, y: 690 },
  ];
  return {
    ...emptyPlan(),
    name: "6 × 7 m garage",
    showExteriorDimensions: true,
    garage: {
      area: {
        clearFloor: true,
        loft: false,
        overhang: false,
        otherArea: false,
      },
    },
    items: points.map((a, i): Wall => ({
      id: `wall-${i}`,
      name: `Wall ${i + 1}`,
      type: "wall",
      a,
      b: points[(i + 1) % 4],
      thickness: 20,
    })),
  };
}

describe("garage areas", () => {
  it("computes interior and exterior face areas independently of annotations", () => {
    const plan = validateProject({
      ...garage(),
      showExteriorDimensions: false,
    });
    const { bra, bya } = garageAreas(plan);
    expect(bra).toEqual({ value: 36.96, notes: [] });
    expect(bya).toEqual({ value: 42, notes: [] });
    const walls = plan.items as Wall[];
    const edited = {
      ...plan,
      items: walls.map((wall) => ({ ...wall, thickness: 30 })),
    };
    expect(garageAreas(edited).bya.value).toBe(43.31);
    expect(garageAreaReport(edited)).toContain("BYA: 43.31 m²");
  });

  it("keeps the footprint and both areas after splitting a straight garage wall", () => {
    const original = garage();
    const split = splitWall(
      original,
      "wall-0",
      290,
      "half-wall",
      "split-point",
    );
    expect(garageAreas(split).bra.value).toBe(36.96);
    expect(garageAreas(split).bya.value).toBe(42);
    expect(garageAreas(split).footprint.wallIds[0]).toEqual([
      "wall-0",
      "half-wall",
    ]);
  });

  it("labels partial results separately and rejects unsupported footprints", () => {
    const plan = garage();
    plan.garage.area.loft = true;
    expect(garageAreaReport(plan)).toContain("BRA: 36.96 m² (provisional)");
    expect(garageAreaReport(plan)).not.toContain("BYA: 42.00 m² (provisional)");
    expect(() =>
      garageAreas({ ...plan, items: plan.items.slice(0, -1) }),
    ).toThrow("closed rectangular outline");
  });
});

describe("scaled sheets", () => {
  it("layouts true-scale physical sizes and keeps all three main sheet formats useful", () => {
    const drawing = {
      title: "Segment",
      bounds: { x: 0, y: 0, w: 500, h: 20 },
      markup: "",
    };
    for (const paper of ["A4", "A3"] as const) {
      for (const orientation of ["portrait", "landscape"] as const) {
        const sheet = layoutSheet(drawing, {
          paper,
          orientation,
          scale: 50,
          name: "Test",
        });
        expect(sheet.w).toBe(100);
        expect(sheet.width).toBe(
          orientation === "portrait"
            ? paper === "A4"
              ? 210
              : 297
            : paper === "A4"
              ? 297
              : 420,
        );
      }
    }
    expect(
      layoutSheet(drawing, { ...defaultSheetOptions, name: "Test", scale: 100 })
        .w,
    ).toBe(50);
    expect(
      layoutSheet(drawing, { ...defaultSheetOptions, name: "Test", scale: 500 })
        .w,
    ).toBe(10);
  });

  it("exports an uncalibrated sketch fitted to paper without a scale claim", () => {
    const plan = garage();
    plan.calibration.calibrated = false;
    const drawing = floorPlanSheet(plan, { fit: true });
    const options = {
      ...defaultSheetOptions,
      name: "Sketch",
      scale: "fit",
    } as const;
    const page = layoutSheet(drawing, options);
    expect(page.h).toBeCloseTo(165);
    expect(page.barWidth).toBe(0);
    expect(drawing.markup).not.toContain("Set scale");
    expect(sheetPreview(drawing, options)).toContain("Sketch - Not to scale");
    expect(sheetPreview(drawing, options)).not.toContain("Print at 100%");
  });

  it("reports calibration or fit problems before export and reuses the renderer", () => {
    const plan = garage();
    const drawing = floorPlanSheet(plan);
    expect(drawing.markup).toContain("6.00 m");
    expect(drawing.markup).toContain("7.00 m");
    expect(drawing.markup).not.toContain("data-hit");
    expect(() =>
      floorPlanSheet({
        ...plan,
        calibration: { ...plan.calibration, calibrated: false },
      }),
    ).toThrow("Calibrate");
    expect(() =>
      layoutSheet(
        { ...drawing, bounds: { ...drawing.bounds, w: 10000 } },
        { ...defaultSheetOptions, name: plan.name },
      ),
    ).toThrow("Choose larger paper");
  });
});

describe("permit deliverables share the edited garage", () => {
  function fittedGarage() {
    const plan: Plan = garage();
    const terrain = Object.fromEntries(
      garageViews.map((view) => [
        view,
        {
          existing: [
            { x: 0, y: 5 },
            { x: 900, y: -20 },
          ],
          proposed: [
            { x: 0, y: 16 },
            { x: 900, y: -8 },
          ],
        },
      ]),
    );
    plan.building = {
      floorLevel: 30,
      defaultWallHeight: 245,
      roof: { type: "gable", pitch: 28, thickness: 24, direction: 90 },
    };
    plan.garage = {
      ...plan.garage,
      permit: {
        propertyId: "Gnr. 12, bnr. 34",
        description: "Detached garage",
        separate: {
          applicationForm: "supplied",
          dispensation: "notApplicable",
        },
      },
      structure: { terrain },
      site: {
        map: {
          name: "Municipal map",
          dataUrl: "data:image/png;base64,placeholder",
          width: 600,
          height: 450,
          page: 2,
        },
        calibration: {
          a: { x: 35, y: 405 },
          b: { x: 235, y: 405 },
          distanceM: 20,
        },
        placement: { center: { x: 300, y: 220 }, rotation: 0 },
        northDegrees: 12,
        features: [
          {
            name: "West boundary",
            kind: "boundary",
            points: [
              { x: 145, y: 140 },
              { x: 145, y: 350 },
            ],
          },
        ],
      },
    };
    return plan;
  }
  it("moves the footprint and shortest feature distances without affecting floor calibration", () => {
    const plan = fittedGarage();
    const site = plan.garage!.site!;
    const geometry = siteGarageGeometry(plan, site);
    expect(geometry.corners).toEqual([
      { x: 270, y: 185 },
      { x: 330, y: 185 },
      { x: 330, y: 255 },
      { x: 270, y: 255 },
    ]);
    expect(
      siteDistances(geometry.corners, site.features, geometry.scale)[0]
        .distanceM,
    ).toBe(12.5);
    const rotated = siteGarageGeometry(plan, {
      ...site,
      placement: { ...site.placement!, rotation: 90 },
    });
    expect(
      siteDistances(rotated.corners, site.features, rotated.scale)[0].distanceM,
    ).toBe(12);
    expect(
      nearestSiteDistance(geometry.corners, [
        { x: 280, y: 200 },
        { x: 290, y: 200 },
      ])?.distance,
    ).toBe(0);
    expect(garageAreas(plan).bya.value).toBe(42);
    const uncalibrated = {
      ...plan,
      garage: { ...plan.garage, site: { ...site, calibration: undefined } },
    };
    expect(() => sitePlanSheet(uncalibrated, "12/34")).toThrow(
      "Calibrate the site map",
    );
  });
  it("includes ready pages and keeps site scale independent of drawing scale", () => {
    const garage = fittedGarage();
    const ready = drawingPdfPages(garage);
    expect(ready.canRender3D).toBe(true);
    expect(ready.pages.map((page) => page.id)).toEqual([
      "plan",
      "section",
      "front",
      "right",
      "rear",
      "left",
      "site",
      "area",
    ]);
    const options = { ...defaultSheetOptions, name: "Example" };
    expect(drawingPdfOptions(ready.pages[0], options, true).scale).toBe(100);
    expect(
      drawingPdfOptions(
        ready.pages.find((page) => page.id === "site")!,
        options,
        true,
      ).scale,
    ).toBe(500);
    const uncalibrated = {
      ...garage,
      calibration: { ...garage.calibration, calibrated: false },
    };
    expect(drawingPdfPages(uncalibrated)).toMatchObject({
      canRender3D: false,
      pages: [{ id: "plan" }],
    });
  });

  it("updates the additional drawing sheets from the edited building", () => {
    const plan = fittedGarage();
    expect(garageViews.map((view) => garageViewSheet(plan, view))).toHaveLength(
      5,
    );
    expect(
      sitePlanSheet(plan, "").legend?.some((item) =>
        item.startsWith("Property:"),
      ),
    ).toBe(false);
    expect(sitePlanSheet(plan, "12/34").legend).toContain("Property: 12/34");
    const building = plan.building!;
    expect(garageViewSheet(plan, "section").markup).toContain("Roof pitch 28");
    const edited = {
      ...plan,
      building: { ...building, roof: { ...building.roof!, pitch: 32 } },
    };
    expect(garageViewSheet(edited, "section").markup).toContain(
      "Roof pitch 32",
    );
  });
});

it("adopts earlier permit drafts and keeps an explicitly cleared roof cleared", () => {
  const plan = garage();
  const legacy: Plan = {
    ...plan,
    garage: {
      ...plan.garage,
      structure: {
        floor: 30,
        wallHeight: 245,
        roofPitch: 28,
        roofThickness: 24,
        openings: { door: { height: 220 } },
      },
    },
    items: [
      ...plan.items,
      {
        id: "door",
        name: "Door",
        type: "door",
        hostId: "wall-0",
        width: 250,
        t: 0.5,
        hinge: 1,
        swing: 1,
      },
    ],
  };
  const migrated = validateProject(legacy);
  expect(migrated.building).toEqual({
    floorLevel: 30,
    defaultWallHeight: 245,
    roof: { type: "gable", pitch: 28, thickness: 24, direction: 90 },
  });
  expect(migrated.items.at(-1)).toMatchObject({ height: 220 });
  expect(migrated.garage).toEqual(legacy.garage);
  expect(
    adoptLegacyGarageMeasurements({ ...migrated, building: {} }).building,
  ).toEqual({});
  const cleared = applyCommands(migrated, {
    format: "planform-commands",
    version: 1,
    operations: [{ op: "setBuilding", building: null }],
  }).plan;
  expect(validateProject(cleared).building?.roof).toBeUndefined();
  expect(legacy.building).toBeUndefined();
});
