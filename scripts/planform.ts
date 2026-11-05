#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import sharp from "sharp";
import { parseProject, serialize } from "../src/model";
import { applyCommands } from "../src/commands";
import { renderPlanSvg } from "../src/preview";
import { ProjectError, projectWarnings, readJson } from "../src/validation";

const args = process.argv.slice(2),
  [action, filename] = args;
const usage =
  "Usage: npm run plan -- validate <project.json> | render <project.json> --out <preview.png|preview.svg> | apply <project.json> <commands.json> --out <result.planform.json>";
try {
  if (!["validate", "render", "apply"].includes(action) || !filename)
    throw Error(usage);
  const positional = action === "apply" ? 3 : 2;
  if (
    args.slice(positional).length &&
    !(args.length === positional + 2 && args[positional] === "--out")
  )
    throw Error(usage);
  const output =
    args[positional] === "--out" ? args[positional + 1] : undefined;
  if (action === "validate" && output) throw Error(usage);
  if (action !== "validate" && !output) throw Error(usage);
  if (output && resolve(output) === resolve(filename))
    throw Error("Use a separate output path to preserve the source project.");
  const plan = parseProject(await readFile(filename, "utf8"));
  if (action === "validate") {
    process.stdout.write(
      JSON.stringify(
        {
          ok: true,
          version: plan.version,
          objects: plan.items.length,
          warnings: projectWarnings(plan),
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
    await writeFile(output!, serialize(result.plan) + "\n");
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
