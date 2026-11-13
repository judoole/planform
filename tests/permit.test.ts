import { describe, expect, it } from "vitest";
import { garageAreas, garageAreaReport } from "../src/garage";
import { emptyPlan, type Wall } from "../src/model";
import { floorPlanSheet } from "../src/planSheet";
import { layoutSheet, defaultSheetOptions } from "../src/sheets";
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

  it("labels partial results separately and rejects unsupported footprints", () => {
    const plan = garage();
    plan.garage.area.loft = true;
    expect(garageAreaReport(plan)).toContain("BRA: 36.96 m² (provisional)");
    expect(garageAreaReport(plan)).not.toContain("BYA: 42.00 m² (provisional)");
    expect(() =>
      garageAreas({ ...plan, items: plan.items.slice(0, -1) }),
    ).toThrow("closed rectangular wall loop");
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
