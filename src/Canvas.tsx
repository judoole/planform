import { type Camera, screenToWorld, pinchCamera } from "./coordinates";
import {
  useRef,
  useState,
  useEffect,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  type Plan,
  type Point,
  type Item,
  type RectItem,
  type Wall,
  type Box,
  type DoorStyle,
  uid,
  dist,
  angle,
  bounds,
  unionBoxes,
  isRect,
  clone,
  translate,
  setCorner,
  project,
  snapPoint,
  planBounds,
  rotate,
} from "./model";
import { DrawItem, RoomLabels } from "./Drawing";
import { furniture, type FurnitureKind } from "./furniture";
import type { Room } from "./rooms";
export type Tool =
  | "select"
  | "box"
  | "pan"
  | "wall"
  | "room"
  | "door"
  | "window"
  | "stairs"
  | "furniture"
  | "dimension"
  | "measure"
  | "calibrate"
  | "text";
export type { Camera } from "./coordinates";
const toolHelp: Record<Tool, string> = {
  select: "Click an object to select · drag to move · Shift-click to add",
  box: "Drag a box around objects to select them",
  pan: "Drag to pan · pinch or use zoom controls",
  wall: "Click a start point, then connected corners · Finish to stop",
  room: "Drag from one corner to the opposite corner",
  door: "Choose a door type, then click a wall to place it",
  window: "Click a wall to attach a window",
  stairs: "Click to place stairs · edit size and steps in Properties",
  furniture: "Choose a symbol, then click to place it",
  dimension: "Choose two points to add a dimension",
  measure: "Choose two points to measure their distance",
  calibrate: "Choose two points with a known real-world distance",
  text: "Click to add a label · edit its text in Properties",
};
type Gesture = {
  kind: "move" | "pan" | "box" | "room" | "resize" | "rotate" | "endpoint";
  start: Point;
  screen: Point;
  base: Plan;
  ids: string[];
  handle?: string;
  moved: boolean;
  cam: Camera;
};
export default function Canvas({
  plan,
  ghost,
  rooms,
  setPreview,
  commit,
  selection,
  setSelection,
  tool,
  setTool,
  snap,
  kind,
  doorStyle,
  wallThickness,
  camera,
  setCamera,
  svgRef,
  onMeasure,
  onStatus,
  onOverlap,
  cancelToken,
}: {
  plan: Plan;
  ghost?: Plan;
  rooms: Room[];
  setPreview: (p: Plan | null) => void;
  commit: (p: Plan, base?: Plan) => void;
  selection: string[];
  setSelection: (s: string[]) => void;
  tool: Tool;
  setTool: (t: Tool) => void;
  snap: boolean;
  kind: FurnitureKind;
  doorStyle: DoorStyle;
  wallThickness: number;
  camera: Camera;
  setCamera: (c: Camera) => void;
  svgRef: RefObject<SVGSVGElement | null>;
  onMeasure: (a: Point, b: Point, calibrate: boolean) => void;
  onStatus: (s: string) => void;
  onOverlap: (ids: string[]) => void;
  cancelToken: number;
}) {
  const wrapper = useRef<HTMLDivElement>(null),
    [size, setSize] = useState({ w: 1000, h: 700 }),
    [anchor, setAnchor] = useState<Point | null>(null),
    [cursor, setCursor] = useState<Point | null>(null),
    [snapKind, setSnapKind] = useState(""),
    [marquee, setMarquee] = useState<Box | null>(null);
  const [pointerKind, setPointerKind] = useState("mouse");
  const gesture = useRef<Gesture | null>(null),
    pointers = useRef(new Map<number, Point>()),
    pinch = useRef<{ distance: number; center: Point; cam: Camera } | null>(
      null,
    ),
    wasPinch = useRef(false);
  useEffect(() => {
    const r = new ResizeObserver((e) =>
      setSize({ w: e[0].contentRect.width, h: e[0].contentRect.height }),
    );
    if (wrapper.current) r.observe(wrapper.current);
    return () => r.disconnect();
  }, []);
  useEffect(() => {
    setAnchor(null);
    setMarquee(null);
    setSnapKind("");
    if (gesture.current) setPreview(null);
    gesture.current = null;
    pointers.current.clear();
    pinch.current = null;
    wasPinch.current = false;
  }, [tool, cancelToken]);
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    function wheel(e: WheelEvent) {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const rect = el!.getBoundingClientRect(),
          p = { x: e.clientX - rect.left, y: e.clientY - rect.top },
          k = Math.max(
            0.02,
            Math.min(20, camera.k * Math.exp(-e.deltaY * 0.008)),
          );
        setCamera({
          k,
          x: p.x - ((p.x - camera.x) * k) / camera.k,
          y: p.y - ((p.y - camera.y) * k) / camera.k,
        });
      } else
        setCamera({
          ...camera,
          x: camera.x - e.deltaX,
          y: camera.y - e.deltaY,
        });
    }
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [camera]);
  const screen = (e: { clientX: number; clientY: number }): Point => {
    const b = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - b.left, y: e.clientY - b.top };
  };
  const world = (s: Point): Point => screenToWorld(s, camera);
  const snapped = (p: Point, exclude: string[] = []) => {
    const r = snapPoint(
      p,
      plan,
      snap,
      8 / camera.k,
      exclude,
      anchor || undefined,
    );
    setSnapKind(r.kind);
    return r.point;
  };
  function targetId(e: ReactPointerEvent) {
    let el = (e.target as Element).closest("[data-item-id]");
    while (el?.parentElement?.closest("[data-item-id]"))
      el = el.parentElement.closest("[data-item-id]");
    return el?.getAttribute("data-item-id") || null;
  }
  function overlaps(e: ReactPointerEvent) {
    const ids: string[] = [];
    for (const el of document.elementsFromPoint(e.clientX, e.clientY)) {
      let g = el.closest("[data-item-id]");
      while (g?.parentElement?.closest("[data-item-id]"))
        g = g.parentElement.closest("[data-item-id]");
      const id = g?.getAttribute("data-item-id");
      if (id && !ids.includes(id)) ids.push(id);
    }
    onOverlap(ids);
    return ids;
  }
  function down(e: ReactPointerEvent<SVGSVGElement>) {
    if (e.button === 2) return;
    setPointerKind(e.pointerType);
    const s = screen(e);
    pointers.current.set(e.pointerId, s);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointers.current.size === 2) {
      if (gesture.current) setPreview(null);
      gesture.current = null;
      setMarquee(null);
      const [a, b] = [...pointers.current.values()];
      pinch.current = {
        distance: dist(a, b),
        center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        cam: camera,
      };
      wasPinch.current = true;
      return;
    }
    if (pointers.current.size !== 1) return;
    const p = world(s),
      handle = (e.target as Element).getAttribute("data-handle"),
      id = targetId(e),
      item = plan.items.find((i) => i.id === id);
    let g: Gesture | null = null;
    const base = {
      start: p,
      screen: s,
      base: plan,
      ids: selection,
      moved: false,
      cam: camera,
    };
    if (tool === "pan" || e.button === 1) g = { ...base, kind: "pan" };
    else if (handle && selection.length === 1) {
      const selected = plan.items.find((i) => i.id === selection[0]);
      if (selected?.locked) return;
      g = {
        ...base,
        kind:
          handle === "a" || handle === "b"
            ? "endpoint"
            : handle === "rotate"
              ? "rotate"
              : "resize",
        handle,
      };
    } else if (tool === "room")
      g = { ...base, start: snapped(p), kind: "room" };
    else if (tool === "select" || tool === "box") {
      const stack = overlaps(e),
        hit = e.altKey
          ? stack[(stack.indexOf(selection[0]) + 1) % stack.length]
          : id;
      const object = plan.items.find((i) => i.id === hit);
      if (hit && tool !== "box") {
        const ids = e.shiftKey
          ? selection.includes(hit)
            ? selection.filter((x) => x !== hit)
            : [...selection, hit]
          : selection.includes(hit)
            ? selection
            : [hit];
        setSelection(ids);
        if (object && !object.locked)
          g = {
            ...base,
            ids: ids.filter(
              (id) => !plan.items.find((i) => i.id === id)?.locked,
            ),
            kind: "move",
          };
      } else {
        if (!e.shiftKey) setSelection([]);
        g = { ...base, ids: e.shiftKey ? selection : [], kind: "box" };
      }
    }
    gesture.current = g;
  }
  function move(e: ReactPointerEvent<SVGSVGElement>) {
    const s = screen(e);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, s);
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()],
        v = pinch.current,
        c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
        initialDistance = v.distance;
      setCamera(pinchCamera(v.cam, v.center, c, initialDistance, dist(a, b)));
      return;
    }
    const p = world(s),
      g = gesture.current;
    setCursor(p);
    if (!g) {
      if (
        anchor ||
        ["wall", "room", "dimension", "measure", "calibrate"].includes(tool)
      )
        setCursor(snapped(p));
      onStatus(`${p.x.toFixed(1)}, ${p.y.toFixed(1)}`);
      return;
    }
    if (dist(s, g.screen) < 3 && !g.moved) return;
    g.moved = true;
    if (g.kind === "pan") {
      setCamera({
        ...g.cam,
        x: g.cam.x + s.x - g.screen.x,
        y: g.cam.y + s.y - g.screen.y,
      });
      return;
    }
    if (g.kind === "box" || g.kind === "room") {
      const q = g.kind === "room" ? snapped(p) : p;
      setMarquee({
        x: Math.min(g.start.x, q.x),
        y: Math.min(g.start.y, q.y),
        w: Math.abs(q.x - g.start.x),
        h: Math.abs(q.y - g.start.y),
      });
      return;
    }
    setPreview(gesturePlan(g, p));
  }
  function gesturePlan(g: Gesture, p: Point): Plan {
    const item = g.base.items.find((i) => i.id === g.ids[0]);
    if (!item) return g.base;
    if (g.kind === "move") {
      const b = bounds(item, g.base.items),
        raw = { x: b.x + p.x - g.start.x, y: b.y + p.y - g.start.y },
        q = snapped(raw, g.ids);
      return translate(g.base, g.ids, { x: q.x - b.x, y: q.y - b.y });
    } else if (g.kind === "endpoint" && item.type === "wall") {
      return setCorner(
        g.base,
        item.id,
        g.handle as "a" | "b",
        snapped(p, g.ids),
      );
    } else if (isRect(item)) {
      const i = { ...item },
        next = {
          ...g.base,
          items: g.base.items.map((v) => (v.id === item.id ? i : v)),
        };
      if (g.kind === "resize") {
        const q = rotate({ x: p.x - i.x, y: p.y - i.y }, -i.rotation);
        i.w = Math.max(
          0.01,
          snap ? Math.round(q.x / plan.grid) * plan.grid : q.x,
        );
        i.h = Math.max(
          0.01,
          snap ? Math.round(q.y / plan.grid) * plan.grid : q.y,
        );
      } else {
        const a = angle(i, g.start),
          b = angle(i, p);
        i.rotation = item.rotation + b - a;
        if (snap) i.rotation = Math.round(i.rotation / 15) * 15;
      }
      return next;
    }
    return g.base;
  }
  function up(e: ReactPointerEvent<SVGSVGElement>) {
    if (!pointers.current.delete(e.pointerId)) return;
    if (wasPinch.current) {
      if (!pointers.current.size) {
        wasPinch.current = false;
        pinch.current = null;
      }
      return;
    }
    const s = screen(e),
      p = world(s),
      g = gesture.current;
    gesture.current = null;
    if (g) {
      if (g.kind === "pan") {
        setCamera({
          ...g.cam,
          x: g.cam.x + s.x - g.screen.x,
          y: g.cam.y + s.y - g.screen.y,
        });
        return;
      }
      if (g.kind === "box") {
        const marquee = {
          x: Math.min(g.start.x, p.x),
          y: Math.min(g.start.y, p.y),
          w: Math.abs(p.x - g.start.x),
          h: Math.abs(p.y - g.start.y),
        };
        if (dist(s, g.screen) > 3) {
          const selected = plan.items
            .filter((i) => {
              const b = bounds(i, plan.items);
              return (
                b.x >= marquee.x &&
                b.y >= marquee.y &&
                b.x + b.w <= marquee.x + marquee.w &&
                b.y + b.h <= marquee.y + marquee.h
              );
            })
            .map((i) => i.id);
          setSelection([...new Set([...g.ids, ...selected])]);
        }
        setMarquee(null);
        return;
      }
      if (g.kind === "room") {
        const q = snapped(p);
        if (Math.abs(q.x - g.start.x) > 1 && Math.abs(q.y - g.start.y) > 1) {
          const a = g.start,
            b = { x: q.x, y: a.y },
            c = q,
            d = { x: a.x, y: q.y };
          const items = [a, b, c, d].map((pt, n) => ({
            id: uid(),
            type: "wall" as const,
            name: `Wall ${plan.items.filter((i) => i.type === "wall").length + n + 1}`,
            a: pt,
            b: [b, c, d, a][n],
            thickness: wallThickness,
          }));
          commit({ ...plan, items: [...plan.items, ...items] });
          setSelection(items.map((i) => i.id));
          setTool("select");
        }
        setMarquee(null);
        return;
      }
      if (g.moved || dist(s, g.screen) > 3) commit(gesturePlan(g, p), g.base);
      return;
    }
    if (tool === "pan" || tool === "select" || tool === "box") return;
    const q = snapped(p);
    if (["wall", "dimension", "measure", "calibrate"].includes(tool)) {
      if (!anchor) {
        setAnchor(q);
        return;
      }
      if (dist(anchor, q) < 0.001) return;
      if (tool === "wall") {
        const i: Wall = {
          id: uid(),
          type: "wall",
          name: `Wall ${plan.items.filter((i) => i.type === "wall").length + 1}`,
          a: anchor,
          b: q,
          thickness: wallThickness,
        };
        commit({ ...plan, items: [...plan.items, i] });
        setSelection([i.id]);
        setAnchor(q);
      } else {
        if (tool === "dimension") {
          const i: Item = {
            id: uid(),
            type: "dimension",
            name: "Dimension",
            a: anchor,
            b: q,
            offset: -30,
          };
          commit({ ...plan, items: [...plan.items, i] });
          setSelection([i.id]);
        } else onMeasure(anchor, q, tool === "calibrate");
        setAnchor(null);
        setTool("select");
      }
      return;
    }
    if (tool === "door" || tool === "window") {
      const wall = plan.items
        .filter((i) => i.type === "wall" && !i.locked)
        .map((w) => ({ w: w as Wall, ...project(p, w as Wall) }))
        .sort((a, b) => a.distance - b.distance)[0];
      if (
        !wall ||
        wall.distance > Math.max(wall.w.thickness / 2, 22 / camera.k)
      ) {
        onStatus("Choose an unlocked wall to attach this opening.");
        return;
      }
      const sliding = tool === "door" && doorStyle === "sliding";
      const i: Item = {
        id: uid(),
        type: tool,
        name: sliding ? "Sliding door" : tool === "door" ? "Door" : "Window",
        hostId: wall.w.id,
        t: wall.t,
        width: tool === "door" && !sliding ? 90 : 120,
        hinge: 1,
        swing: 1,
        ...(sliding ? { style: "sliding" } : {}),
      };
      commit({ ...plan, items: [...plan.items, i] });
      setSelection([i.id]);
      setTool("select");
      return;
    }
    const [w, h] =
      tool === "furniture"
        ? furniture[kind].size
        : tool === "stairs"
          ? [100, 300]
          : [160, 28];
    const i: RectItem = {
      id: uid(),
      type:
        tool === "furniture"
          ? "furniture"
          : tool === "stairs"
            ? "stairs"
            : "text",
      name:
        tool === "furniture"
          ? furniture[kind].label
          : tool === "stairs"
            ? "Staircase"
            : "Label",
      x: q.x,
      y: q.y,
      w,
      h,
      rotation: 0,
      ...(tool === "furniture"
        ? { kind }
        : tool === "stairs"
          ? { steps: 12 }
          : { text: "Room label", fontSize: 18 }),
    };
    commit({ ...plan, items: [...plan.items, i] });
    setSelection([i.id]);
    setTool("select");
  }
  const selected = plan.items.filter((i) => selection.includes(i.id)),
    box = selected.length
      ? unionBoxes(selected.map((i) => bounds(i, plan.items)))
      : null,
    single = selected.length === 1 ? selected[0] : null,
    handleSize = 6 / camera.k;
  const handle = (p: Point, name: string, square = false) => (
    <g key={name} data-handle={name} className="handle">
      <circle
        data-handle={name}
        cx={p.x}
        cy={p.y}
        r={16 / camera.k}
        fill="transparent"
      />
      {square ? (
        <rect
          data-handle={name}
          x={p.x - handleSize}
          y={p.y - handleSize}
          width={handleSize * 2}
          height={handleSize * 2}
          fill="white"
          stroke="#247862"
          strokeWidth={1.5 / camera.k}
        />
      ) : (
        <circle
          data-handle={name}
          cx={p.x}
          cy={p.y}
          r={handleSize}
          fill="white"
          stroke="#247862"
          strokeWidth={1.5 / camera.k}
        />
      )}
    </g>
  );
  const grid = Math.max(
      plan.grid,
      plan.grid * Math.ceil(8 / (plan.grid * camera.k)),
    ),
    visible = {
      x: -camera.x / camera.k,
      y: -camera.y / camera.k,
      w: size.w / camera.k,
      h: size.h / camera.k,
    };
  return (
    <div className={`canvas-wrap tool-${tool}`} ref={wrapper}>
      <svg
        ref={svgRef}
        className="canvas"
        data-pointer-mode={pointerKind}
        aria-label="Floor plan drawing canvas"
        role="img"
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={() => {
          if (gesture.current) setPreview(null);
          gesture.current = null;
          pointers.current.clear();
          pinch.current = null;
          wasPinch.current = false;
          setMarquee(null);
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern
            id="grid"
            width={grid}
            height={grid}
            patternUnits="userSpaceOnUse"
          >
            <circle cx={0} cy={0} r={0.75 / camera.k} fill="#ccd7ce" />
          </pattern>
        </defs>
        <g transform={`translate(${camera.x} ${camera.y}) scale(${camera.k})`}>
          <rect
            {...{
              x: visible.x,
              y: visible.y,
              width: visible.w,
              height: visible.h,
            }}
            fill="url(#grid)"
            pointerEvents="none"
          />
          {ghost && (
            <g className="plan-overlay" pointerEvents="none" aria-hidden="true">
              {ghost.items.map((item) => (
                <DrawItem
                  key={item.id}
                  item={item}
                  plan={ghost}
                  interactive={false}
                />
              ))}
            </g>
          )}
          <g data-drawing="true">
            {plan.items.map((i) => (
              <DrawItem key={i.id} item={i} plan={plan} />
            ))}
            <RoomLabels
              rooms={rooms}
              calibrated={plan.calibration.calibrated}
            />
          </g>
          <g className="selection-overlay">
            {box && (
              <rect
                x={box.x}
                y={box.y}
                width={Math.max(box.w, 1)}
                height={Math.max(box.h, 1)}
                fill="rgba(44,128,95,.045)"
                stroke="#27846b"
                strokeWidth={1.3 / camera.k}
                strokeDasharray={
                  single?.locked ? `${5 / camera.k} ${4 / camera.k}` : undefined
                }
                pointerEvents="none"
              />
            )}
            {single &&
              !single.locked &&
              (single.type === "wall" ? (
                <>
                  {handle(single.a, "a")}
                  {handle(single.b, "b")}
                </>
              ) : isRect(single) ? (
                <>
                  {handle(
                    {
                      x:
                        single.x +
                        rotate({ x: single.w, y: single.h }, single.rotation).x,
                      y:
                        single.y +
                        rotate({ x: single.w, y: single.h }, single.rotation).y,
                    },
                    "resize",
                    true,
                  )}
                  {handle(
                    {
                      x:
                        single.x +
                        rotate(
                          { x: single.w / 2, y: -30 / camera.k },
                          single.rotation,
                        ).x,
                      y:
                        single.y +
                        rotate(
                          { x: single.w / 2, y: -30 / camera.k },
                          single.rotation,
                        ).y,
                    },
                    "rotate",
                  )}
                </>
              ) : null)}
          </g>
          {marquee && (
            <rect
              x={marquee.x}
              y={marquee.y}
              width={marquee.w}
              height={marquee.h}
              fill="#27846b16"
              stroke="#27846b"
              strokeWidth={1 / camera.k}
              strokeDasharray={`${5 / camera.k} ${4 / camera.k}`}
              pointerEvents="none"
            />
          )}
          {anchor && cursor && (
            <g pointerEvents="none">
              <line
                x1={anchor.x}
                y1={anchor.y}
                x2={cursor.x}
                y2={cursor.y}
                stroke="#27846b"
                strokeWidth={tool === "wall" ? wallThickness : 1 / camera.k}
                opacity={0.55}
              />
              <text
                x={(anchor.x + cursor.x) / 2}
                y={(anchor.y + cursor.y) / 2 - 16 / camera.k}
                textAnchor="middle"
                fontSize={13 / camera.k}
                fill="#185b4b"
                stroke="#f5f7f2"
                strokeWidth={5 / camera.k}
                paintOrder="stroke"
              >
                {dist(anchor, cursor).toFixed(1)}{" "}
                {plan.calibration.calibrated ? "cm" : "units"}
              </text>
              <circle
                cx={anchor.x}
                cy={anchor.y}
                r={4 / camera.k}
                fill="#27846b"
              />
            </g>
          )}
          {snapKind && cursor && tool !== "select" && (
            <g pointerEvents="none">
              <circle
                cx={cursor.x}
                cy={cursor.y}
                r={7 / camera.k}
                fill="none"
                stroke="#c4813f"
                strokeWidth={1.5 / camera.k}
              />
              <text
                x={cursor.x + 12 / camera.k}
                y={cursor.y - 12 / camera.k}
                fontSize={11 / camera.k}
                fill="#9a602d"
              >
                {snapKind}
              </text>
            </g>
          )}
        </g>
      </svg>
      <div className="canvas-hint">
        <span className="hint-dot" />
        {toolHelp[tool]}
        {anchor && (
          <button
            onClick={() => {
              setAnchor(null);
              setTool("select");
            }}
          >
            Finish
          </button>
        )}
      </div>
      {!plan.items.length && !ghost?.items.length && tool === "select" && (
        <div className="empty-canvas">
          <span className="empty-symbol">
            ⌜<span>⌟</span>
          </span>
          <h2>Make room for your ideas.</h2>
          <p>
            Draw your first wall, or bring in an existing floor plan.
            <br />
            Every detail stays in your browser.
          </p>
          <button className="primary" onClick={() => setTool("wall")}>
            Draw your first wall <span>↗</span>
          </button>
          <small>
            Open a project from your AI agent, or draw a room to start.
          </small>
        </div>
      )}
    </div>
  );
}
