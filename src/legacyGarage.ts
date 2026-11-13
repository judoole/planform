import { exteriorDimensionSegments } from "./exterior";
import { garageFootprint } from "./garage";
import { angle, dist, type Plan } from "./model";
import type { BuildingSettings } from "./building";

/** Read the permit draft's vertical measurements into the shared building model. */
export function adoptLegacyGarageMeasurements(plan: Plan): Plan {
  const previous = plan.garage?.structure;
  if (plan.building || !previous) return plan;
  const { floor, wallHeight, roofPitch, roofThickness, ridge, openings } =
    previous;
  const building: BuildingSettings = {};
  if (floor !== undefined) building.floorLevel = floor;
  if (wallHeight !== undefined) building.defaultWallHeight = wallHeight;
  if (
    roofPitch !== undefined ||
    roofThickness !== undefined ||
    ridge !== undefined
  ) {
    const direction = legacyRidgeDirection(plan, ridge);
    building.roof = {
      type: "gable",
      ...(roofPitch !== undefined ? { pitch: roofPitch } : {}),
      ...(roofThickness !== undefined ? { thickness: roofThickness } : {}),
      ...(direction !== undefined ? { direction } : {}),
    };
  }
  if (!Object.keys(building).length && !Object.keys(openings ?? {}).length)
    return plan;

  return {
    ...plan,
    building,
    items: openings
      ? plan.items.map((item) => {
          if (
            (item.type !== "door" && item.type !== "window") ||
            !Object.hasOwn(openings, item.id)
          )
            return item;
          const previous = openings[item.id];
          return {
            ...item,
            ...(item.height === undefined && previous.height !== undefined
              ? { height: previous.height }
              : {}),
            ...(item.sill === undefined && previous.sill !== undefined
              ? { sill: previous.sill }
              : {}),
          };
        })
      : plan.items,
  };
}

function legacyRidgeDirection(plan: Plan, ridge = "long") {
  try {
    const [first, second] = exteriorDimensionSegments(
      garageFootprint(plan).corners,
    );
    const firstIsLong = dist(...first) >= dist(...second);
    const direction = angle(
      ...(firstIsLong === (ridge === "long") ? first : second),
    );
    return (direction + 360) % 360;
  } catch {
    // The old ridge option described a side of a valid rectangle. Keep it in
    // the legacy fields when it has no direction to resolve.
    return undefined;
  }
}
