import { describe, expect, it } from "vitest";
import { emptyPlan, serialize, type Wall } from "../src/model";
import {
  activePlan,
  addProposal,
  asMultiProject,
  MAX_PROPOSALS,
  removeProposal,
  renameProposal,
  replaceDrawingPlan,
  selectDrawing,
  type MultiPlanProject,
} from "../src/project";
import { readProjectFile } from "../src/validation";
import schema from "../public/agent/project.schema.json";

const drawing = () => ({
  ...emptyPlan(),
  items: [
    {
      id: "wall",
      name: "Wall",
      type: "wall" as const,
      a: { x: 0, y: 0 },
      b: { x: 400.123456789, y: 0 },
      thickness: 20,
    },
  ],
});

describe("multiple proposal projects", () => {
  it.each([0, 1, 5, 10])(
    "round trips %i proposals with stable IDs, names and active selection",
    (count) => {
      let project = asMultiProject(drawing());
      for (let i = 0; i < count; i++)
        project = addProposal(project, drawing(), `p${i}`);
      expect(readProjectFile(serialize(project))).toEqual(project);
      expect(project.drawings).toHaveLength(count + 1);
      expect(project.active).toBe(count ? `p${count - 1}` : "existing");
      expect(schema.properties.drawings.maxItems).toBe(MAX_PROPOSALS + 1);
    },
  );

  it("enforces the proposal limit during creation and import without truncating input", () => {
    let project = asMultiProject(drawing());
    for (let i = 0; i < MAX_PROPOSALS; i++)
      project = addProposal(project, drawing());
    expect(() => addProposal(project, drawing())).toThrow(/10 proposals/);
    const invalid = {
      ...project,
      drawings: [
        ...project.drawings,
        { ...project.drawings[1], id: "eleventh" },
      ],
    };
    expect(() => readProjectFile(serialize(invalid))).toThrow(/10 proposals/);
    expect(invalid.drawings).toHaveLength(12);
  });

  it("keeps copied object IDs while isolating geometry, source and calibration", () => {
    const source = {
      ...drawing(),
      source: { file: "floor.pdf", notes: ["Estimated"] },
    };
    const project = addProposal(source, source, "first");
    (activePlan(project).items[0] as Wall).b.x = 700;
    activePlan(project).source!.notes.push("New note");
    activePlan(project).calibration.factor = 2;
    expect(source.items[0].b.x).toBe(400.123456789);
    expect(source.source.notes).toEqual(["Estimated"]);
    expect(source.calibration.factor).toBe(1);
    expect(activePlan(project).items[0].id).toBe("wall");
    expect(readProjectFile(serialize(project))).toEqual(project);
  });

  it("renames, branches from another proposal, and safely removes active or inactive proposals", () => {
    const original = addProposal(drawing(), drawing(), "first");
    const renamed = renameProposal(original, "first", " Åpent kjøkken 🏠 ");
    expect(renamed.drawings[1].name).toBe("Åpent kjøkken 🏠");
    expect(original.drawings[1].name).toBe("Proposal 1");
    const branched = addProposal(renamed, activePlan(renamed), "second");
    expect(removeProposal(branched, "first").active).toBe("second");
    expect(removeProposal(branched, "second").active).toBe("existing");
    expect(() => removeProposal(branched, "existing")).toThrow(
      /cannot be deleted/,
    );
    expect(() => renameProposal(branched, "first", " ")).toThrow(/1–200/);
    expect(() => renameProposal(branched, "existing", "Other")).toThrow(
      /Only proposals/,
    );
    expect(() => selectDrawing(branched, "missing")).toThrow(/Unknown drawing/);
  });

  it("targets an inactive drawing without changing the saved active ID or other geometry", () => {
    const project = addProposal(drawing(), drawing(), "first");
    const edited = { ...drawing(), name: "Changed", items: [] };
    const result = replaceDrawingPlan(
      project,
      "existing",
      edited,
    ) as MultiPlanProject;
    expect(result.active).toBe("first");
    expect(result.drawings[0].plan).toEqual(edited);
    expect(result.drawings[1]).toBe(project.drawings[1]);
    expect(replaceDrawingPlan(drawing(), "existing", edited)).toBe(edited);
  });

  it("rejects duplicate drawing IDs, dangling active IDs, and missing or multiple Existing drawings", () => {
    const project = addProposal(drawing(), drawing(), "first");
    for (const invalid of [
      { ...project, active: "missing" },
      {
        ...project,
        drawings: [
          project.drawings[0],
          { ...project.drawings[1], id: "existing" },
        ],
      },
      {
        ...project,
        drawings: project.drawings.map((d) => ({ ...d, role: "proposal" })),
      },
      {
        ...project,
        drawings: project.drawings.map((d) => ({ ...d, role: "existing" })),
      },
    ])
      expect(() =>
        readProjectFile(serialize(invalid as MultiPlanProject)),
      ).toThrow();
    expect(() => addProposal(project, drawing(), "first")).toThrow(
      /already exists/,
    );
  });

  it("validates inactive geometry with the drawing path, without repairing it", () => {
    const project = addProposal(drawing(), drawing(), "first");
    (project.drawings[0].plan.items[0] as Wall).b = { x: 0, y: 0 };
    expect(() => readProjectFile(serialize(project))).toThrow(
      "/drawings/0/plan/items/0/b (wall)",
    );
    expect((project.drawings[0].plan.items[0] as Wall).b.x).toBe(0);
  });
});
