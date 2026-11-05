import { describe, it, expect } from "vitest";
import {
  emptyPlan,
  dist,
  angle,
  project,
  setCorner,
  translate,
  normalizeOpenings,
  openingFrame,
  removeItems,
  calibrate,
  serialize,
  parseProject,
  snapPoint,
  History,
  duplicateItems,
  groupItems,
  ungroupItems,
  type Plan,
  type Wall,
  type Opening,
  type RectItem,
} from "../src/model";
import { sanitizeSvg, straightNodes, safeOpenProject } from "../src/svg";
const wall: Wall = {
  id: "wall",
  name: "Wall",
  type: "wall",
  a: { x: 0, y: 0 },
  b: { x: 500, y: 0 },
  thickness: 20,
};
const door: Opening = {
  id: "door",
  name: "Door",
  type: "door",
  hostId: "wall",
  t: 0.3,
  width: 90,
  hinge: 1,
  swing: -1,
};
const windowItem: Opening = {
  ...door,
  id: "window",
  type: "window",
  t: 0.7,
  width: 120,
};
const plan = (): Plan => ({
  ...emptyPlan(),
  items: structuredClone([wall, door, windowItem]),
});
describe("geometry and wall relationships", () => {
  it("projects angled positions and retains precision", () => {
    const w = { ...wall, b: { x: 300, y: 400 } };
    expect(dist(w.a, w.b)).toBe(500);
    expect(angle(w.a, w.b)).toBeCloseTo(53.130102354);
    expect(project({ x: 150, y: 200 }, w).t).toBeCloseTo(0.5);
  });
  it("moves shared corners once and updates attached opening centers", () => {
    const p = plan();
    p.items.push({
      ...wall,
      id: "second",
      a: { x: 500, y: 0 },
      b: { x: 500, y: 400 },
    });
    const result = translate(p, ["wall"], { x: 100, y: 50 });
    const a = result.items[0] as Wall,
      b = result.items[3] as Wall;
    expect(b.a).toEqual(a.b);
    expect(b.b).toEqual({ x: 500, y: 400 });
    expect(
      openingFrame(result.items[1] as Opening, result.items)?.center,
    ).toEqual({ x: 250, y: 50 });
  });
  it("keeps normalized attachment positions on resize, clamps at boundaries", () => {
    const result = setCorner(plan(), "wall", "b", { x: 1000, y: 0 });
    expect((result.items[1] as Opening).width).toBe(90);
    expect(
      openingFrame(result.items[1] as Opening, result.items)?.center.x,
    ).toBe(300);
    const shorter = setCorner(plan(), "wall", "b", { x: 80, y: 0 });
    expect(
      shorter.items
        .filter((i) => i.type === "door" || i.type === "window")
        .every((i) => (i as Opening).width <= 80),
    ).toBe(true);
  });
  it("prevents overlapping openings and orphaned attachments", () => {
    const p = plan();
    (p.items[2] as Opening).t = 0.3;
    const n = normalizeOpenings(p),
      o = n.items.filter(
        (i) => i.type === "door" || i.type === "window",
      ) as Opening[];
    expect(Math.abs(o[0].t - o[1].t) * 500).toBeGreaterThanOrEqual(
      (o[0].width + o[1].width) / 2,
    );
    expect(removeItems(p, ["wall"]).items).toHaveLength(0);
  });
  it("snaps endpoints before grids and supports disabling snap", () => {
    const p = plan(),
      raw = { x: 502, y: 1 };
    expect(snapPoint(raw, p, true, 5).point).toEqual({ x: 500, y: 0 });
    expect(snapPoint(raw, p, false, 5).point).toEqual(raw);
    expect(snapPoint({ x: 44, y: 47 }, p, true, 1).point).toEqual({
      x: 40,
      y: 50,
    });
  });
  it("duplicates walls with their attachments and independent IDs", () => {
    const p = plan(),
      r = duplicateItems(p, ["wall"]);
    const newWall = r.plan.items.find((i) => r.ids.includes(i.id)) as Wall;
    const attached = r.plan.items.filter(
      (i) =>
        (i.type === "door" || i.type === "window") && i.hostId === newWall.id,
    );
    expect(attached).toHaveLength(2);
    expect(newWall.a).toEqual({ x: 30, y: 30 });
  });
});
describe("calibration, persistence and history", () => {
  it("rescales all geometry consistently and supports full round trips", () => {
    const p = plan();
    p.calibration = {
      calibrated: false,
      imported: true,
      factor: 1,
      source: "sample.svg",
    };
    p.defs = '<clipPath id="safe"><rect width="20" height="20"/></clipPath>';
    p.items.push({
      id: "vector",
      name: "Curve",
      type: "vector",
      x: 20,
      y: 30,
      w: 10,
      h: 10,
      rotation: 45,
      sourceBox: { x: 0, y: 0, w: 10, h: 10 },
      svg: '<path d="M0 0 C0 5 5 10 10 10"/>',
    });
    const c = calibrate(p, 100, 333.3333333333);
    expect(dist((c.items[0] as Wall).a, (c.items[0] as Wall).b)).toBeCloseTo(
      1666.6666666665,
    );
    expect((c.items[1] as Opening).width).toBeCloseTo(300);
    expect(c.calibration.calibrated).toBe(true);
    expect(parseProject(serialize(c))).toEqual(c);
    expect(safeOpenProject(serialize(c)).plan.items).toHaveLength(4);
  });
  it("rejects invalid calibration, corrupt files, versions and duplicate IDs", () => {
    expect(() => calibrate(plan(), 0, 500)).toThrow();
    expect(() => calibrate(plan(), 100, -2)).toThrow();
    expect(() => parseProject("{}")).toThrow();
    expect(() =>
      parseProject(JSON.stringify({ ...plan(), version: 2 })),
    ).toThrow();
    const p = plan();
    p.items.push(wall);
    expect(() => parseProject(serialize(p))).toThrow();
  });
  it("restores drawing, moving, deletion and property edits with history", () => {
    const h = new History(),
      p = plan(),
      moved = translate(p, ["wall"], { x: 20, y: 30 });
    h.push(p);
    const deleted = removeItems(moved, ["door"]);
    h.push(moved);
    const changed = structuredClone(deleted);
    (changed.items[0] as Wall).thickness = 30;
    h.push(deleted);
    expect(h.undo(changed)).toEqual(deleted);
    expect(h.undo(deleted)).toEqual(moved);
    expect(h.redo(moved)).toEqual(deleted);
    h.push(p);
    expect(h.future).toHaveLength(0);
  });
  it("groups and ungroups transformed vectors without losing their curves", () => {
    const v: RectItem = {
      id: "v",
      name: "v",
      type: "vector",
      x: 10,
      y: 20,
      w: 100,
      h: 80,
      rotation: 0,
      sourceBox: { x: 0, y: 0, w: 100, h: 80 },
      svg: '<path d="M0 0 C10 10 80 50 100 80"/>',
    };
    const p = { ...emptyPlan(), items: [v, { ...v, id: "v2", x: 200 }] };
    const g = groupItems(p, ["v", "v2"]);
    expect(g.items).toHaveLength(1);
    const reopened = safeOpenProject(serialize(g)).plan;
    const u = ungroupItems(reopened, g.items[0].id);
    expect({ ...u.items[0], svg: v.svg }).toEqual(v);
    expect((u.items[0] as RectItem).svg).toContain("M0 0 C10 10 80 50 100 80");
  });
});
describe("untrusted SVG", () => {
  it("blocks scripts, event handlers, foreign objects and external resources", () => {
    const r = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><foreignObject/><image href="https://evil/x"/><path onload="alert(1)" d="M0 0 L1 1" style="fill:url(https://evil);stroke:red"/><use href="https://evil/x"/></svg>',
    );
    expect(r.root.querySelector("script,foreignObject,image")).toBeNull();
    expect(r.root.querySelector("[onload]")).toBeNull();
    expect(r.root.innerHTML).not.toContain("https://");
    expect(r.warnings.length).toBeGreaterThan(0);
  });
  it("retains white cover geometry, curves, clipping and order", () => {
    const r = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="c"><rect width="10" height="10"/></clipPath></defs><g transform="translate(10 20)" clip-path="url(#c)"><path d="M0 0 C1 2 3 4 5 6" fill="black"/><path d="M0 0 L1 1" fill="white"/></g></svg>',
      "prefix_",
    );
    expect(r.warnings).toEqual([]);
    expect(r.root.querySelector("g")?.getAttribute("clip-path")).toBe(
      "url(#prefix_c)",
    );
    expect(r.root.querySelectorAll("path")[1].getAttribute("fill")).toBe(
      "white",
    );
  });
  it("parses relative straight nodes and leaves curves untouched", () => {
    const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
    p.setAttribute("d", "M10 20 h30 v40 l-30 0 z");
    expect(straightNodes(p)).toEqual({
      nodes: [
        { x: 10, y: 20 },
        { x: 40, y: 20 },
        { x: 40, y: 60 },
        { x: 10, y: 60 },
      ],
      closed: true,
    });
    p.setAttribute("d", "M0 0 C1 2 3 4 5 6");
    expect(straightNodes(p)).toBeNull();
  });
});
