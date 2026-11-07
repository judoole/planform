#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import sharp from "sharp";
import { serialize } from "../src/model";
import {
  activeDrawingId,
  activePlan,
  projectDrawings,
  replaceDrawingPlan,
} from "../src/project";
import { applyCommands } from "../src/commands";
import { renderPlanSvg } from "../src/preview";
import {
  checkJsonSize,
  ProjectError,
  projectWarnings,
  readJson,
  readProjectFile,
} from "../src/validation";

const args = process.argv.slice(2),
  [action, filename] = args;
const usage =
  "Usage: npm run plan -- validate <project.json> [--plan <id>] | render <project.json> [--plan <id>] --out <preview.png|preview.svg> | apply <project.json> <commands.json> [--plan <id>] --out <result.planform.json>";
try {
  if (!["validate", "render", "apply"].includes(action) || !filename)
    throw Error(usage);
  const positional = action === "apply" ? 3 : 2;
  const options = new Map<string, string>();
  for (let i = positional; i < args.length; i += 2) {
    const flag = args[i],
      value = args[i + 1];
    if (
      !["--out", "--plan"].includes(flag) ||
      !value ||
      value.startsWith("--") ||
      options.has(flag)
    )
      throw Error(usage);
    options.set(flag, value);
  }
  const output = options.get("--out");
  if (action === "validate" && output) throw Error(usage);
  if (action !== "validate" && !output) throw Error(usage);
  if (output && resolve(output) === resolve(filename))
    throw Error("Use a separate output path to preserve the source project.");
  const project = readProjectFile(await readFile(filename, "utf8"));
  const targetId = options.get("--plan") ?? activeDrawingId(project);
  const target = projectDrawings(project).find(
    (drawing) => drawing.id === targetId,
  );
  if (!target) throw Error(`Unknown drawing ID "${targetId}".`);
  const plan = options.has("--plan") ? target.plan : activePlan(project);
  if (action === "validate") {
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          version: project.version,
          objects: plan.items.length,
          warnings: projectWarnings(plan),
          ...(project.version !== 2 && {
            active: project.active,
            plans: Object.fromEntries(
              projectDrawings(project).map((drawing) => {
                return [
                  drawing.id,
                  {
                    name: drawing.name,
                    role: drawing.role,
                    objects: drawing.plan.items.length,
                    warnings: projectWarnings(drawing.plan),
                  },
                ];
              }),
            ),
          }),
        },
        null,
        2,
      ) + "\n",
    );
  } else if (action === "render") {
    const svg = renderPlanSvg(plan),
      ext = extname(output!).toLowerCase();
    if (ext === ".svg") await writeFile(output!, svg);
    else if (ext === ".png")
      await sharp(Buffer.from(svg)).png().toFile(output!);
    else throw Error("Preview output must end in .png or .svg.");
    process.stdout.write(
      JSON.stringify({ ok: true, output: resolve(output!) }) + "\n",
    );
  } else {
    if (!args[2]) throw Error(usage);
    if (resolve(output!) === resolve(args[2]))
      throw Error("Use a separate output path to preserve the command file.");
    const result = applyCommands(
      plan,
      readJson(await readFile(args[2], "utf8")),
    );
    const contents =
      serialize(replaceDrawingPlan(project, targetId, result.plan)) + "\n";
    checkJsonSize(contents);
    await writeFile(output!, contents);
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          output: resolve(output!),
          changedIds: result.changedIds,
          deletedIds: result.deletedIds,
          warnings: projectWarnings(result.plan),
        },
        null,
        2,
      ) + "\n",
    );
  }
} catch (error) {
  process.stderr.write(
    JSON.stringify(
      {
        ok: false,
        errors:
          error instanceof ProjectError
            ? error.issues
            : [
                {
                  path: "/",
                  code: "error",
                  message:
                    error instanceof Error ? error.message : String(error),
                },
              ],
      },
      null,
      2,
    ) + "\n",
  );
  process.exitCode = 1;
}
