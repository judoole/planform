import { describe, it, expect } from "vitest";
import {
  readFileSync,
  writeFileSync,
  mkdtempSync,
  existsSync,
  rmSync,
} from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { applyCommands, type CommandBatch } from "../src/commands";
import {
  emptyPlan,
  parseProject,
  serialize,
  type Wall,
  type Opening,
} from "../src/model";
import {
  validateProject,
  ProjectError,
  readProjectFile,
} from "../src/validation";
import { asMultiProject, type ComparisonProject } from "../src/project";
import { renderPlanSvg } from "../src/preview";
import example from "../public/agent/example.planform.json";

const wall: Wall = {
  id: "north",
  name: "North",
  type: "wall",
  a: { x: 0, y: 0 },
  b: { x: 600, y: 0 },
  thickness: 20,
};
const door: Opening = {
  id: "door",
  name: "Door",
  type: "door",
  hostId: "north",
  t: 0.5,
  width: 90,
  hinge: 1,
  swing: 1,
};
const plan = () => ({ ...emptyPlan(), items: structuredClone([wall, door]) });
const comparison = (): ComparisonProject => ({
  format: "planform",
  version: 3,
  name: "Renovation",
  active: "proposed",
  plans: { existing: plan(), proposed: plan() },
});
const batch = (operations: CommandBatch["operations"]): CommandBatch => ({
  format: "planform-commands",
  version: 1,
  operations,
});
const issues = (input: unknown) => {
  try {
    validateProject(input);
    throw Error("Expected invalid project");
  } catch (e) {
    expect(e).toBeInstanceOf(ProjectError);
    return (e as ProjectError).issues;
  }
};

describe("agent project contract", () => {
  it("fills documented defaults without changing the source or coordinate precision", () => {
    const input = {
      format: "planform",
      version: 2,
      name: "From ChatGPT",
      units: "cm",
      items: [{ ...wall, b: { x: 600.123456789, y: 0 } }],
    };
    const output = validateProject(input);
    expect(output.grid).toBe(10);
    expect(output.calibration.calibrated).toBe(true);
    expect(input).not.toHaveProperty("grid");
    expect(parseProject(serialize(output))).toEqual(output);
  });
  it("validates the complete example, including evidence and source notes", () => {
    const output = validateProject(example);
    expect(parseProject(serialize(output))).toEqual(example);
    expect(output.items).toHaveLength(29);
  });
  it("adds and reopens both fireplace kinds as editable furniture", () => {
    const items = (["fireplace-rounded", "fireplace-square"] as const).map(
      (kind, index) => ({
        id: kind,
        name: kind,
        type: "furniture" as const,
        kind,
        x: index * 100,
        y: 0,
        w: 80,
        h: 70 + index * 10,
        rotation: index * 90,
      }),
    );
    const { plan } = applyCommands(emptyPlan(), batch([{ op: "add", items }]));
    expect(parseProject(serialize(plan)).items).toEqual(items);
  });
  it("rejects orphaned, out-of-wall and overlapping openings with object IDs", () => {
    const p = plan();
    (p.items[1] as Opening).hostId = "missing";
    expect(issues(p)).toContainEqual(
      expect.objectContaining({
        code: "missing_host",
        objectId: "door",
        path: "/items/1/hostId",
      }),
    );
    (p.items[1] as Opening).hostId = wall.id;
    (p.items[1] as Opening).t = 0;
    expect(issues(p).some((e) => e.code === "opening_outside_wall")).toBe(true);
    const overlap = plan();
    overlap.items.push({ ...door, id: "other" });
    expect(issues(overlap).some((e) => e.code === "overlapping_opening")).toBe(
      true,
    );
    expect(overlap.items).toHaveLength(3);
    expect((overlap.items[1] as Opening).width).toBe(90);
  });
  it("rejects unsupported geometry, properties, units and invalid field values", () => {
    for (const input of [
      { ...plan(), units: "m" },
      { ...plan(), version: 99 },
      { ...plan(), items: [{ ...wall, b: wall.a }] },
      { ...plan(), items: [{ ...door, hinge: 0 }] },
      { ...plan(), items: [{ ...wall, svg: "<script/>" }] },
      { ...plan(), items: [{ id: "v", name: "Vector", type: "vector" }] },
      { ...plan(), grid: Infinity },
      { ...plan(), items: [{ ...wall, a: { x: "0", y: 0 } }] },
    ])
      expect(issues(input).length).toBeGreaterThan(0);
  });
  it("rejects nested architectural objects, duplicate nested IDs and excessive nesting", () => {
    const symbol = {
      id: "chair",
      name: "Chair",
      type: "furniture",
      kind: "chair",
      x: 0,
      y: 0,
      w: 50,
      h: 50,
      rotation: 0,
    };
    const group = {
      id: "g",
      name: "Group",
      type: "group",
      x: 0,
      y: 0,
      w: 100,
      h: 100,
      rotation: 0,
      sourceBox: { x: 0, y: 0, w: 100, h: 100 },
      children: [symbol],
    };
    expect(
      issues({ ...emptyPlan(), items: [{ ...group, children: [wall] }] })
        .length,
    ).toBeGreaterThan(0);
    expect(
      issues({ ...emptyPlan(), items: [group, symbol] }).some(
        (e) => e.code === "duplicate_id",
      ),
    ).toBe(true);
    let nested: unknown = symbol;
    for (let n = 0; n < 17; n++)
      nested = { ...group, id: `g${n}`, children: [nested] };
    expect(issues({ ...emptyPlan(), items: [nested] })[0].code).toBe("limit");
  });
  it("migrates architectural v1 projects and clearly rejects legacy SVG projects", () => {
    expect(
      parseProject(
        JSON.stringify({ ...plan(), version: 1, defs: "", papers: [] }),
      ).version,
    ).toBe(2);
    expect(() =>
      parseProject(
        JSON.stringify({ ...plan(), version: 1, defs: "<clipPath/>" }),
      ),
    ).toThrow("legacy project contains SVG");
    expect(() =>
      parseProject(
        JSON.stringify({ ...plan(), version: 1, items: [{ type: "vector" }] }),
      ),
    ).toThrow("legacy project contains SVG");
    expect(() => parseProject("{oops")).toThrow("Invalid JSON");
  });
});

describe("comparison project files", () => {
  it("continues to read single plans, including architectural v1 files", () => {
    const drawing = plan();
    expect(readProjectFile(serialize(drawing))).toEqual(drawing);
    expect(readProjectFile(JSON.stringify({ ...drawing, version: 1 }))).toEqual(
      drawing,
    );
  });

  it("round trips two versions with the same object IDs and independent geometry", () => {
    const project = comparison();
    (project.plans.proposed.items[0] as Wall).b.x = 750.125;
    expect(readProjectFile(serialize(project))).toEqual(
      asMultiProject(project),
    );
  });

  it("checks host relationships within the inactive plan", () => {
    const project = comparison();
    project.plans.existing.items = [{ ...door }];
    expect(() => readProjectFile(serialize(project))).toThrow(
      "/plans/existing/items/0/hostId (door)",
    );
  });
});

describe("atomic architectural commands", () => {
  it("places an opening using physical center distance, preserving the input", () => {
    const p = { ...emptyPlan(), items: [structuredClone(wall)] };
    const output = applyCommands(
      p,
      batch([
        {
          op: "opening",
          id: "entry",
          name: "Entry",
          type: "door",
          hostId: "north",
          offset: 150,
          width: 90,
        },
      ]),
    );
    expect((output.plan.items[1] as Opening).t).toBe(0.25);
    expect(output.changedIds).toEqual(["entry"]);
    expect(p.items).toHaveLength(1);
  });
  it("round-trips sliding doors and enforces the same wall-opening constraints", () => {
    const sliding = {
      op: "opening",
      id: "slider",
      name: "Sliding door",
      type: "door",
      style: "sliding",
      slideDirection: -1,
      hostId: wall.id,
      offset: 150,
      width: 120,
    } as const;
    const result = applyCommands(plan(), batch([sliding]));
    expect(parseProject(serialize(result.plan)).items.at(-1)).toMatchObject({
      type: "door",
      style: "sliding",
      slideDirection: -1,
      hostId: wall.id,
      t: 0.25,
      width: 120,
    });
    expect(() =>
      applyCommands(plan(), batch([{ ...sliding, offset: 300 }])),
    ).toThrow("overlaps");
    expect(() =>
      applyCommands(plan(), batch([{ ...sliding, type: "window" }])),
    ).toThrow(ProjectError);
    expect(() =>
      applyCommands(
        result.plan,
        batch([
          { op: "update", id: sliding.id, changes: { slideDirection: 0 } },
        ]),
      ),
    ).toThrow(ProjectError);
  });
  it("rejects an invalid final result without applying earlier operations", () => {
    const p = plan(),
      before = serialize(p);
    expect(() =>
      applyCommands(
        p,
        batch([
          { op: "update", id: "door", changes: { name: "Changed" } },
          { op: "corner", wallId: "north", end: "b", point: { x: 50, y: 0 } },
        ]),
      ),
    ).toThrow("fit entirely");
    expect(serialize(p)).toBe(before);
  });
  it("moves shared corners and validates once after related corrections", () => {
    const p = plan();
    p.items.push({
      ...wall,
      id: "east",
      a: { x: 600, y: 0 },
      b: { x: 600, y: 400 },
    });
    const output = applyCommands(
      p,
      batch([
        { op: "corner", wallId: "north", end: "b", point: { x: 50, y: 0 } },
        { op: "update", id: "door", changes: { width: 40 } },
      ]),
    );
    expect((output.plan.items[2] as Wall).a).toEqual({ x: 50, y: 0 });
    expect((output.plan.items[1] as Opening).width).toBe(40);
    expect(output.changedIds).toEqual(["north", "east", "door"]);
  });
  it("requires explicit cascading deletion and reports removed openings", () => {
    expect(() =>
      applyCommands(plan(), batch([{ op: "delete", ids: ["north"] }])),
    ).toThrow("cascade");
    const output = applyCommands(
      plan(),
      batch([{ op: "delete", ids: ["north"], cascade: true }]),
    );
    expect(output.plan.items).toEqual([]);
    expect(output.deletedIds).toEqual(["north", "door"]);
  });
  it("honors locks on attached and shared objects and supports explicit unlock", () => {
    const p = plan();
    p.items[1].locked = true;
    expect(() =>
      applyCommands(
        p,
        batch([{ op: "delete", ids: ["north"], cascade: true }]),
      ),
    ).toThrow("locked");
    expect(
      applyCommands(
        p,
        batch([
          { op: "update", id: "door", changes: { locked: false } },
          { op: "update", id: "door", changes: { width: 100 } },
        ]),
      ).plan.items[1],
    ).toMatchObject({ width: 100, locked: false });
    p.items.push({
      ...wall,
      id: "east",
      a: wall.b,
      b: { x: 600, y: 400 },
      locked: true,
    });
    expect(() =>
      applyCommands(
        p,
        batch([
          { op: "corner", wallId: "north", end: "b", point: { x: 700, y: 0 } },
        ]),
      ),
    ).toThrow("Connected wall");
  });
  it("rejects unknown operations, missing targets and attempts to bypass shared corner edits", () => {
    expect(() =>
      applyCommands(plan(), {
        format: "planform-commands",
        version: 1,
        operations: [{ op: "execute", code: "bad" }],
      }),
    ).toThrow();
    expect(() =>
      applyCommands(
        plan(),
        batch([{ op: "update", id: "unknown", changes: { name: "Missing" } }]),
      ),
    ).toThrow("does not exist");
    expect(() =>
      applyCommands(
        plan(),
        batch([
          { op: "update", id: "north", changes: { b: { x: 700, y: 0 } } },
        ]),
      ),
    ).toThrow("Use corner");
  });
});

describe("agent previews and CLI", () => {
  it("uses the architectural renderer, escapes labels and omits editing controls", () => {
    const p = validateProject(example);
    p.name = '<script>alert("x")</script>';
    const svg = renderPlanSvg(p);
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    expect(
      doc.querySelector("parsererror,script,[data-hit],pattern"),
    ).toBeNull();
    expect(doc.querySelectorAll("[data-item-id]")).toHaveLength(29);
    expect(doc.querySelector("title")!.textContent).toBe(p.name);
    expect(renderPlanSvg(p)).toBe(svg);
  });
  it("validates, renders, applies changes and leaves no output on failure", () => {
    const temp = mkdtempSync(join(tmpdir(), "planform-test-"));
    const cli = resolve("node_modules/tsx/dist/cli.mjs"),
      script = resolve("scripts/planform.ts");
    const run = (...args: string[]) =>
      JSON.parse(
        execFileSync(process.execPath, [cli, script, ...args], {
          encoding: "utf8",
        }),
      );
    try {
      expect(run("validate", "public/agent/example.planform.json").ok).toBe(
        true,
      );
      const png = join(temp, "preview.png");
      expect(
        run("render", "public/agent/example.planform.json", "--out", png).ok,
      ).toBe(true);
      expect(readFileSync(png).subarray(1, 4).toString()).toBe("PNG");
      const out = join(temp, "edited.planform.json");
      const applied = run(
        "apply",
        "public/agent/example.planform.json",
        "examples/revise-example.commands.json",
        "--out",
        out,
      );
      expect(applied.changedIds).toContain("south-window");
      expect(parseProject(readFileSync(out, "utf8")).items).toHaveLength(30);
      const failed = join(temp, "failed.png");
      const result = spawnSync(
        process.execPath,
        [cli, script, "render", "package.json", "--out", failed],
        { encoding: "utf8" },
      );
      expect(result.status).toBe(1);
      expect(JSON.parse(result.stderr).ok).toBe(false);
      expect(existsSync(failed)).toBe(false);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }, 20000);
  it("renders and edits only the active version of a comparison project", () => {
    const temp = mkdtempSync(join(tmpdir(), "planform-comparison-"));
    const cli = resolve("node_modules/tsx/dist/cli.mjs");
    const script = resolve("scripts/planform.ts");
    const run = (...args: string[]) =>
      JSON.parse(
        execFileSync(process.execPath, [cli, script, ...args], {
          encoding: "utf8",
        }),
      );
    try {
      const input = join(temp, "comparison.planform.json");
      const commands = join(temp, "edit.commands.json");
      const preview = join(temp, "preview.svg");
      const output = join(temp, "edited.planform.json");
      const project = comparison();
      project.plans.proposed.name = "Proposed drawing";
      writeFileSync(input, serialize(project));
      writeFileSync(
        commands,
        JSON.stringify(batch([{ op: "delete", ids: [door.id] }])),
      );
      expect(run("validate", input)).toMatchObject({
        version: 4,
        active: "proposed",
      });
      expect(run("render", input, "--out", preview).ok).toBe(true);
      const svg = new DOMParser().parseFromString(
        readFileSync(preview, "utf8"),
        "image/svg+xml",
      );
      expect(svg.querySelector("title")?.textContent).toBe("Proposed drawing");
      expect(svg.querySelectorAll("[data-item-id]")).toHaveLength(2);
      expect(run("apply", input, commands, "--out", output).deletedIds).toEqual(
        [door.id],
      );
      expect(readProjectFile(readFileSync(output, "utf8"))).toEqual(
        asMultiProject({
          ...project,
          plans: {
            ...project.plans,
            proposed: { ...project.plans.proposed, items: [wall] },
          },
        }),
      );
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  }, 20000);
});
