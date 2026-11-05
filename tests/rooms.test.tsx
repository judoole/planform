import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  type Point,
  type Wall,
  type Plan,
  emptyPlan,
  setCorner,
  removeItems,
  calibrate,
  serialize,
  parseProject,
  History,
  rotate,
} from "../src/model";
import { findRooms, formatRoomArea } from "../src/rooms";
import { RoomLabels } from "../src/Drawing";
import Properties from "../src/Properties";
import { exportSvg } from "../src/exports";
import { renderPlanSvg } from "../src/preview";

function wall(a: Point, b: Point, thickness = 20): Wall {
  return {
    id: crypto.randomUUID(),
    type: "wall",
    name: "Wall",
    a,
    b,
    thickness,
  };
}
function loop(points: Point[], thickness = 20): Wall[] {
  return points.map((p, n) =>
    wall(p, points[(n + 1) % points.length], thickness),
  );
}
function rectangle(x = 0, y = 0, w = 500, h = 400): Wall[] {
  return loop([
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h },
  ]);
}
const plan = (): Plan => ({ ...emptyPlan(), items: rectangle() });

describe("automatic enclosed room areas", () => {
  it("measures the floor inside walls in cm² and displays m²", () => {
    const [room] = findRooms(rectangle());
    expect(room.areaCm2).toBeCloseTo(480 * 380);
    expect(room.label).toEqual({ x: 250, y: 200 });
    expect(formatRoomArea(room.areaCm2)).toBe("18.24 m²");
    expect(formatRoomArea(1)).toBe("< 0.01 m²");
  });

  it("uses each wall's thickness and excludes spaces filled by walls", () => {
    const walls = rectangle();
    walls[0].thickness = 40;
    expect(findRooms(walls)[0].areaCm2).toBeCloseTo(480 * 370);
    expect(findRooms(rectangle(0, 0, 15, 15))).toEqual([]);
  });

  it("ignores empty plans, open boundaries and zero-length walls", () => {
    expect(findRooms([])).toEqual([]);
    expect(findRooms(rectangle().slice(0, 3))).toEqual([]);
    const walls = rectangle();
    walls[3].b = { x: 0, y: 100 };
    expect(findRooms(walls)).toEqual([]);
    expect(
      findRooms([...rectangle(), wall({ x: 100, y: 100 }, { x: 100, y: 100 })]),
    ).toHaveLength(1);
  });

  it("recognizes shared walls, T-junctions and crossing dividers", () => {
    const walls = [
      ...rectangle(0, 0, 800, 400),
      wall({ x: 400, y: 0 }, { x: 400, y: 400 }),
    ];
    const rooms = findRooms(walls);
    expect(rooms).toHaveLength(2);
    expect(rooms.map((r) => r.areaCm2)).toEqual([380 * 380, 380 * 380]);
    const fourRooms = findRooms([
      ...walls,
      wall({ x: 0, y: 200 }, { x: 800, y: 200 }),
    ]);
    expect(fourRooms).toHaveLength(4);
    for (const room of fourRooms) expect(room.areaCm2).toBeCloseTo(380 * 180);
  });

  it("recognizes disconnected rooms without counting the outside", () => {
    const rooms = findRooms([...rectangle(), ...rectangle(700, 0, 300, 300)]);
    expect(rooms).toHaveLength(2);
    expect(rooms.map((r) => r.areaCm2)).toEqual([480 * 380, 280 * 280]);
  });

  it("handles rotated and triangular rooms rather than bounding-box areas", () => {
    const walls = rectangle().map((w) => ({
      ...w,
      a: rotate(w.a, 37),
      b: rotate(w.b, 37),
    }));
    const rooms = findRooms(walls);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].areaCm2).toBeCloseTo(480 * 380);
    const triangle = findRooms(
      loop([
        { x: 0, y: 0 },
        { x: 400, y: 0 },
        { x: 0, y: 300 },
      ]),
    );
    // A 3-4-5 triangle has inradius 100 cm. Insetting 10 cm scales it by 0.9.
    expect(triangle).toHaveLength(1);
    expect(triangle[0].areaCm2).toBeCloseTo(60_000 * 0.9 ** 2);
  });

  it("places the label inside a concave room and accounts for its rounded corner", () => {
    const [room] = findRooms(
      loop([
        { x: 0, y: 0 },
        { x: 600, y: 0 },
        { x: 600, y: 200 },
        { x: 200, y: 200 },
        { x: 200, y: 600 },
        { x: 0, y: 600 },
      ]),
    );
    // Two 580 × 180 strips, less their 180 × 180 overlap, plus the rounded join.
    expect(room.areaCm2 / 10_000).toBeCloseTo(
      (2 * 580 * 180 - 180 * 180 + 100 - (Math.PI * 100) / 4) / 10_000,
      4,
    );
    expect(room.label.x < 190 || room.label.y < 190).toBe(true);
    expect(room.clearance).toBeGreaterThan(0);
  });

  it("subtracts isolated wall footprints and nested enclosures without double counting", () => {
    const outer = rectangle(0, 0, 800, 800);
    const inner = rectangle(300, 300, 200, 200);
    const rooms = findRooms([...outer, ...inner]);
    expect(rooms).toHaveLength(2);
    // Outer room has a hole containing the entire inner enclosure, including walls.
    const expected = 780 * 780 - (220 * 220 - (4 - Math.PI) * 100) + 180 * 180;
    expect(rooms.reduce((sum, r) => sum + r.areaCm2, 0)).toBeCloseTo(
      expected,
      -1,
    );
    expect(rooms[0].polygon).toHaveLength(2);
    expect(
      rooms[0].label.x < 290 ||
        rooms[0].label.x > 510 ||
        rooms[0].label.y < 290 ||
        rooms[0].label.y > 510,
    ).toBe(true);
    const withIsland = findRooms([
      ...rectangle(),
      wall({ x: 200, y: 100 }, { x: 200, y: 300 }),
    ]);
    expect(withIsland[0].areaCm2).toBeCloseTo(480 * 380 - 20 * 200);
  });

  it("handles duplicate, overlapping and reversed walls without duplicating rooms", () => {
    const walls = rectangle();
    const reversed = walls.map((w) => ({ ...w, a: w.b, b: w.a })).reverse();
    expect(findRooms(reversed)).toEqual(findRooms(walls));
    const rooms = findRooms([
      ...walls,
      ...reversed,
      wall({ x: 50, y: 0 }, { x: 250, y: 0 }),
    ]);
    expect(rooms).toHaveLength(1);
    expect(rooms[0].areaCm2).toBeCloseTo(480 * 380);
  });

  it("keeps doors/windows as boundaries and ignores furniture", () => {
    const p = plan();
    p.items.push(
      {
        id: "door",
        name: "Door",
        type: "door",
        hostId: p.items[0].id,
        t: 0.5,
        width: 90,
        hinge: 1,
        swing: 1,
      },
      {
        id: "table",
        name: "Table",
        type: "furniture",
        kind: "table",
        x: 0,
        y: 0,
        w: 1000,
        h: 1000,
        rotation: 0,
      },
    );
    expect(findRooms(p.items)).toEqual(findRooms(rectangle()));
    expect(findRooms([p.items[5]])).toEqual([]);
  });

  it("recalculates after edits, deletion, undo/redo, scale calibration and reopening", () => {
    const p = plan(),
      history = new History();
    const moved = setCorner(p, p.items[1].id, "b", { x: 600, y: 400 });
    expect(findRooms(moved.items)[0].areaCm2).toBeGreaterThan(
      findRooms(p.items)[0].areaCm2,
    );
    history.push(p);
    const undone = history.undo(moved);
    expect(findRooms(undone.items)[0].areaCm2).toBeCloseTo(182400);
    const redone = history.redo(undone);
    expect(findRooms(redone.items)).toEqual(findRooms(moved.items));
    expect(findRooms(removeItems(p, [p.items[0].id]).items)).toEqual([]);
    const scaled = calibrate(p, 100, 200);
    expect(findRooms(scaled.items)[0].areaCm2).toBeCloseTo(182400 * 4);
    expect(findRooms(parseProject(serialize(scaled)).items)).toEqual(
      findRooms(scaled.items),
    );
  });

  it("retains area precision far from the coordinate origin", () => {
    expect(
      findRooms(rectangle(900_000_000, -900_000_000))[0].areaCm2,
    ).toBeCloseTo(182400);
  });

  it("preserves floor areas across arbitrary rotations and translations", () => {
    for (let angle = 0; angle < 360; angle += 7) {
      const walls = rectangle().map((w) => {
        const transform = (p: Point) => {
          const q = rotate(p, angle);
          return { x: q.x + 12345.6789, y: q.y - 23456.7891 };
        };
        return { ...w, a: transform(w.a), b: transform(w.b) };
      });
      const rooms = findRooms(walls);
      expect(rooms, `rotation ${angle}`).toHaveLength(1);
      expect(rooms[0].areaCm2).toBeCloseTo(182400);
    }
  });
});

describe("room area presentation", () => {
  function properties(p: Plan, selection: string[] = []) {
    return renderToStaticMarkup(
      <Properties
        plan={p}
        rooms={findRooms(p.items)}
        selection={selection}
        commit={() => {}}
        setSelection={() => {}}
        setTool={() => {}}
        onDuplicate={() => {}}
        onDelete={() => {}}
        onError={() => {}}
      />,
    );
  }

  it("shows individual and total areas in Properties, including with a selection", () => {
    const html = properties(plan());
    expect(html).toContain("Room areas");
    expect(html).toContain("Room 1");
    expect(html).toContain("Total room area");
    expect(html.match(/18.24 m²/g)).toHaveLength(2);
    const p = plan();
    expect(
      properties(
        p,
        p.items.map((i) => i.id),
      ),
    ).toContain("18.24 m²");
  });

  it("explains empty and uncalibrated states without displaying uncalibrated m²", () => {
    expect(properties(emptyPlan())).toContain("Close a space with walls");
    const p = plan();
    p.calibration.calibrated = false;
    expect(properties(p)).toContain("Calibrate scale to display areas in m²");
    expect(properties(p)).not.toContain("18.24");
    const labels = renderToStaticMarkup(
      <RoomLabels rooms={findRooms(p.items)} calibrated={false} />,
    );
    expect(labels).toContain("Set scale");
    expect(labels).not.toContain("18.24");
  });

  it("includes labels in the export drawing without making them editable objects", () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.innerHTML = renderToStaticMarkup(
      <g data-drawing="true">
        <RoomLabels rooms={findRooms(plan().items)} calibrated />
      </g>,
    );
    const exported = exportSvg(svg, { x: 0, y: 0, w: 500, h: 400 });
    expect(exported).toContain("18.24 m²");
    expect(exported).toContain('pointer-events="none"');
    expect(exported).not.toContain("data-item-id");
  });

  it("uses the same room labels and calibration gate in agent CLI previews", () => {
    const p = plan();
    const saved = serialize(p);
    const preview = renderPlanSvg(p);
    expect(preview).toContain('aria-label="Room 1: 18.24 m²"');
    expect(serialize(p)).toBe(saved);
    p.calibration.calibrated = false;
    const uncalibrated = renderPlanSvg(p);
    expect(uncalibrated).toContain('aria-label="Room 1: Set scale"');
    expect(uncalibrated).not.toContain("18.24 m²");
  });
});
