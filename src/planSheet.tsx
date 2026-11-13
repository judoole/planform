import { renderToStaticMarkup } from "react-dom/server";
import { visiblePlan } from "./layers";
import type { Plan } from "./model";
import { PlanArtwork, planArtworkBounds } from "./preview";
import type { SheetDrawing } from "./sheets";

export function floorPlanSheet(input: Plan): SheetDrawing {
  const plan = visiblePlan(input);
  if (!plan.calibration.calibrated)
    throw Error(
      "Calibrate a known distance before exporting a scaled floor plan.",
    );
  if (!plan.items.length)
    throw Error("Add drawing objects before exporting a floor plan.");
  const b = planArtworkBounds(plan);
  const pad = 12;
  return {
    title: "Floor plan - Ground floor",
    bounds: { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad },
    markup: renderToStaticMarkup(<PlanArtwork plan={plan} />),
  };
}
