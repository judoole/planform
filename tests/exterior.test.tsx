import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { applyCommands } from "../src/commands";
import { DrawItem, ExteriorDimensions } from "../src/Drawing";
import {
  annotatedPlanBounds,
  createExteriorContourReader,
  deriveExteriorContour,
  exteriorLabelLayout,
} from "../src/exterior";
import { exportSvg } from "../src/exports";
import {
  History,
  calibrate,
  dist,
  emptyPlan,
  rotate,
  serialize,
  setCorner,
  translate,
  type Dimension,
  type Plan,
  type Wall,
} from "../src/model";
import { renderPlanSvg } from "../src/preview";
import { addProposal, activePlan } from "../src/project";
import { readProjectFile } from "../src/validation";

function wallLoop(corners: { x: number; y: number }[]): Wall[] {
  return corners.map((a, i) => ({
    id: `wall-${i}`,
    type: "wall",
    name: `Wall ${i + 1}`,
    a,
    b: corners[(i + 1) % corners.length],
    thickness: 20,
  }));
}

function garage(turn = 0) {
  const walls = wallLoop(
    [
      { x: 10, y: 10 },
      { x: 590, y: 10 },
      { x: 590, y: 690 },
      { x: 10, y: 690 },
    ].map((point) => rotate(point, turn)),
  );
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
    expect(
      deriveExteriorContour({
        ...plan,
        items: [...walls]
          .reverse()
          .map((wall) => ({ ...wall, a: wall.b, b: wall.a })),
      }),
    ).toEqual(deriveExteriorContour(plan));
  });

  it("starts on the down-right edge when two directions point almost equally right", () => {
    for (const rotation of [45 - 0.00001, 45 + 0.00001]) {
      const contour = deriveExteriorContour(garage(rotation).plan);
      expect(contour.status).toBe("ready");
      if (contour.status !== "ready") throw Error(contour.status);
      expect(contour.corners[1].y).toBeGreaterThan(contour.corners[0].y);
      expect(dist(contour.corners[0], contour.corners[1])).toBeCloseTo(600);
    }
  });

  it("matches nearly coincident endpoints without snapping stored coordinates", () => {
    const { plan, walls } = garage();
    walls[1].a = { ...walls[1].a, y: walls[1].a.y + 0.0000005 };
    expect(spans(plan)[0]).toBeCloseTo(600, 6);
    expect(spans(plan)[1]).toBeCloseTo(700, 6);
    expect(walls[1].a.y).toBe(10.0000005);
    walls[1].a = { ...walls[1].a, y: 10.000002 };
    expect(deriveExteriorContour(plan)).toEqual({ status: "open" });
  });

  it("reuses the contour for unchanged walls and recalculates wall edits", () => {
    const { plan, walls } = garage();
    const read = createExteriorContourReader();
    const contour = read(plan);
    expect(read({ ...plan, showExteriorDimensions: true })).toBe(contour);
    expect(read({ ...plan, items: [...walls, freePoint] })).toBe(contour);
    expect(
      read({
        ...plan,
        calibration: { ...plan.calibration, calibrated: false },
      }),
    ).toEqual({ status: "uncalibrated" });
    const moved = translate(plan, [walls[1].id], { x: 50, y: 0 });
    expect(read(moved)).not.toBe(contour);
    expect(read(moved)).toEqual(deriveExteriorContour(moved));
    expect(read(plan)).toBe(contour);
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

  it("intersects offset wall faces at acute and obtuse corners after a corner edit", () => {
    const { plan, walls } = garage();
    const angled = setCorner(plan, walls[1].id, "b", { x: 80, y: 690 });
    // The sloped centerline follows a 3-4-5 direction. Its outer face
    // intersects y=0 at x=610 and y=700 at x=85.
    expect(deriveExteriorContour(angled)).toEqual({
      status: "ready",
      corners: [
        { x: 0, y: 0 },
        { x: 610, y: 0 },
        { x: 85, y: 700 },
        { x: 0, y: 700 },
      ],
    });
    const svg = renderPlanSvg({ ...angled, showExteriorDimensions: true });
    const markup = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(
      [...markup.querySelectorAll("[data-exterior-dimensions] text")].map(
        (label) => label.textContent,
      ),
    ).toEqual(["6.10 m", "8.75 m", "0.85 m", "7.00 m"]);
  });

  it("provides an outside-face segment for every wall in a clipped-corner footprint", () => {
    const { plan } = garage();
    const clipped = wallLoop([
      { x: 10, y: 10 },
      { x: 490, y: 10 },
      { x: 590, y: 110 },
      { x: 590, y: 690 },
      { x: 10, y: 690 },
    ]);
    const contour = deriveExteriorContour({ ...plan, items: clipped });
    expect(contour.status).toBe("ready");
    if (contour.status !== "ready") throw Error(contour.status);
    expect(contour.corners).toHaveLength(5);
    expect(contour.corners[1].x).toBeCloseTo(480 + 10 * Math.SQRT2);
    expect(contour.corners[2].y).toBeCloseTo(120 - 10 * Math.SQRT2);
  });

  it("reports open, unsupported, and uncalibrated geometry without claiming a size", () => {
    const { plan, walls } = garage();
    expect(
      deriveExteriorContour({ ...plan, items: walls.slice(0, 3) }),
    ).toEqual({ status: "open" });
    const concave = setCorner(plan, walls[1].id, "b", { x: 160, y: 180 });
    expect(deriveExteriorContour(concave)).toEqual({ status: "unsupported" });
    const bowTie = wallLoop([walls[0].a, walls[2].a, walls[1].a, walls[3].a]);
    expect(deriveExteriorContour({ ...plan, items: bowTie })).toEqual({
      status: "unsupported",
    });
    const extraWalls: Wall[] = [
      { ...walls[1], id: "duplicate" },
      {
        ...walls[1],
        id: "partition",
        a: { x: 300, y: 10 },
        b: { x: 300, y: 690 },
      },
      { ...walls[1], id: "stub", a: walls[1].a, b: { x: 300, y: 150 } },
    ];
    for (const wall of extraWalls)
      expect(
        deriveExteriorContour({ ...plan, items: [...walls, wall] }),
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
  it("reserves the explicit label advance and accounts for upside-down edge rotation", () => {
    const upright = exteriorLabelLayout(20, 0, "120000.00 m");
    const flipped = exteriorLabelLayout(20, 180, "120000.00 m");
    expect(upright.textLength).toBeGreaterThan(80);
    expect(flipped.textLength).toBe(upright.textLength);
    expect(flipped.transform).toBe("rotate(180 10 -47)");
    expect(flipped.bounds.y1).toBe(-94 - upright.bounds.y2);
    expect(flipped.bounds.y2).toBe(-94 - upright.bounds.y1);
    expect(upright.bounds.x2 - upright.bounds.x1).toBeCloseTo(
      upright.textLength + 5,
    );
  });

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
    const bounds = annotatedPlanBounds(show, deriveExteriorContour(show));
    expect(bounds.x).toBeLessThan(-50);
    expect(bounds.y).toBeLessThan(-50);
    expect(bounds.x + bounds.w).toBeGreaterThan(650);
    expect(bounds.y + bounds.h).toBeGreaterThan(750);
    for (const markup of [exportSvg(svg, bounds), renderPlanSvg(show)]) {
      const exported = new DOMParser().parseFromString(markup, "text/html");
      const marks = [
        ...exported.querySelectorAll("[data-exterior-dimensions] > g"),
      ];
      expect(marks.map((mark) => mark.textContent)).toEqual([
        "6.00 m",
        "7.00 m",
        "6.00 m",
        "7.00 m",
      ]);
      expect(marks.map((mark) => mark.getAttribute("transform"))).toEqual([
        "translate(0 0) rotate(0)",
        "translate(600 0) rotate(90)",
        "translate(600 700) rotate(180)",
        "translate(0 700) rotate(-90)",
      ]);
      expect(markup).toContain("200.0 cm");
      expect(markup).not.toContain("data-hit");
    }
    show.calibration.calibrated = false;
    const uncalibrated = renderPlanSvg(show);
    expect(uncalibrated).not.toContain("data-exterior-dimensions");
    expect(uncalibrated).toContain("200.0 units");
  });
});
