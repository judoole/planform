import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyCommands } from "../src/commands";
import { DrawItem, ExteriorDimensions } from "../src/Drawing";
import { annotatedPlanBounds, deriveExteriorContour } from "../src/exterior";
import { exportSvg } from "../src/exports";
import {
  History,
  calibrate,
  dist,
  emptyPlan,
  rotate,
  serialize,
  translate,
  type Dimension,
  type Plan,
  type Wall,
} from "../src/model";
import { renderPlanSvg } from "../src/preview";
import { addProposal, activePlan } from "../src/project";
import { readProjectFile } from "../src/validation";

function garage(turn = 0) {
  const corners = [
    { x: 10, y: 10 },
    { x: 590, y: 10 },
    { x: 590, y: 690 },
    { x: 10, y: 690 },
  ].map((point) => rotate(point, turn));
  const walls: Wall[] = corners.map((a, i) => ({
    id: `wall-${i}`,
    type: "wall",
    name: `Wall ${i + 1}`,
    a,
    b: corners[(i + 1) % 4],
    thickness: 20,
  }));
  return { plan: { ...emptyPlan(), items: walls }, walls };
}

function spans(plan: Plan) {
  const contour = deriveExteriorContour(plan);
  if (contour.status !== "ready") throw Error(contour.status);
  const [a, b, c] = contour.corners;
  return [dist(a, b), dist(b, c)];
}

const freePoint: Dimension = {
  id: "free",
  name: "Free dimension",
  type: "dimension",
  a: { x: 100, y: 250 },
  b: { x: 300, y: 250 },
  offset: -40,
};

describe("garage exterior contour", () => {
  it("measures from the outside faces, including with a hosted opening", () => {
    const { plan, walls } = garage();
    const withDoor = applyCommands(plan, {
      format: "planform-commands",
      version: 1,
      operations: [
        {
          op: "opening",
          type: "door",
          id: "garage-door",
          name: "Garage door",
          hostId: walls[0].id,
          width: 250,
          offset: 290,
        },
      ],
    }).plan;
    expect(deriveExteriorContour(withDoor)).toEqual({
      status: "ready",
      corners: [
        { x: 0, y: 0 },
        { x: 600, y: 0 },
        { x: 600, y: 700 },
        { x: 0, y: 700 },
      ],
    });
  });

  it("returns the same oriented contour after rotating, reordering, or reversing walls", () => {
    const { plan, walls } = garage(32);
    const [width, height] = spans(plan);
    expect(width).toBeCloseTo(600);
    expect(height).toBeCloseTo(700);
    expect(
      deriveExteriorContour({
        ...plan,
        items: [walls[2], walls[0], walls[1], walls[3]].map((wall) => ({
          ...wall,
          a: wall.b,
          b: wall.a,
        })),
      }),
    ).toEqual(deriveExteriorContour(plan));
  });

  it("updates after thickness and connected wall edits and restores both changes on undo", () => {
    const { plan, walls } = garage();
    const history = new History();
    history.push(plan);
    const thicker = applyCommands(plan, {
      format: "planform-commands",
      version: 1,
      operations: [
        { op: "update", id: walls[0].id, changes: { thickness: 40 } },
      ],
    }).plan;
    expect(spans(thicker)).toEqual([600, 710]);
    history.push(thicker);
    const moved = translate(thicker, [walls[1].id], { x: 50, y: 0 });
    expect(spans(moved)).toEqual([650, 710]);
    const firstUndo = history.undo(moved);
    expect(spans(firstUndo)).toEqual([600, 710]);
    expect(spans(history.undo(firstUndo))).toEqual([600, 700]);
  });

  it("reports open, unsupported, and uncalibrated geometry without claiming a size", () => {
    const { plan, walls } = garage();
    expect(
      deriveExteriorContour({ ...plan, items: walls.slice(0, 3) }),
    ).toEqual({ status: "open" });
    const corner = { x: 530, y: 690 };
    const skewed = [
      walls[0],
      { ...walls[1], b: corner },
      { ...walls[2], a: corner },
      walls[3],
    ];
    expect(deriveExteriorContour({ ...plan, items: skewed })).toEqual({
      status: "unsupported",
    });
    expect(
      deriveExteriorContour({
        ...plan,
        items: [...walls, { ...walls[1], id: "extra" }],
      }),
    ).toEqual({ status: "unsupported" });
    const filled = walls.map((wall) => ({ ...wall, thickness: 600 }));
    expect(deriveExteriorContour({ ...plan, items: filled })).toEqual({
      status: "unsupported",
    });
    plan.calibration.calibrated = false;
    expect(deriveExteriorContour(plan)).toEqual({ status: "uncalibrated" });
    expect(spans(calibrate(plan, 100, 200))).toEqual([1200, 1400]);
  });
});

describe("exterior dimensions in saved drawings and exports", () => {
  it("round-trips the display setting per drawing and keeps the free-point item independent", () => {
    const { plan, walls } = garage();
    const show = {
      ...plan,
      showExteriorDimensions: true,
      items: [...walls, freePoint],
    };
    const project = addProposal(plan, show);
    const saved = readProjectFile(serialize(project));
    expect(saved).toEqual(project);
    const reopened = activePlan(saved);
    const moved = translate(reopened, [walls[0].id], { x: 0, y: -20 });
    expect(moved.items.find((item) => item.id === freePoint.id)).toEqual(
      freePoint,
    );
    expect(spans(moved)).toEqual([600, 720]);
    expect(() =>
      readProjectFile(
        serialize({
          ...plan,
          showExteriorDimensions: "true",
        } as unknown as Plan),
      ),
    ).toThrow("/showExteriorDimensions");
  });

  it("uses the same marks for browser exports and CLI previews, with room for their labels", () => {
    const { plan, walls } = garage();
    expect(renderPlanSvg(plan)).not.toContain("data-exterior-dimensions");
    const show = {
      ...plan,
      showExteriorDimensions: true,
      items: [...walls, freePoint],
    };
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.innerHTML = renderToStaticMarkup(
      <g data-drawing="true">
        <DrawItem item={freePoint} plan={show} />
        <ExteriorDimensions contour={deriveExteriorContour(show)} />
      </g>,
    );
    const bounds = annotatedPlanBounds(show);
    expect(bounds.x).toBeLessThan(-50);
    expect(bounds.y).toBeLessThan(-50);
    for (const markup of [exportSvg(svg, bounds), renderPlanSvg(show)]) {
      expect(markup).toContain("6.00 m");
      expect(markup).toContain("7.00 m");
      expect(markup).toContain("200.0 cm");
      expect(markup).not.toContain("data-hit");
    }
    show.calibration.calibrated = false;
    const uncalibrated = renderPlanSvg(show);
    expect(uncalibrated).not.toContain("data-exterior-dimensions");
    expect(uncalibrated).toContain("200.0 units");
  });
});
