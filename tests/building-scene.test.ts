import { Raycaster, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { buildScene } from "../src/buildingScene";
import { emptyPlan, type Opening, type Plan, type Wall } from "../src/model";

const wall = (
  id: string,
  x: number,
  y: number,
  endX: number,
  endY: number,
): Wall => ({
  id,
  type: "wall",
  name: id,
  a: { x, y },
  b: { x: endX, y: endY },
  thickness: 20,
});

describe("3D building scene", () => {
  it("makes hosted openings selectable pass-through geometry", () => {
    const exterior = wall("front", 0, 0, 600, 0);
    const door: Opening = {
      id: "entry",
      name: "Front door",
      type: "door",
      hostId: exterior.id,
      t: 0.5,
      width: 100,
      hinge: 1,
      swing: 1,
      height: 200,
    };
    const plan: Plan = { ...emptyPlan(), items: [exterior, door] };
    const scene = buildScene(plan);
    scene.model.updateMatrixWorld(true);
    const pointAt = (x: number, y: number) =>
      new Raycaster(new Vector3(x, y, 2), new Vector3(0, 0, -1))
        .intersectObject(scene.walls, true)
        .map((hit) => hit.object.userData.itemId);
    expect(pointAt(0, 1)).toContain("entry");
    expect(pointAt(0, 1)).not.toContain("front");
    expect(pointAt(0, 2.2)).toContain("front");
    expect(pointAt(1, 1)).toContain("front");
    scene.dispose();
  });

  it("keeps partitions while using the shared gable geometry", () => {
    const plan: Plan = {
      ...emptyPlan(),
      items: [
        wall("a", 0, 0, 600, 0),
        wall("b", 600, 0, 600, 700),
        wall("c", 600, 700, 0, 700),
        wall("d", 0, 700, 0, 0),
        { ...wall("partition", 300, 0, 300, 700), height: 160 },
      ],
      building: { defaultWallHeight: 260, roof: { type: "gable", pitch: 35 } },
    };
    const scene = buildScene(plan);
    expect(scene.roof.children).toHaveLength(2);
    expect(scene.walls.children.map((mesh) => mesh.userData.itemId)).toContain(
      "partition",
    );
    expect(scene.height).toBeGreaterThan(4);
    const flat = buildScene({ ...plan, building: { roof: { type: "flat" } } });
    expect(flat.roof.children).toHaveLength(1);
    expect(flat.height).toBeLessThan(scene.height);
    scene.dispose();
    flat.dispose();
  });
});
