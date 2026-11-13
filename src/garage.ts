import type { GaragePermitDetails } from "./garagePackage";
import type { GarageStructure } from "./garageViews";
import { deriveExteriorContour, exteriorDimensionSegments } from "./exterior";
import { dist, type Plan, type Point } from "./model";

export type GarageDetails = {
  structure?: GarageStructure;
  permit?: GaragePermitDetails;
  area?: {
    clearFloor?: boolean;
    loft?: boolean;
    overhang?: boolean;
    otherArea?: boolean;
  };
};

/** The permit workflow supports a detached garage with one rectangular footprint. */
export function garageFootprint(plan: Plan) {
  const contour = deriveExteriorContour(plan);
  if (contour.status === "uncalibrated")
    throw Error(
      "Calibrate the garage floor plan before preparing permit drawings.",
    );
  if (contour.status !== "ready" || contour.corners.length !== 4)
    throw Error("The garage needs one closed rectangular wall loop.");
  const edges = exteriorDimensionSegments(contour.corners);
  const rectangular = edges.every(([a, b], index) => {
    const [, c] = edges[(index + 1) % edges.length];
    const dot = (b.x - a.x) * (c.x - b.x) + (b.y - a.y) * (c.y - b.y);
    return Math.abs(dot / (dist(a, b) * dist(b, c))) < 1e-6;
  });
  if (!rectangular)
    throw Error("Permit drawings require a rectangular garage footprint.");
  return contour;
}

export function areaM2(polygon: Point[]) {
  const origin = polygon[0];
  return (
    Math.abs(
      polygon.reduce((sum, a, index) => {
        const b = polygon[(index + 1) % polygon.length];
        return (
          sum +
          (a.x - origin.x) * (b.y - origin.y) -
          (b.x - origin.x) * (a.y - origin.y)
        );
      }, 0),
    ) / 20000
  );
}

export function garageAreas(plan: Plan) {
  const footprint = garageFootprint(plan);
  const area = plan.garage?.area;
  const braNotes: string[] = [];
  const byaNotes: string[] = [];
  if (!area?.clearFloor)
    braNotes.push(
      "Confirm that the entire floor is measurable. Low or sloped clearance needs a separate assessment.",
    );
  if (area?.loft !== false)
    braNotes.push(
      area?.loft
        ? "Assess the loft and any measurable floor area."
        : "Confirm whether the garage includes a loft.",
    );
  if (area?.overhang !== false)
    byaNotes.push(
      area?.overhang
        ? "Assess the roof overhang using its projection, clearance and use of the area below."
        : "Confirm whether the garage includes a roof overhang.",
    );
  if (area?.otherArea !== false) {
    braNotes.push("Confirm or assess any additional countable area.");
    byaNotes.push(
      "Confirm or assess any additional countable area, including covered exterior space or a projecting foundation.",
    );
  }
  return {
    footprint,
    bra: { value: areaM2(footprint.insideCorners), notes: braNotes },
    bya: { value: areaM2(footprint.corners), notes: byaNotes },
  };
}

export function garageAreaReport(plan: Plan) {
  const { footprint, bra, bya } = garageAreas(plan);
  const dimensions = (polygon: Point[]) =>
    [dist(polygon[0], polygon[1]), dist(polygon[1], polygon[2])]
      .map((cm) => `${(cm / 100).toFixed(2)} m`)
      .join(" × ");
  return [
    "Garage area calculation",
    plan.name,
    "",
    `BRA: ${bra.value.toFixed(2)} m²${bra.notes.length ? " (provisional)" : ""}`,
    `Inside faces of the exterior walls: ${dimensions(footprint.insideCorners)}.`,
    "Included: enclosed ground-floor area inside the exterior wall faces.",
    ...bra.notes,
    "",
    `BYA: ${bya.value.toFixed(2)} m²${bya.notes.length ? " (provisional)" : ""}`,
    `Outside faces of the exterior walls: ${dimensions(footprint.corners)}.`,
    "Included: ground footprint enclosed by the exterior face of the walls.",
    ...bya.notes,
    "",
    "Building-level calculation. Plot utilization, other structures and outdoor parking are separate.",
    "Measurement guidance: DiBK TEK17 § 5-4 (BRA) and § 5-2 (BYA).",
    "https://www.dibk.no/regelverk/byggteknisk-forskrift-tek17/5/5-4",
    "https://www.dibk.no/regelverk/byggteknisk-forskrift-tek17/5/5-2",
    "",
  ].join("\n");
}
