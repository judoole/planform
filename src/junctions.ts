import {
  dist,
  project,
  same,
  type Item,
  type Plan,
  type Point,
  type Wall,
} from "./model";

export const wallEnds = ["a", "b"] as const;
export type WallEnd = (typeof wallEnds)[number];
type WallEndpoint = { wall: Wall; end: WallEnd };
export type EditProtection = (item: Item) => boolean;

export function connectedEndpoints(plan: Plan, point: Point): WallEndpoint[] {
  return plan.items.flatMap((wall) =>
    wall.type === "wall"
      ? wallEnds
          .filter((end) => same(wall[end], point))
          .map((end) => ({ wall, end }))
      : [],
  );
}

function findWall(plan: Plan, id: string): Wall {
  const wall = plan.items.find(
    (item) => item.id === id && item.type === "wall",
  );
  if (!wall || wall.type !== "wall") throw Error(`Wall "${id}" was not found.`);
  return wall;
}

export function checkWallEdits(
  plan: Plan,
  walls: readonly Wall[],
  protectedItem: EditProtection,
) {
  const ids = new Set(walls.map((wall) => wall.id));
  if (!ids.size) return;
  const wall = walls.find(protectedItem);
  if (wall)
    throw Error(
      `Connected wall "${wall.name || wall.id}" is locked or hidden. Unlock or show it before changing its geometry.`,
    );
  const opening = plan.items.find(
    (item) =>
      (item.type === "door" || item.type === "window") &&
      ids.has(item.hostId) &&
      protectedItem(item),
  );
  if (opening)
    throw Error(
      `Attached opening "${opening.name || opening.id}" is locked or hidden. Unlock or show it before changing its wall geometry.`,
    );
}

function assertNewJunction(plan: Plan, id: string) {
  if (
    !id ||
    plan.items.some(
      (i) =>
        i.type === "wall" && wallEnds.some((end) => i.junctions?.[end] === id),
    )
  ) {
    throw Error("Provide a new, unique junction ID.");
  }
}

export function splitWall(
  plan: Plan,
  wallId: string,
  offset: number,
  segmentId: string,
  junctionId: string,
  protectedItem: EditProtection = (item) => Boolean(item.locked),
): Plan {
  const wall = findWall(plan, wallId);
  checkWallEdits(plan, [wall], protectedItem);
  assertNewJunction(plan, junctionId);
  if (!segmentId || plan.items.some((i) => i.id === segmentId))
    throw Error("Provide a new, unique wall segment ID.");

  const length = dist(wall.a, wall.b);
  if (!Number.isFinite(offset) || offset < 0.001 || length - offset < 0.001)
    throw Error("The split must be inside the wall, away from either end.");
  const t = offset / length;
  const point = {
    x: wall.a.x + (wall.b.x - wall.a.x) * t,
    y: wall.a.y + (wall.b.y - wall.a.y) * t,
  };
  const first: Wall = {
    ...wall,
    b: point,
    junctions: {
      ...(wall.junctions?.a ? { a: wall.junctions.a } : {}),
      b: junctionId,
    },
  };
  const second: Wall = {
    ...wall,
    id: segmentId,
    a: point,
    junctions: {
      a: junctionId,
      ...(wall.junctions?.b ? { b: wall.junctions.b } : {}),
    },
  };
  const items = plan.items.flatMap((item): Item[] => {
    if (item.id === wall.id) return [first, second];
    if (
      (item.type !== "door" && item.type !== "window") ||
      item.hostId !== wall.id
    )
      return [item];

    const center = item.t * length;
    if (
      offset > center - item.width / 2 + 1e-6 &&
      offset < center + item.width / 2 - 1e-6
    )
      throw Error(
        `The split passes through "${item.name || item.id}". Choose a point away from the opening.`,
      );
    const host = center < offset ? first : second;
    const hostLength = host === first ? offset : length - offset;
    if (hostLength < 5)
      throw Error("An opening needs a wall segment at least 5 cm long.");
    return [
      {
        ...item,
        hostId: host.id,
        t: (center - (host === first ? 0 : offset)) / hostLength,
      },
    ];
  });
  return { ...plan, items };
}

export function joinWalls(
  plan: Plan,
  sourceWallId: string,
  sourceEnd: WallEnd,
  targetWallId: string,
  targetOffset: number,
  segmentId: string,
  junctionId: string,
  protectedItem: EditProtection = (item) => Boolean(item.locked),
): Plan {
  if (sourceWallId === targetWallId)
    throw Error("Choose a different wall to join.");
  const source = findWall(plan, sourceWallId);
  const target = findWall(plan, targetWallId);
  const length = dist(target.a, target.b);
  if (
    !Number.isFinite(targetOffset) ||
    targetOffset < 0 ||
    targetOffset > length
  )
    throw Error("The join must be on the target wall.");
  assertNewJunction(plan, junctionId);
  const t = targetOffset / length;
  const targetEnd = t === 0 ? "a" : t === 1 ? "b" : undefined;
  const point = targetEnd
    ? target[targetEnd]
    : {
        x: target.a.x + (target.b.x - target.a.x) * t,
        y: target.a.y + (target.b.y - target.a.y) * t,
      };
  const sourceEndpoints = connectedEndpoints(plan, source[sourceEnd]);
  if (
    !same(point, source[sourceEnd]) &&
    sourceEndpoints.some(({ wall }) => wall.id === targetWallId)
  )
    throw Error(
      "This corner already meets the target wall. Choose another source endpoint.",
    );
  const targetEndpoints = connectedEndpoints(plan, point);
  const affected = [...sourceEndpoints, ...targetEndpoints];
  checkWallEdits(
    plan,
    [target, ...affected.map(({ wall }) => wall)],
    protectedItem,
  );
  const split = targetEnd
    ? plan
    : splitWall(
        plan,
        targetWallId,
        targetOffset,
        segmentId,
        junctionId,
        protectedItem,
      );
  const targetJunction = targetEndpoints
    .map(({ wall, end }) => wall.junctions?.[end])
    .find((id) => id !== undefined);
  const id = targetEnd
    ? (target.junctions?.[targetEnd] ?? targetJunction ?? junctionId)
    : junctionId;
  const endpointsByWall = new Map<string, Set<WallEnd>>();
  for (const { wall, end } of affected) {
    // A split retains the old wall ID for the segment containing endpoint a.
    const wallId =
      !targetEnd && wall.id === targetWallId && end === "b"
        ? segmentId
        : wall.id;
    const ends = endpointsByWall.get(wallId) ?? new Set<WallEnd>();
    ends.add(end);
    endpointsByWall.set(wallId, ends);
  }
  return {
    ...split,
    items: split.items.map((item) => {
      const ends = endpointsByWall.get(item.id);
      if (item.type !== "wall" || !ends) return item;
      const result = { ...item, junctions: { ...item.junctions } };
      for (const end of ends) {
        result[end] = point;
        result.junctions[end] = id;
      }
      if (dist(result.a, result.b) < 0.001)
        throw Error(`The join would collapse "${item.name || item.id}".`);
      return result;
    }),
  };
}

export const wallOffsetAtPoint = (point: Point, wall: Wall) =>
  project(point, wall).t * dist(wall.a, wall.b);
