import { renderToStaticMarkup } from "react-dom/server";
import { garageAreaReport } from "./garage";
import { sitePlanSheet } from "./garageSite";
import { garageViews, garageViewNames, garageViewSheet } from "./garageViews";
import { visiblePlan } from "./layers";
import type { Plan } from "./model";
import { floorPlanSheet } from "./planSheet";
import type { SheetDrawing, SheetOptions } from "./sheets";

export type DrawingPdfPage = {
  id: string;
  label: string;
  scale: "drawing" | "fit" | 500;
  drawing: SheetDrawing;
};

export function drawingPdfPages(input: Plan) {
  const plan = visiblePlan(input);
  const pages: DrawingPdfPage[] = [];
  function add(
    id: string,
    label: string,
    scale: DrawingPdfPage["scale"],
    build: () => SheetDrawing,
  ) {
    try {
      const drawing = build();
      pages.push({ id, label, scale, drawing });
    } catch {
      // Incomplete optional views are still accessible in the drawing tools.
    }
  }
  add("plan", "Floor plan", "drawing", () =>
    floorPlanSheet(input, { fit: true }),
  );
  for (const view of garageViews) {
    add(view, garageViewNames[view], "drawing", () =>
      garageViewSheet(plan, view),
    );
  }
  if (plan.garage?.site)
    add("site", "Site plan", 500, () =>
      sitePlanSheet(plan, plan.garage?.permit?.propertyId ?? ""),
    );
  if (plan.garage?.area)
    add("area", "Building areas", "fit", () => areaPage(plan));
  return {
    pages,
    canRender3D:
      plan.calibration.calibrated &&
      plan.items.some((item) => item.type === "wall"),
  };
}

function areaPage(plan: Plan): SheetDrawing {
  const lines = garageAreaReport(plan)
    .split("\n")
    .flatMap((line) => {
      if (!line.trim()) return [""];
      const rows = [""];
      for (const word of line.split(/\s+/)) {
        if (rows.at(-1)!.length + word.length > 77 && rows.at(-1))
          rows.push(word);
        else
          rows[rows.length - 1] = [rows.at(-1), word].filter(Boolean).join(" ");
      }
      return rows;
    });
  return {
    title: "Building areas",
    bounds: { x: 0, y: 0, w: 720, h: 18 + lines.length * 18 },
    fitLabel: "Area estimate",
    markup: renderToStaticMarkup(
      <g fill="#234039" fontFamily="Arial" fontSize={16}>
        {lines.map((line, i) => (
          <text key={i} x={0} y={18 + i * 18}>
            {line}
          </text>
        ))}
      </g>,
    ),
  };
}

export function drawingPdfOptions(
  page: DrawingPdfPage,
  options: SheetOptions,
  calibrated: boolean,
): SheetOptions {
  if (page.scale !== "drawing") return { ...options, scale: page.scale };
  if (!calibrated && options.scale !== "fit")
    throw Error(
      "Calibrate a known distance before exporting a scaled floor plan.",
    );
  return options;
}
