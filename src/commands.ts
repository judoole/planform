import Ajv from "ajv";
import projectSchema from "../public/agent/planform.schema.json";
import commandSchema from "../public/agent/commands.schema.json";
import {
  clone,
  dist,
  same,
  setCorner,
  type Evidence,
  type Item,
  type Plan,
  type Point,
  type Wall,
} from "./model";
import { ProjectError, validateProject } from "./validation";

type Operation =
  | { op: "add"; items: Item[] }
  | {
      op: "opening";
      id: string;
      name: string;
      type: "door" | "window";
      hostId: string;
      offset: number;
      width: number;
      hinge?: number;
      swing?: number;
      evidence?: Evidence;
    }
  | { op: "corner"; wallId: string; end: "a" | "b"; point: Point }
  | { op: "update"; id: string; changes: Record<string, unknown> }
  | { op: "delete"; ids: string[]; cascade?: boolean };
export type CommandBatch = {
  format: "planform-commands";
  version: 1;
  operations: Operation[];
};
const check = new Ajv({ allErrors: true, discriminator: true })
  .addSchema(projectSchema, "planform.schema.json")
  .compile(commandSchema);

/** Atomic: invalid batches throw without changing the input. No automatic opening repairs. */
export function applyCommands(
  input: Plan,
  commands: unknown,
): { plan: Plan; changedIds: string[]; deletedIds: string[] } {
  let plan = validateProject(input);
  const batch = clone(commands);
  if (!check(batch))
    throw new ProjectError(
      (check.errors || []).slice(0, 100).map((e) => ({
        path: e.instancePath,
        code: e.keyword,
        message: e.message || "Invalid command",
      })),
    );
  const changed = new Set<string>(),
    deleted = new Set<string>();
  (batch as CommandBatch).operations.forEach((op, index) => {
    const fail = (message: string): never => {
      throw new ProjectError([
        { path: `/operations/${index}`, code: "command", message },
      ]);
    };
    const find = (id: string) =>
      plan.items.find((i) => i.id === id) ||
      fail(`Object "${id}" does not exist at the top level.`);
    const editable = (id: string) => {
      const item = find(id);
      if (item.locked)
        fail(`Object "${id}" is locked. Unlock it explicitly first.`);
      return item;
    };
    if (op.op === "add") {
      plan.items.push(...op.items);
      op.items.forEach((i) => changed.add(i.id));
    } else if (op.op === "opening") {
      const host = editable(op.hostId);
      if (host.type !== "wall") fail(`Host "${host.id}" must be a wall.`);
      const wall = host as Wall,
        length = dist(wall.a, wall.b);
      if (length < 5) fail("An opening requires a wall at least 5 cm long.");
      plan.items.push({
        id: op.id,
        name: op.name,
        type: op.type,
        hostId: wall.id,
        t: op.offset / length,
        width: op.width,
        hinge: op.hinge ?? 1,
        swing: op.swing ?? 1,
        ...(op.evidence ? { evidence: op.evidence } : {}),
      });
      changed.add(op.id);
    } else if (op.op === "corner") {
      const wall = editable(op.wallId);
      if (wall.type !== "wall") fail("Corner edits require a wall.");
      const old = (wall as Wall)[op.end];
      for (const i of plan.items)
        if (i.type === "wall" && (same(i.a, old) || same(i.b, old))) {
          if (i.locked) fail(`Connected wall "${i.id}" is locked.`);
          changed.add(i.id);
        }
      plan = setCorner(plan, wall.id, op.end, op.point, false);
    } else if (op.op === "update") {
      const item = find(op.id),
        keys = Object.keys(op.changes);
      if (
        keys.some((key) =>
          ["id", "type", "children", "sourceBox", "a", "b"].includes(key),
        )
      )
        fail(
          "Update preserves IDs, types and group structure. Use corner for shared wall endpoints; replace groups explicitly.",
        );
      if (item.locked && !(keys.length === 1 && op.changes.locked === false))
        fail(`Object "${item.id}" is locked. Unlock it explicitly first.`);
      plan.items = plan.items.map((i) =>
        i.id === item.id ? ({ ...i, ...op.changes } as Item) : i,
      );
      changed.add(item.id);
    } else {
      const ids = new Set(op.ids);
      op.ids.forEach(editable);
      const dependents = plan.items.filter(
        (i) =>
          (i.type === "door" || i.type === "window") &&
          ids.has(i.hostId) &&
          !ids.has(i.id),
      );
      if (dependents.length && !op.cascade)
        fail(
          `Deletion would remove attached openings: ${dependents.map((i) => i.id).join(", ")}. Include their IDs or set cascade: true.`,
        );
      dependents.forEach((i) => {
        editable(i.id);
        ids.add(i.id);
      });
      const markDeleted = (i: Item) => {
        deleted.add(i.id);
        changed.delete(i.id);
        if (i.type === "group") i.children?.forEach(markDeleted);
      };
      plan.items.filter((i) => ids.has(i.id)).forEach(markDeleted);
      plan.items = plan.items.filter((i) => !ids.has(i.id));
    }
  });
  return {
    plan: validateProject(plan),
    changedIds: [...changed],
    deletedIds: [...deleted],
  };
}
