import { renderToStaticMarkup } from "react-dom/server";
import { traceForExport } from "./reference";
import { phaseLegend, phaseLegendStyles, visiblePlan } from "./layers";
import type { Plan } from "./model";
import { PlanArtwork, planArtworkBounds } from "./preview";
import type { SheetDrawing } from "./sheets";

export function floorPlanSheet(
  input: Plan,
  { fit = false } = {},
): SheetDrawing {
  const visible = visiblePlan(input);
  const plan = {
    ...visible,
    traceReference: traceForExport(visible.traceReference),
  };
  if (!fit && !plan.calibration.calibrated)
    throw Error(
      "Calibrate a known distance before exporting a scaled floor plan.",
    );
  if (!plan.items.length && !plan.traceReference)
    throw Error("Add drawing objects before exporting a floor plan.");
  const b = planArtworkBounds(plan, undefined, false);
  const pad = 12;
  return {
    title: "Floor plan - Ground floor",
    bounds: { x: b.x - pad, y: b.y - pad, w: b.w + 2 * pad, h: b.h + 2 * pad },
    legend: phaseLegend(plan),
    legendSwatches: phaseLegendStyles(plan)?.entries.map((entry, index) => ({
      index: index + 1,
      fill: entry.fill,
      stroke: entry.line,
      dashed: "dash" in entry,
    })),
    markup: renderToStaticMarkup(
      <PlanArtwork plan={plan} showScalePrompt={false} />,
    ),
  };
}
