// @vitest-environment node
import { expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { emptyPlan, serialize } from "../src/model";
import {
  addProposal,
  asMultiProject,
  type MultiPlanProject,
} from "../src/project";
import { readProjectFile } from "../src/validation";

it("validates every drawing and targets --plan for rendering and edits without changing active", () => {
  const temp = mkdtempSync(join(tmpdir(), "planform-proposals-"));
  const cli = resolve("node_modules/tsx/dist/cli.mjs");
  const script = resolve("scripts/planform.ts");
  const run = (...args: string[]) =>
    JSON.parse(
      execFileSync(process.execPath, [cli, script, ...args], {
        encoding: "utf8",
      }),
    );
  const fail = (...args: string[]) =>
    spawnSync(process.execPath, [cli, script, ...args], { encoding: "utf8" });
  try {
    const input = join(temp, "project.json"),
      commands = join(temp, "commands.json"),
      output = join(temp, "output.json"),
      preview = join(temp, "preview.svg");
    let project = asMultiProject(emptyPlan());
    for (let i = 1; i <= 10; i++)
      project = addProposal(
        project,
        { ...emptyPlan(), name: `Drawing ${i}` },
        `p${i}`,
      );
    writeFileSync(input, serialize(project));
    writeFileSync(
      commands,
      JSON.stringify({
        format: "planform-commands",
        version: 1,
        operations: [
          {
            op: "add",
            items: [
              {
                id: "wall",
                name: "Wall",
                type: "wall",
                a: { x: 0, y: 0 },
                b: { x: 400, y: 0 },
                thickness: 20,
              },
            ],
          },
        ],
      }),
    );
    const validation = run("validate", input);
    expect(Object.keys(validation.plans)).toHaveLength(11);
    expect(validation.active).toBe("p10");
    run("render", input, "--out", preview, "--plan", "p3");
    expect(readFileSync(preview, "utf8")).toContain("Drawing 3");
    run("apply", input, commands, "--plan", "p3", "--out", output);
    const result = readProjectFile(
      readFileSync(output, "utf8"),
    ) as MultiPlanProject;
    expect(result.active).toBe("p10");
    expect(result.drawings.find((d) => d.id === "p3")!.plan.items).toHaveLength(
      1,
    );
    expect(result.drawings.filter((d) => d.id !== "p3")).toEqual(
      project.drawings.filter((d) => d.id !== "p3"),
    );
    const missing = join(temp, "missing.json");
    const invalid = fail(
      "apply",
      input,
      commands,
      "--plan",
      "missing",
      "--out",
      missing,
    );
    expect(invalid.status).toBe(1);
    expect(JSON.parse(invalid.stderr).errors[0].message).toContain(
      'Unknown drawing ID "missing"',
    );
    expect(existsSync(missing)).toBe(false);
    const duplicate = fail(
      "render",
      input,
      "--plan",
      "p1",
      "--plan",
      "p2",
      "--out",
      preview,
    );
    expect(duplicate.status).toBe(1);
    // Rendering one valid drawing must still reject invalid inactive geometry.
    project.drawings[0].plan.items = [
      {
        id: "broken",
        name: "Broken",
        type: "wall",
        a: { x: 0, y: 0 },
        b: { x: 0, y: 0 },
        thickness: 20,
      },
    ];
    writeFileSync(input, serialize(project));
    const bad = fail(
      "render",
      input,
      "--plan",
      "p3",
      "--out",
      join(temp, "bad.svg"),
    );
    expect(bad.status).toBe(1);
    expect(JSON.parse(bad.stderr).errors[0].path).toBe(
      "/drawings/0/plan/items/0/b",
    );
    expect(existsSync(join(temp, "bad.svg"))).toBe(false);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}, 20000);
