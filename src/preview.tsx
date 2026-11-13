import { renderToStaticMarkup } from "react-dom/server";
import { DrawItem, ExteriorDimensions, RoomLabels } from "./Drawing";
import { annotatedPlanBounds, visibleExteriorContour } from "./exterior";
import { findRooms } from "./rooms";
import type { Plan } from "./model";
import { validateProject } from "./validation";

/** Same architectural renderer as the editor, with no grid, selection or hit targets. */
export function renderPlanSvg(input: Plan): string {
  const plan = validateProject(input),
    exterior = visibleExteriorContour(plan),
    b = annotatedPlanBounds(plan, exterior);
  const pad = Math.max(b.w, b.h) * 0.025 + 30;
  const x = b.x - pad,
    y = b.y - pad,
    w = b.w + pad * 2,
    h = b.h + pad * 2;
  const scale = Math.min(1, 4096 / Math.max(w, h));
  return renderToStaticMarkup(
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${x} ${y} ${w} ${h}`}
      width={Math.ceil(w * scale)}
      height={Math.ceil(h * scale)}
      role="img"
      aria-label={plan.name}
    >
      <title>{plan.name}</title>
      <rect x={x} y={y} width={w} height={h} fill="white" />
      {plan.items.map((item) => (
        <DrawItem key={item.id} item={item} plan={plan} interactive={false} />
      ))}
      <RoomLabels
        rooms={findRooms(plan.items)}
        calibrated={plan.calibration.calibrated}
      />
      <ExteriorDimensions contour={exterior} />
    </svg>,
  );
}
