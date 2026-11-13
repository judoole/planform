import {
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  GridHelper,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShapeUtils,
  Vector2,
  type Material,
} from "three";
import {
  buildingGeometry,
  wallTopAt,
  type BuildingOpening,
  type BuildingWall,
} from "./building";
import type { Plan, Point } from "./model";

type Building = ReturnType<typeof buildingGeometry>;
type Roof = NonNullable<Building["roof"]>;
type Point3 = Point & { z: number };

type Side = { a: Point; b: Point };
type WallSides = [Side, Side];

const epsilon = 1e-6;
const add = (a: Point, b: Point): Point => ({ x: a.x + b.x, y: a.y + b.y });
const subtract = (a: Point, b: Point): Point => ({
  x: a.x - b.x,
  y: a.y - b.y,
});
const multiply = (p: Point, scale: number): Point => ({
  x: p.x * scale,
  y: p.y * scale,
});
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const interpolate = (a: Point, b: Point, t: number) =>
  add(a, multiply(subtract(b, a), t));

function wallSides(building: Building) {
  const walls = new Map<string, WallSides>();
  const centers = new Map<string, BuildingWall["wall"]>();
  for (const { wall } of building.walls) {
    const span = subtract(wall.b, wall.a);
    const half = wall.thickness / (2 * Math.hypot(span.x, span.y));
    const n = multiply({ x: span.y, y: -span.x }, half);
    walls.set(wall.id, [
      { a: add(wall.a, n), b: add(wall.b, n) },
      { a: subtract(wall.a, n), b: subtract(wall.b, n) },
    ]);
    centers.set(wall.id, wall);
  }

  // Use the architectural outside face and its mirrored inside face at shell
  // corners. Along a split wall, preserve the centerline stations of openings.
  const shell = building.footprint;
  shell?.edgeWallIds.forEach((ids, i) => {
    const a = shell.corners[i];
    const b = shell.corners[(i + 1) % shell.corners.length];
    const edge = subtract(b, a);
    const members = ids.flatMap((id) => {
      const wall = centers.get(id);
      return wall ? [wall] : [];
    });
    members.sort((first, second) =>
      dot(subtract(add(first.a, first.b), add(second.a, second.b)), edge),
    );
    for (const [wall, corner, leading] of [
      [members[0], a, true],
      [members.at(-1), b, false],
    ] as const) {
      if (!wall) continue;
      const sides = walls.get(wall.id)!;
      const forward = dot(subtract(wall.b, wall.a), edge) > 0;
      const endpoint = leading === forward ? "a" : "b";
      sides[forward ? 0 : 1][endpoint] = corner;
      sides[forward ? 1 : 0][endpoint] = subtract(
        multiply(wall[endpoint], 2),
        corner,
      );
    }
  });
  return walls;
}

class Surface {
  private positions: number[] = [];

  constructor(private origin: Point3) {}

  polygon(points: Point3[]) {
    if (points.length < 3) return;
    // Wall strips are convex. Roof facets and the slab use plan-coordinate
    // triangulation so long or angled polygon sides retain their vertices.
    for (let i = 1; i < points.length - 1; i++)
      this.triangle(points[0], points[i], points[i + 1]);
  }

  horizontal(points: Point3[], top: boolean) {
    const triangles = ShapeUtils.triangulateShape(
      points.map((point) => new Vector2(point.x, point.y)),
      [],
    );
    for (const [a, b, c] of triangles)
      this.triangle(points[a], points[top ? b : c], points[top ? c : b]);
  }

  private triangle(a: Point3, b: Point3, c: Point3) {
    for (const p of [a, b, c]) {
      this.positions.push(
        (p.x - this.origin.x) / 100,
        (p.z - this.origin.z) / 100,
        -(p.y - this.origin.y) / 100,
      );
    }
  }

  mesh(material: Material) {
    if (!this.positions.length) return;
    const geometry = new BufferGeometry();
    geometry.setAttribute(
      "position",
      new BufferAttribute(new Float32Array(this.positions), 3),
    );
    geometry.computeVertexNormals();
    return new Mesh(geometry, material);
  }
}

function crossSection(
  wall: BuildingWall["wall"],
  sides: WallSides,
  station: number,
): [Point, Point] {
  if (station <= 0) return [sides[0].a, sides[1].a];
  if (station >= 1) return [sides[0].b, sides[1].b];
  const middle = interpolate(wall.a, wall.b, station);
  const span = subtract(wall.b, wall.a);
  const half = wall.thickness / (2 * Math.hypot(span.x, span.y));
  const n = multiply({ x: span.y, y: -span.x }, half);
  return [add(middle, n), subtract(middle, n)];
}

type WallCut = {
  start: number;
  end: number;
  opening: BuildingOpening;
};

function wallCuts(record: BuildingWall) {
  const length = Math.hypot(
    record.wall.b.x - record.wall.a.x,
    record.wall.b.y - record.wall.a.y,
  );
  return record.openings
    .flatMap((opening): WallCut[] => {
      if (!opening.fits) return [];
      const half = opening.opening.width / (2 * length);
      return [
        {
          opening,
          start: Math.max(0, opening.opening.t - half),
          end: Math.min(1, opening.opening.t + half),
        },
      ];
    })
    .sort((a, b) => a.start - b.start);
}

function dividerStations(
  wall: BuildingWall["wall"],
  sides: WallSides,
  roof?: Roof,
) {
  if (!roof?.ridge) return [];
  const [a, b] = roof.ridge;
  const ridge = subtract(b, a);
  const length = subtract(wall.b, wall.a);
  const lengthSquared = dot(length, length);
  const stations = sides
    .flatMap((edge) => {
      const vector = subtract(edge.b, edge.a);
      const det = cross(vector, ridge);
      if (Math.abs(det) <= epsilon) return [];
      const t = cross(subtract(a, edge.a), ridge) / det;
      if (t <= epsilon || t >= 1 - epsilon) return [];
      const intersection = interpolate(edge.a, edge.b, t);
      return [dot(subtract(intersection, wall.a), length) / lengthSquared];
    })
    .filter((t) => t > epsilon && t < 1 - epsilon);
  return stations;
}

function wallStrip(
  surface: Surface,
  start: [Point, Point],
  end: [Point, Point],
  bottom: (point: Point) => number,
  top: (point: Point) => number,
) {
  const outline = [start[0], end[0], end[1], start[1]];
  const floor = outline.map((point) => ({ ...point, z: bottom(point) }));
  const ceiling = outline.map((point) => ({ ...point, z: top(point) }));
  if (ceiling.every((point, i) => point.z - floor[i].z <= epsilon)) return;
  surface.polygon(floor);
  surface.polygon([...ceiling].reverse());
  for (let i = 0; i < 4; i++) {
    const next = (i + 1) % 4;
    surface.polygon([floor[i], ceiling[i], ceiling[next], floor[next]]);
  }
}

function addWall(
  group: Group,
  record: BuildingWall,
  sides: WallSides,
  origin: Point3,
  roof: Roof | undefined,
  styles: SceneMaterials,
) {
  const { wall, bottom } = record;
  const surface = new Surface(origin);
  const cuts = wallCuts(record);
  const stations = [0, 1, ...dividerStations(wall, sides, roof)];
  for (const cut of cuts) stations.push(cut.start, cut.end);
  stations.sort((a, b) => a - b);
  let cutIndex = 0;
  const low = () => bottom;
  const high = (point: Point) => wallTopAt(record, point, roof);
  for (let i = 0; i < stations.length - 1; i++) {
    const a = stations[i];
    const b = stations[i + 1];
    if (b - a <= epsilon) continue;
    const midpoint = (a + b) / 2;
    while (cuts[cutIndex]?.end < midpoint) cutIndex++;
    const opening = cuts[cutIndex];
    const start = crossSection(wall, sides, a);
    const end = crossSection(wall, sides, b);
    if (opening && opening.start < midpoint) {
      wallStrip(surface, start, end, low, () => opening.opening.bottom);
      wallStrip(surface, start, end, () => opening.opening.top, high);
    } else {
      wallStrip(surface, start, end, low, high);
    }
  }
  const mesh = surface.mesh(styles.wall);
  if (mesh) {
    mesh.userData.itemId = wall.id;
    group.add(mesh);
  }

  for (const { opening, start, end } of cuts) {
    addOpening(group, wall, opening, start, end, origin, styles);
  }
}

function addOpening(
  group: Group,
  wall: BuildingWall["wall"],
  record: BuildingOpening,
  start: number,
  end: number,
  origin: Point3,
  styles: SceneMaterials,
) {
  const middle = interpolate(wall.a, wall.b, (start + end) / 2);
  const span = subtract(wall.b, wall.a);
  const length = Math.hypot(span.x, span.y);
  const width = (end - start) * length;
  const depth = Math.max(0.5, Math.min(wall.thickness * 0.5, 5));
  const trim = Math.min(3.5, width / 8, record.height / 8);
  const frame = new Group();
  frame.rotation.y = Math.atan2(span.y, span.x);
  frame.position.set(
    (middle.x - origin.x) / 100,
    (record.bottom - origin.z) / 100,
    -(middle.y - origin.y) / 100,
  );
  function piece(
    w: number,
    h: number,
    d: number,
    x: number,
    y: number,
    material: Material,
  ) {
    const mesh = new Mesh(new BoxGeometry(w / 100, h / 100, d / 100), material);
    mesh.position.set(x / 100, y / 100, 0);
    mesh.userData.itemId = record.opening.id;
    frame.add(mesh);
  }
  const material =
    record.opening.type === "window" ? styles.window : styles.door;
  piece(
    trim,
    record.height,
    depth,
    (-width + trim) / 2,
    record.height / 2,
    material,
  );
  piece(
    trim,
    record.height,
    depth,
    (width - trim) / 2,
    record.height / 2,
    material,
  );
  piece(width - 2 * trim, trim, depth, 0, record.height - trim / 2, material);
  if (record.opening.type === "window")
    piece(width - 2 * trim, trim, depth, 0, trim / 2, material);
  // A raycast target for the full air opening lets the user select it directly.
  piece(
    width - 2 * trim,
    record.height - 2 * trim,
    0.05,
    0,
    record.height / 2,
    styles.pick,
  );
  group.add(frame);
}

function addSlab(
  target: Group,
  outline: Point3[],
  thickness: number,
  origin: Point3,
  material: Material,
) {
  if (outline.length < 3) return;
  const surface = new Surface(origin);
  const top = outline.map((point) => ({ ...point, z: point.z + thickness }));
  surface.horizontal(outline, false);
  surface.horizontal(top, true);
  for (let i = 0; i < outline.length; i++) {
    const next = (i + 1) % outline.length;
    surface.polygon([outline[i], outline[next], top[next], top[i]]);
  }
  const mesh = surface.mesh(material);
  if (mesh) target.add(mesh);
}

function sceneMaterials() {
  const solid = (color: string) =>
    new MeshStandardMaterial({ color, roughness: 0.76, side: DoubleSide });
  return {
    wall: solid("#dce6db"),
    slab: solid("#cdc8b5"),
    roof: solid("#42675e"),
    window: solid("#498693"),
    door: solid("#8a775b"),
    selection: solid("#d49c56"),
    pick: new MeshBasicMaterial({ visible: false }),
  };
}
type SceneMaterials = ReturnType<typeof sceneMaterials>;

export function buildScene(plan: Plan) {
  const building = buildingGeometry(plan);
  const model = new Group();
  const roof = new Group();
  const walls = new Group();
  model.add(walls, roof);
  const materials = sceneMaterials();

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let top = building.floorLevel;
  for (const wall of building.walls) {
    for (const point of [wall.wall.a, wall.wall.b]) {
      const radius = wall.wall.thickness / 2;
      minX = Math.min(minX, point.x - radius);
      maxX = Math.max(maxX, point.x + radius);
      minY = Math.min(minY, point.y - radius);
      maxY = Math.max(maxY, point.y + radius);
    }
    top = Math.max(top, wall.top);
  }
  for (const facet of building.roof?.facets ?? []) {
    for (const point of facet) {
      minX = Math.min(minX, point.x);
      maxX = Math.max(maxX, point.x);
      minY = Math.min(minY, point.y);
      maxY = Math.max(maxY, point.y);
      top = Math.max(top, point.z + building.roof!.verticalThickness);
    }
  }
  const empty = building.walls.length === 0;
  const origin: Point3 = {
    x: empty ? 0 : (minX + maxX) / 2,
    y: empty ? 0 : (minY + maxY) / 2,
    z: building.floorLevel,
  };
  const height = (top - origin.z) / 100;
  const span = empty
    ? 6
    : Math.max(1, (maxX - minX) / 100, (maxY - minY) / 100, height);
  const sides = wallSides(building);
  for (const wall of building.walls)
    addWall(
      walls,
      wall,
      sides.get(wall.wall.id)!,
      origin,
      building.roof,
      materials,
    );
  if (building.footprint) {
    addSlab(
      model,
      building.footprint.corners.map((point) => ({
        ...point,
        z: origin.z - 12,
      })),
      12,
      origin,
      materials.slab,
    );
  }
  for (const face of building.roof?.facets ?? [])
    addSlab(
      roof,
      face,
      building.roof!.verticalThickness,
      origin,
      materials.roof,
    );

  if (!empty) {
    const gridSize = Math.max(10, Math.ceil(span * 2));
    const grid = new GridHelper(
      gridSize,
      Math.min(80, gridSize * 2),
      "#d3ddd4",
      "#e1e9e0",
    );
    grid.position.y = -0.125;
    model.add(grid);
  }

  function select(ids: string[]) {
    const selected = new Set(ids);
    walls.traverse((object) => {
      if (!(object instanceof Mesh) || object.material === materials.pick)
        return;
      object.userData.defaultMaterial ??= object.material;
      object.material = selected.has(object.userData.itemId)
        ? materials.selection
        : object.userData.defaultMaterial;
    });
  }

  return {
    model,
    roof,
    walls,
    empty,
    height,
    span,
    select,
    issues: building.issues,
    dispose() {
      model.traverse((object) => {
        if (object instanceof Mesh || object instanceof GridHelper)
          object.geometry.dispose();
        if (object instanceof GridHelper) {
          const mats = Array.isArray(object.material)
            ? object.material
            : [object.material];
          mats.forEach((material) => material.dispose());
        }
      });
      Object.values(materials).forEach((material) => material.dispose());
    },
  };
}
