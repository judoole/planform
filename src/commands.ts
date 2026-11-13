import Ajv from "ajv";
import projectSchema from "../public/agent/planform.schema.json";
import commandSchema from "../public/agent/commands.schema.json";
import {
  clone,
  dist,
  setCorner,
  type Evidence,
  type Item,
  type Opening,
  type Plan,
  type Point,
  type Wall,
} from "./model";
import { isItemLocked, isLayerLocked } from "./layers";
import { ProjectError, validateProject } from "./validation";
import {
  connectedEndpoints,
  joinWalls,
  splitWall,
  type WallEnd,
} from "./junctions";

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
      style?: Opening["style"];
      slideDirection?: Opening["slideDirection"];
      evidence?: Evidence;
    }
  | { op: "corner"; wallId: string; end: "a" | "b"; point: Point }
  | {
      op: "splitWall";
      wallId: string;
      offset: number;
      segmentId: string;
      junctionId: string;
    }
  | {
      op: "joinWalls";
      sourceWallId: string;
      sourceEnd: WallEnd;
      targetWallId: string;
      targetOffset: number;
      segmentId: string;
      junctionId: string;
    }
  | { op: "update"; id: string; changes: Record<string, unknown> }
  | { op: "setExteriorDimensions"; show: boolean }
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
    const protectedItem = (item: Item) => isItemLocked(plan, item);
    const editable = (id: string) => {
      const item = find(id);
      if (isItemLocked(plan, item))
        fail(`Object "${id}" is locked. Unlock it explicitly first.`);
      return item;
    };
    if (op.op === "add") {
      plan.items.push(...op.items);
      const locked = op.items.find((item) => isLayerLocked(plan, item));
      if (locked) fail(`Object "${locked.id}" belongs to a locked layer.`);
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
        ...(op.style === undefined ? {} : { style: op.style }),
        ...(op.slideDirection === undefined
          ? {}
          : { slideDirection: op.slideDirection }),
        ...(op.evidence ? { evidence: op.evidence } : {}),
      });
      changed.add(op.id);
    } else if (op.op === "corner") {
      const wall = editable(op.wallId);
      if (wall.type !== "wall") fail("Corner edits require a wall.");
      const old = (wall as Wall)[op.end];
      for (const { wall: connected } of connectedEndpoints(plan, old))
        changed.add(connected.id);
      try {
        plan = setCorner(plan, wall.id, op.end, op.point, false, protectedItem);
      } catch (error) {
        fail((error as Error).message);
      }
    } else if (op.op === "splitWall" || op.op === "joinWalls") {
      const previous = new Set(plan.items);
      try {
        plan =
          op.op === "splitWall"
            ? splitWall(
                plan,
                op.wallId,
                op.offset,
                op.segmentId,
                op.junctionId,
                protectedItem,
              )
            : joinWalls(
                plan,
                op.sourceWallId,
                op.sourceEnd,
                op.targetWallId,
                op.targetOffset,
                op.segmentId,
                op.junctionId,
              );
      } catch (error) {
        fail((error as Error).message);
      }
      plan.items
        .filter((item) => !previous.has(item))
        .forEach((item) => changed.add(item.id));
    } else if (op.op === "update") {
      const item = find(op.id),
        keys = Object.keys(op.changes);
      if (
        keys.some((key) =>
          [
            "id",
            "type",
            "children",
            "sourceBox",
            "a",
            "b",
            "junctions",
          ].includes(key),
        )
      )
        fail(
          "Update preserves IDs, types and group structure. Use corner for shared wall endpoints; replace groups explicitly.",
        );
      if (
        isItemLocked(plan, item) &&
        !(
          item.locked &&
          !isLayerLocked(plan, item) &&
          keys.length === 1 &&
          op.changes.locked === false
        )
      )
        fail(`Object "${item.id}" is locked. Unlock it explicitly first.`);
      const updated = { ...item, ...op.changes } as Item;
      if (isLayerLocked(plan, updated)) fail(`Destination layer is locked.`);
      if (item.type === "wall" && keys.includes("thickness"))
        plan.items.forEach((dependent) => {
          if (
            (dependent.type === "door" || dependent.type === "window") &&
            dependent.hostId === item.id
          )
            editable(dependent.id);
        });
      plan.items = plan.items.map((i) => (i.id === item.id ? updated : i));
      changed.add(item.id);
    } else if (op.op === "setExteriorDimensions") {
      plan.showExteriorDimensions = op.show;
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
