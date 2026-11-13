import { renderToStaticMarkup } from "react-dom/server";
import { GarageSectionMark, garageSectionBounds } from "./garageViews";
import { unionBoxes } from "./model";
import {
  DrawItem,
  ExteriorDimensions,
  RenovationLegend,
  RoomLabels,
} from "./Drawing";
import { geometryAnnotationBounds, visibleExteriorContour } from "./exterior";
import { findRooms } from "./rooms";
import type { Plan } from "./model";
import { legendLayout, visiblePlan } from "./layers";
import { validateProject } from "./validation";

/** Same architectural renderer as the editor, with no grid, selection or hit targets. */
export function renderPlanSvg(input: Plan): string {
  const plan = visiblePlan(validateProject(input)),
    exterior = visibleExteriorContour(plan),
    b = planArtworkBounds(plan, exterior);
  const legend = legendLayout(plan, planArtworkBounds(plan, exterior, false));
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
      <PlanArtwork plan={plan} />
      {legend && <RenovationLegend plan={plan} {...legend} />}
    </svg>,
  );
}

/** Shared architectural sheet content in drawing coordinates. */
export function PlanArtwork({ plan }: { plan: Plan }) {
  return (
    <>
      {plan.items.map((item) => (
        <DrawItem key={item.id} item={item} plan={plan} interactive={false} />
      ))}
      <RoomLabels
        rooms={findRooms(plan.items)}
        calibrated={plan.calibration.calibrated}
      />
      <ExteriorDimensions contour={visibleExteriorContour(plan)} />
      <GarageSectionMark plan={plan} />
    </>
  );
}

export function planArtworkBounds(
  plan: Plan,
  exterior = visibleExteriorContour(plan),
  includeLegend = true,
) {
  const geometry = geometryAnnotationBounds(plan, exterior);
  const section = garageSectionBounds(plan);
  const bounds = section ? unionBoxes([geometry, section]) : geometry;
  const legend = includeLegend && legendLayout(plan, bounds);
  return legend ? unionBoxes([bounds, legend.bounds]) : bounds;
}
