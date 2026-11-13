import Ajv from "ajv";
import { buildingGeometry } from "./building";
import schema from "../public/agent/planform.schema.json";
import comparisonSchema from "../public/agent/comparison.schema.json";
import projectSchema from "../public/agent/project.schema.json";
import type { Item, Plan, RectItem, Wall } from "./model";
import {
  asMultiProject,
  MAX_PROPOSALS,
  planVersions,
  type ComparisonProject,
  type MultiPlanProject,
  type Project,
} from "./project";

export type Issue = {
  path: string;
  code: string;
  message: string;
  objectId?: string;
};
export class ProjectError extends Error {
  readonly issues: Issue[];
  constructor(issues: Issue[]) {
    super(
      issues
        .map(
          (i) =>
            `${i.path || "/"}${i.objectId ? ` (${i.objectId})` : ""}: ${i.message}`,
        )
        .join("\n"),
    );
    this.name = "ProjectError";
    this.issues = issues;
  }
}
const ajv = new Ajv({
  allErrors: true,
  useDefaults: true,
  discriminator: true,
}).addSchema(schema, "planform.schema.json");
const validateSchema = ajv.getSchema("planform.schema.json")!;
const validateComparisonSchema = ajv.compile(comparisonSchema);
const validateMultiSchema = ajv.compile(projectSchema);
const length = (w: Wall) => Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y);

// Bound recursion before cloning or handing the drawing to the schema validator.
function guardDrawing(input: unknown, path: string) {
  let count = 0;
  function guard(value: unknown, depth = 0) {
    if (!Array.isArray(value)) return;
    if (depth > 15 || (count += value.length) > 50000)
      throw new ProjectError([
        {
          path: path + "/items",
          code: "limit",
          message: "Drawings allow 50,000 total objects and 15 group levels.",
        },
      ]);
    for (const item of value)
      if (item && typeof item === "object") guard(item.children, depth + 1);
  }
  guard((input as Plan | null)?.items);
}

function validateStructure(input: unknown, validate: typeof validateSchema) {
  if (!validate(input)) {
    throw new ProjectError(
      (validate.errors || []).slice(0, 100).map((e) => ({
        path:
          e.instancePath +
          (e.keyword === "required"
            ? `/${e.params.missingProperty}`
            : e.keyword === "additionalProperties"
              ? `/${e.params.additionalProperty}`
              : ""),
        code: e.keyword,
        message:
          e.keyword === "discriminator"
            ? "Unknown object type. Use walls, doors, windows, furniture, stairs, text, dimensions or symbol groups; SVG vectors are no longer supported."
            : e.message || "Invalid value",
      })),
    );
  }
}

/** Strict and non-destructive. Defaults are filled on a clone; geometry is never repaired. */
export function validateProject(input: unknown): Plan {
  guardDrawing(input, "");
  const plan = structuredClone(input) as Plan;
  validateStructure(plan, validateSchema);
  validateRelationships(plan, "");
  return plan;
}

function validateRelationships(plan: Plan, path: string) {
  const issues: Issue[] = [];
  const all = new Map<string, Item>();
  function walk(items: Item[], path: string) {
    items.forEach((item, n) => {
      const here = `${path}/${n}`;
      const issue = (field: string, code: string, message: string) =>
        issues.push({ path: here + field, code, message, objectId: item.id });
      if (all.has(item.id))
        issue(
          "/id",
          "duplicate_id",
          "Object IDs must be unique throughout the document.",
        );
      all.set(item.id, item);
      if (
        (item.type === "wall" || item.type === "dimension") &&
        length(item as Wall) < 0.001
      )
        issue(
          "/b",
          "zero_length",
          "Endpoints must be at least 0.001 cm apart.",
        );
      if (item.type === "group") walk(item.children!, `${here}/children`);
    });
  }
  walk(plan.items, path + "/items");
  const walls = new Map(
    plan.items
      .filter((i): i is Wall => i.type === "wall")
      .map((w) => [w.id, w]),
  );
  const occupied = new Map<
    string,
    { start: number; end: number; id: string }[]
  >();
  plan.items.forEach((item, n) => {
    if (item.type !== "door" && item.type !== "window") return;
    const fail = (field: string, code: string, message: string) =>
      issues.push({
        path: `${path}/items/${n}/${field}`,
        code,
        message,
        objectId: item.id,
      });
    const wall = walls.get(item.hostId);
    if (!wall) {
      fail(
        "hostId",
        "missing_host",
        `Host "${item.hostId}" must identify a top-level wall.`,
      );
      return;
    }
    const size = length(wall),
      center = item.t * size,
      start = center - item.width / 2,
      end = center + item.width / 2;
    if (size < 5 || item.width < 1 || start < -1e-6 || end > size + 1e-6)
      fail(
        "width",
        "opening_outside_wall",
        `Opening must be at least 1 cm wide and fit entirely on its wall (length ${size} cm, center ${center} cm; host minimum 5 cm).`,
      );
    const spans = occupied.get(wall.id) || [];
    for (const span of spans)
      if (start < span.end - 1e-6 && end > span.start + 1e-6)
        fail(
          "t",
          "overlapping_opening",
          `Opening overlaps "${span.id}" on wall "${wall.id}".`,
        );
    spans.push({ start, end, id: item.id });
    occupied.set(wall.id, spans);
  });
  if (issues.length) throw new ProjectError(issues);
}

function isComparison(input: unknown): input is ComparisonProject {
  const p = input as Partial<ComparisonProject> | null;
  return p?.format === "planform" && p.version === 3;
}

function validateComparison(input: ComparisonProject): ComparisonProject {
  for (const version of planVersions)
    guardDrawing(input.plans?.[version], `/plans/${version}`);
  const project = structuredClone(input);
  validateStructure(project, validateComparisonSchema);
  for (const version of planVersions)
    validateRelationships(project.plans[version], `/plans/${version}`);
  return project;
}

function isMultiProject(input: unknown): input is MultiPlanProject {
  const p = input as Partial<MultiPlanProject> | null;
  return p?.format === "planform" && p.version === 4;
}

function validateMultiProject(input: MultiPlanProject): MultiPlanProject {
  if (Array.isArray(input.drawings)) {
    if (input.drawings.length > MAX_PROPOSALS + 1)
      throw new ProjectError([
        {
          path: "/drawings",
          code: "limit",
          message: `Projects allow one Existing drawing and up to ${MAX_PROPOSALS} proposals.`,
        },
      ]);
    input.drawings.forEach((d, i) =>
      guardDrawing(d?.plan, `/drawings/${i}/plan`),
    );
  }
  const project = structuredClone(input);
  validateStructure(project, validateMultiSchema);
  const issues: Issue[] = [];
  const ids = new Set<string>();
  project.drawings.forEach((d, i) => {
    if (ids.has(d.id))
      issues.push({
        path: `/drawings/${i}/id`,
        code: "duplicate_id",
        message: "Drawing IDs must be unique.",
      });
    ids.add(d.id);
  });
  if (project.drawings.filter((d) => d.role === "existing").length !== 1)
    issues.push({
      path: "/drawings",
      code: "existing_count",
      message: "Projects require exactly one Existing drawing.",
    });
  if (!ids.has(project.active))
    issues.push({
      path: "/active",
      code: "missing_drawing",
      message: "Active must reference a drawing ID.",
    });
  if (issues.length) throw new ProjectError(issues);
  project.drawings.forEach((d, i) =>
    validateRelationships(d.plan, `/drawings/${i}/plan`),
  );
  return project;
}

export function validateProjectFile(project: Project): Project {
  if (isMultiProject(project)) return validateMultiProject(project);
  if (isComparison(project)) return asMultiProject(validateComparison(project));
  return validateProject(project);
}

export function checkJsonSize(text: string) {
  if (new TextEncoder().encode(text).length > 15_000_000)
    throw new ProjectError([
      {
        path: "/",
        code: "file_size",
        message: "JSON files must be smaller than 15 MB.",
      },
    ]);
}

export function readJson(text: string): unknown {
  checkJsonSize(text);
  let input;
  try {
    input = JSON.parse(text);
  } catch {
    throw new ProjectError([
      {
        path: "/",
        code: "json",
        message: "Invalid JSON. Check commas, quotes and brackets.",
      },
    ]);
  }
  return input;
}

export function readProject(text: string): Plan {
  const input = readJson(text);
  if (isComparison(input) || isMultiProject(input))
    throw new ProjectError([
      {
        path: "/version",
        code: "comparison_project",
        message:
          "This file is a multi-drawing project. Use Open project to load all drawings.",
      },
    ]);
  return readSinglePlan(input);
}

export function readProjectFile(text: string): Project {
  const input = readJson(text);
  if (isMultiProject(input)) return validateMultiProject(input);
  return isComparison(input)
    ? asMultiProject(validateComparison(input))
    : readSinglePlan(input);
}

function readSinglePlan(value: unknown): Plan {
  let input = value as Record<string, any> | null;
  if (input?.format === "planform" && input.version === 1) {
    let legacyCount = 0;
    function hasVectors(items: unknown, depth = 0): boolean {
      if (!Array.isArray(items)) return false;
      if (depth > 15 || (legacyCount += items.length) > 50000)
        throw new ProjectError([
          {
            path: "/items",
            code: "limit",
            message: "Legacy project exceeds the object or group-depth limit.",
          },
        ]);
      return items.some(
        (i) => i && (i.type === "vector" || hasVectors(i.children, depth + 1)),
      );
    }
    // Guard the old document too; never discard legacy vectors or overwrite their recovery file.
    if (
      hasVectors(input.items) ||
      (typeof input.defs === "string" && input.defs.trim()) ||
      input.papers?.length
    )
      throw new ProjectError([
        {
          path: "/version",
          code: "legacy_vectors",
          message:
            "This legacy project contains SVG reference geometry. SVG import and editing have been removed. Keep the original file; reconstruct its architecture as a v2 project.",
        },
      ]);
    const { defs: _defs, papers: _papers, ...architecture } = input;
    input = { ...architecture, version: 2 };
  }
  return validateProject(input);
}

export function projectWarnings(plan: Plan): string[] {
  const notes = [...(plan.source?.notes || [])];
  let estimated = 0;
  function count(items: Item[]) {
    for (const i of items) {
      if (i.evidence?.basis === "estimated") estimated++;
      if (i.type === "group") count((i as RectItem).children!);
    }
  }
  count(plan.items);
  if (estimated)
    notes.unshift(
      `${estimated} object(s) contain estimated geometry. Check their source notes before relying on dimensions.`,
    );
  if (!plan.calibration.calibrated)
    notes.unshift(
      "Scale is unconfirmed. Calibrate against a known real measurement.",
    );
  if (
    plan.calibration.calibrated &&
    (plan.building ||
      plan.items.some(
        (item) =>
          (item.type === "wall" && item.height !== undefined) ||
          ((item.type === "door" || item.type === "window") &&
            (item.height !== undefined || item.sill !== undefined)),
      ))
  )
    notes.push(...buildingGeometry(plan).issues.map(({ message }) => message));
  return notes;
}
