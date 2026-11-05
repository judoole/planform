import { Fragment, memo } from "react";
import { type Room, formatRoomArea } from "./rooms";
import {
  type Item,
  type Plan,
  type RectItem,
  type Wall,
  dist,
  angle,
  openingFrame,
  isRect,
} from "./model";
const ink = "#34443f",
  light = "#e5ebe5";

export function RoomLabels({
  rooms,
  calibrated,
}: {
  rooms: Room[];
  calibrated: boolean;
}) {
  return (
    <g
      data-room-labels="true"
      pointerEvents="none"
      fontFamily="Arial, sans-serif"
    >
      {rooms.map((room, n) => {
        const name = `Room ${n + 1}`;
        const area = calibrated ? formatRoomArea(room.areaCm2) : "Set scale";
        const size = Math.min(18, room.clearance / 3);
        return (
          <g
            key={n}
            transform={`translate(${room.label.x} ${room.label.y})`}
            aria-label={`${name}: ${area}`}
          >
            <title>{`${name}: ${area}`}</title>
            <text
              textAnchor="middle"
              fill="#52685d"
              stroke="white"
              strokeWidth={size / 4}
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              <tspan x={0} y={-size * 0.35} fontSize={size * 0.72}>
                {name}
              </tspan>
              <tspan x={0} y={size * 0.85} fontSize={size} fontWeight={600}>
                {area}
              </tspan>
            </text>
          </g>
        );
      })}
    </g>
  );
}
const rect = (
  x: number,
  y: number,
  w: number,
  h: number,
  rx = 0,
  fill = "white",
) => <rect x={x} y={y} width={w} height={h} rx={rx} fill={fill} />;
function Symbol({ i }: { i: RectItem }) {
  const w = i.w,
    h = i.h;
  if (i.type === "text")
    return (
      <text
        y={i.fontSize || 18}
        fontSize={i.fontSize || 18}
        fill={ink}
        stroke="none"
        fontFamily="Arial, sans-serif"
      >
        {i.text}
      </text>
    );
  if (i.type === "stairs")
    return (
      <g>
        {rect(0, 0, w, h)}
        {Array.from({ length: (i.steps || 12) - 1 }, (_, n) => (
          <line
            key={n}
            x1={0}
            x2={w}
            y1={(h * (n + 1)) / (i.steps || 12)}
            y2={(h * (n + 1)) / (i.steps || 12)}
          />
        ))}
        <path
          d={`M ${w * 0.5} ${h * 0.85} V ${h * 0.15} m ${-w * 0.12} ${h * 0.06} l ${w * 0.12} ${-h * 0.06} l ${w * 0.12} ${h * 0.06}`}
          fill="none"
        />
        <text
          x={w * 0.58}
          y={h * 0.55}
          fontSize={Math.min(w * 0.15, 16)}
          stroke="none"
          fill={ink}
        >
          UP
        </text>
      </g>
    );
  return (
    <g>
      {i.kind === "sofa" ? (
        <>
          {rect(0, 0, w, h, 8, light)}
          {rect(w * 0.07, h * 0.1, w * 0.86, h * 0.22, 4)}
          {rect(w * 0.1, h * 0.36, w * 0.38, h * 0.54, 4)}
          {rect(w * 0.52, h * 0.36, w * 0.38, h * 0.54, 4)}
          {rect(0, h * 0.25, w * 0.08, h * 0.7, 3)}
          {rect(w * 0.92, h * 0.25, w * 0.08, h * 0.7, 3)}
        </>
      ) : i.kind === "bed" ? (
        <>
          {rect(0, 0, w, h, 3, light)}
          {rect(w * 0.07, h * 0.08, w * 0.39, h * 0.19, 5)}
          {rect(w * 0.54, h * 0.08, w * 0.39, h * 0.19, 5)}
          {rect(w * 0.04, h * 0.33, w * 0.92, h * 0.64, 3)}
          <line x1={w * 0.04} x2={w * 0.96} y1={h * 0.43} y2={h * 0.43} />
        </>
      ) : i.kind === "table" ? (
        <>
          {rect(0, 0, w, h, Math.min(w, h) * 0.14, light)}
          {[
            [0.08, 0.1],
            [0.82, 0.1],
            [0.08, 0.78],
            [0.82, 0.78],
          ].map(([x, y], n) => (
            <Fragment key={n}>
              {rect(w * x, h * y, w * 0.1, h * 0.12, 2, "#ccd5cc")}
            </Fragment>
          ))}
        </>
      ) : i.kind === "chair" ? (
        <>
          {rect(w * 0.1, h * 0.05, w * 0.8, h * 0.3, 6, light)}
          {rect(w * 0.05, h * 0.34, w * 0.9, h * 0.6, 5)}
          <line x1={w * 0.1} y1={h * 0.15} x2={w * 0.1} y2={h} />
          <line x1={w * 0.9} y1={h * 0.15} x2={w * 0.9} y2={h} />
        </>
      ) : i.kind === "toilet" ? (
        <>
          {rect(w * 0.15, 0, w * 0.7, h * 0.28, 3, light)}
          <ellipse
            cx={w * 0.5}
            cy={h * 0.6}
            rx={w * 0.34}
            ry={h * 0.37}
            fill="white"
          />
          <ellipse
            cx={w * 0.5}
            cy={h * 0.62}
            rx={w * 0.23}
            ry={h * 0.25}
            fill={light}
          />
        </>
      ) : i.kind === "shower" ? (
        <>
          {rect(0, 0, w, h, 2)}
          <path d={`M 0 0 L ${w} ${h} M ${w} 0 L 0 ${h}`} stroke="#bbc8c0" />
          <circle
            cx={w * 0.5}
            cy={h * 0.5}
            r={Math.min(w, h) * 0.08}
            fill={light}
          />
          <path d={`M ${w * 0.7} 0 V ${h * 0.2} h ${-w * 0.12}`} fill="none" />
        </>
      ) : (
        <>
          {rect(0, 0, w, h, 2, light)}
          {i.kind === "counter" ? (
            <>
              {rect(w * 0.1, h * 0.12, w * 0.35, h * 0.75, 5, "white")}
              <circle
                cx={w * 0.7}
                cy={h * 0.5}
                r={Math.min(w * 0.17, h * 0.28)}
                fill="white"
              />
            </>
          ) : (
            <>
              <line x1={w * 0.5} y1={0} x2={w * 0.5} y2={h} />
              <line x1={w * 0.4} y1={h * 0.5} x2={w * 0.6} y2={h * 0.5} />
            </>
          )}
        </>
      )}
    </g>
  );
}
function WallShape({
  wall: w,
  plan,
  interactive,
}: {
  wall: Wall;
  plan: Plan;
  interactive: boolean;
}) {
  const len = dist(w.a, w.b);
  const openings = plan.items
    .filter(
      (i) => (i.type === "door" || i.type === "window") && i.hostId === w.id,
    )
    .map((i) => i as import("./model").Opening)
    .sort((a, b) => a.t - b.t);
  let start = 0;
  const segments: { start: number; end: number }[] = [];
  for (const o of openings) {
    const end = o.t * len - o.width / 2;
    if (end > start) segments.push({ start, end });
    start = o.t * len + o.width / 2;
  }
  if (start < len) segments.push({ start, end: len });
  return (
    <g transform={`translate(${w.a.x} ${w.a.y}) rotate(${angle(w.a, w.b)})`}>
      {interactive && (
        <line
          data-hit="true"
          x1={0}
          x2={len}
          y1={0}
          y2={0}
          stroke="transparent"
          strokeWidth={Math.max(w.thickness, 12)}
          pointerEvents="stroke"
        />
      )}
      {segments.map((s, n) => (
        <rect
          key={n}
          x={s.start}
          y={-w.thickness / 2}
          width={s.end - s.start}
          height={w.thickness}
          fill="#52645a"
          stroke="#344b3f"
          strokeWidth={1}
        />
      ))}
      {[w.a, w.b].map((p, n) =>
        plan.items.some(
          (i) =>
            i.type === "wall" &&
            i.id !== w.id &&
            (dist(i.a, p) < 1e-6 || dist(i.b, p) < 1e-6),
        ) ? (
          <circle
            key={n}
            cx={n ? len : 0}
            cy={0}
            r={w.thickness / 2}
            fill="#52645a"
          />
        ) : null,
      )}
    </g>
  );
}
export const DrawItem = memo(
  function DrawItem({
    item: i,
    plan,
    interactive = true,
  }: {
    item: Item;
    plan: Plan;
    interactive?: boolean;
  }) {
    let shape;
    if (i.type === "wall")
      shape = <WallShape wall={i} plan={plan} interactive={interactive} />;
    else if (i.type === "door" || i.type === "window") {
      const f = openingFrame(i, plan.items);
      if (!f) return null;
      const w = i.width,
        t = f.wall.thickness;
      shape = (
        <g
          transform={`translate(${f.center.x} ${f.center.y}) rotate(${f.angle})`}
          stroke={ink}
          strokeWidth={1.5}
        >
          {interactive && (
            <rect
              data-hit="true"
              x={-w / 2}
              y={-t / 2 - 5}
              width={w}
              height={t + 10}
              fill="transparent"
              stroke="none"
            />
          )}
          {i.type === "window" ? (
            <>
              <rect x={-w / 2} y={-t / 2} width={w} height={t} fill="#dfedf0" />
              <line x1={-w / 2} x2={w / 2} y1={0} y2={0} />
              <line x1={-w / 2 + 4} x2={-w / 2 + 4} y1={-t / 2} y2={t / 2} />
              <line x1={w / 2 - 4} x2={w / 2 - 4} y1={-t / 2} y2={t / 2} />
            </>
          ) : (
            <g transform={`scale(${i.hinge} ${i.swing})`}>
              <line x1={-w / 2} y1={0} x2={-w / 2} y2={-w} strokeWidth={2.5} />
              <path
                d={`M ${w / 2} 0 A ${w} ${w} 0 0 0 ${-w / 2} ${-w}`}
                fill="none"
                stroke="#798d82"
              />
              <line x1={-w / 2} x2={-w / 2} y1={-t / 2} y2={t / 2} />
              <line x1={w / 2} x2={w / 2} y1={-t / 2} y2={t / 2} />
            </g>
          )}
        </g>
      );
    } else if (i.type === "dimension") {
      const a = angle(i.a, i.b),
        l = dist(i.a, i.b),
        d = i.offset;
      shape = (
        <g
          transform={`translate(${i.a.x} ${i.a.y}) rotate(${a})`}
          stroke="#647d71"
          strokeWidth={1}
          fill="none"
        >
          <path
            d={`M 0 0 V ${d + 8} M ${l} 0 V ${d + 8} M 0 ${d} H ${l} M -4 ${d - 5} l 8 10 M ${l - 4} ${d - 5} l 8 10`}
          />
          <text
            x={l / 2}
            y={d - 6}
            textAnchor="middle"
            fontSize={15}
            fontFamily="Arial, sans-serif"
            fill="#52685d"
            stroke="white"
            strokeWidth={5}
            paintOrder="stroke"
          >
            {l.toFixed(1)} {plan.calibration.calibrated ? "cm" : "units"}
          </text>
          {interactive && (
            <path
              data-hit="true"
              d={`M 0 ${d} H ${l}`}
              stroke="transparent"
              strokeWidth={18}
            />
          )}
        </g>
      );
    } else if (isRect(i)) {
      const b = i.sourceBox;
      shape = (
        <g transform={`translate(${i.x} ${i.y}) rotate(${i.rotation})`}>
          {i.type === "group" && b ? (
            <g
              transform={`scale(${i.w / (b.w || 1)} ${i.h / (b.h || 1)}) translate(${-b.x} ${-b.y})`}
            >
              {i.children?.map((c) => (
                <DrawItem
                  key={c.id}
                  item={c}
                  plan={plan}
                  interactive={interactive}
                />
              ))}
            </g>
          ) : (
            <g stroke={ink} strokeWidth={1.5}>
              <Symbol i={i} />
            </g>
          )}
        </g>
      );
    }
    return (
      <g data-item-id={i.id} data-item-type={i.type} opacity={1}>
        {shape}
      </g>
    );
  },
  (a, b) =>
    a.interactive === b.interactive &&
    a.item === b.item &&
    ((a.item.type !== "wall" &&
      a.item.type !== "door" &&
      a.item.type !== "window") ||
      a.plan === b.plan),
);
