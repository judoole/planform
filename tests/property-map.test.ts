import { describe, expect, it } from "vitest";
import { drawingPdfOptions, drawingPdfPages } from "../src/drawingPdfPages";
import { dist, emptyPlan, type Wall } from "../src/model";
import { applyCommands } from "../src/commands";
import {
  boundaryMeasurement,
  groundScale,
  mapFootprint,
  placedFootprint,
  projectLocation,
  type PropertyMap,
} from "../src/propertyMap";
import { defaultSheetOptions, layoutSheet } from "../src/sheets";
import { validateProject } from "../src/validation";

const location = { lon: 11.3, lat: 63.75 };
const map: PropertyMap = {
  property: { number: "5037-315/204", label: "Test property", location },
  placement: { center: location, rotation: 37 },
};

function drawing() {
  const corners = [
    { x: 10, y: 10 },
    { x: 590, y: 10 },
    { x: 590, y: 690 },
    { x: 10, y: 690 },
  ];
  return {
    ...emptyPlan(),
    propertyMap: map,
    items: corners.map((a, i): Wall => ({
      id: `wall-${i}`,
      name: `Wall ${i + 1}`,
      type: "wall",
      a,
      b: corners[(i + 1) % 4],
      thickness: 20,
    })),
  };
}

describe("Property map", () => {
  it("preserves ground dimensions and boundary measurements after projection", () => {
    const corners = placedFootprint(mapFootprint(drawing())!, map.placement!);
    const origin = projectLocation(location);
    const scale = groundScale(location);
    const toGround = (point: { x: number; y: number }) => ({
      x: (point.x - origin.x) * scale.x,
      y: (point.y - origin.y) * scale.y,
    });
    expect(dist(toGround(corners[0]), toGround(corners[1]))).toBeCloseTo(6, 7);
    expect(dist(toGround(corners[1]), toGround(corners[2]))).toBeCloseTo(7, 7);
    const edge = Math.max(...corners.map((p) => p.x)) + 4 / scale.x;
    const ring = [
      { x: edge - 50, y: origin.y - 50 },
      { x: edge, y: origin.y - 50 },
      { x: edge, y: origin.y + 50 },
      { x: edge - 50, y: origin.y + 50 },
      { x: edge - 50, y: origin.y - 50 },
    ];
    expect(
      boundaryMeasurement(
        corners,
        [{ number: map.property.number, rings: [ring] }],
        location,
      )?.label,
    ).toBe("4.0 m to mapped boundary");
    expect(boundaryMeasurement(corners, [], location)).toBeUndefined();
  });

  it("retains placement through agent edits and uses the map's own sheet scale", () => {
    const { plan } = applyCommands(drawing(), {
      format: "planform-commands",
      version: 1,
      operations: [
        { op: "corner", wallId: "wall-0", end: "b", point: { x: 690, y: 10 } },
        { op: "corner", wallId: "wall-1", end: "b", point: { x: 690, y: 690 } },
      ],
    });
    expect(plan.propertyMap).toEqual(map);
    expect(mapFootprint(plan)?.width).toBe(7);
    const page = drawingPdfPages(plan).pages.find(
      ({ id }) => id === "property-map",
    )!;
    const options = drawingPdfOptions(
      page,
      { ...defaultSheetOptions, name: "Test", scale: 100 },
      true,
    );
    expect(options.scale).toBe(500);
    expect(layoutSheet(page.drawing, options).barWidth).toBe(40);
    expect(page.drawing.legend).toContain(
      "Selected parcel boundary unavailable.",
    );
    expect(page.drawing.markup).not.toContain("<image");
  });

  it("rejects invalid coordinates and rotation without repairing the input", () => {
    const invalid = drawing();
    invalid.propertyMap = {
      ...map,
      placement: { center: { ...location, lat: 90 }, rotation: 360 },
    };
    expect(() => validateProject(invalid)).toThrow(/propertyMap\/placement/);
    expect(invalid.propertyMap.placement?.rotation).toBe(360);
  });
});
