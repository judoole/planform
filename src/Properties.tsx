import { useState, useEffect, useRef } from "react";
import {
  Copy,
  Trash2,
  LockKeyhole,
  UnlockKeyhole,
  FlipHorizontal,
  FlipVertical,
  Layers,
  Ungroup,
  Group,
} from "lucide-react";
import {
  type Plan,
  type Item,
  type RectItem,
  type Wall,
  clone,
  dist,
  angle,
  setCorner,
  normalizeOpenings,
  isRect,
  groupItems,
  ungroupItems,
} from "./model";
import type { Tool } from "./Canvas";
import { type Room, formatRoomArea } from "./rooms";
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  unit = "cm",
  disabled = false,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
  disabled?: boolean;
}) {
  const [v, setV] = useState(String(Number(value.toFixed(3))));
  const dirty = useRef(false);
  useEffect(() => {
    setV(String(Number(value.toFixed(3))));
    dirty.current = false;
  }, [value]);
  function finish() {
    if (!dirty.current) return;
    dirty.current = false;
    const n = Number(v);
    if (
      v.trim() &&
      Number.isFinite(n) &&
      (min === undefined || n >= min) &&
      (max === undefined || n <= max)
    ) {
      if (Math.abs(n - value) > 1e-8) onChange(n);
    } else setV(String(Number(value.toFixed(3))));
  }
  return (
    <label className="field">
      <span>{label}</span>
      <div>
        <input
          aria-label={label}
          type="number"
          step="any"
          value={v}
          min={min}
          max={max}
          disabled={disabled}
          onChange={(e) => {
            dirty.current = true;
            setV(e.target.value);
          }}
          onBlur={finish}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              dirty.current = false;
              setV(String(value));
              e.currentTarget.blur();
            }
          }}
        />
        <small>{unit}</small>
      </div>
    </label>
  );
}
export default function Properties({
  plan,
  rooms,
  roomError,
  selection,
  commit,
  setSelection,
  setTool,
  onDuplicate,
  onDelete,
  onError,
}: {
  plan: Plan;
  rooms: Room[];
  roomError?: string;
  selection: string[];
  commit: (p: Plan) => void;
  setSelection: (s: string[]) => void;
  setTool: (t: Tool) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onError: (s: string) => void;
}) {
  const items = plan.items.filter((i) => selection.includes(i.id)),
    item = items.length === 1 ? items[0] : null;
  const units = plan.calibration.calibrated ? "cm" : "units";
  function patch(changes: Partial<Item>) {
    if (!item || item.locked) return;
    commit(
      normalizeOpenings({
        ...plan,
        items: plan.items.map((i) =>
          i.id === item.id ? ({ ...i, ...changes } as Item) : i,
        ),
      }),
    );
  }
  function action(f: () => void) {
    try {
      f();
    } catch (e) {
      onError((e as Error).message);
    }
  }
  return (
    <div className="properties-content">
      <div className="panel-section">
        <div className="eyebrow">
          {items.length ? `${items.length} selected` : "Document"}
        </div>
        <h2>
          {item?.name ||
            (items.length ? "Multiple objects" : "Your floor plan")}
        </h2>
        {!items.length && (
          <p className="muted">
            Select an object to adjust its dimensions, position and appearance.
          </p>
        )}
        {items.length > 0 && (
          <>
            <div className="object-actions">
              <button
                title="Duplicate selected objects"
                aria-label="Duplicate selected objects"
                onClick={onDuplicate}
              >
                <Copy size={17} />
              </button>
              <button
                title="Delete selected objects"
                aria-label="Delete selected objects"
                onClick={onDelete}
              >
                <Trash2 size={17} />
              </button>
              <button
                title={
                  items.every((i) => i.locked)
                    ? "Unlock selected objects"
                    : "Lock selected objects"
                }
                aria-label={
                  items.every((i) => i.locked)
                    ? "Unlock selected objects"
                    : "Lock selected objects"
                }
                onClick={() => {
                  const p = clone(plan),
                    lock = !items.every((i) => i.locked);
                  p.items.forEach((i) => {
                    if (selection.includes(i.id)) i.locked = lock;
                  });
                  commit(p);
                }}
              >
                {items.every((i) => i.locked) ? (
                  <UnlockKeyhole size={17} />
                ) : (
                  <LockKeyhole size={17} />
                )}
              </button>
              {items.length > 1 && (
                <button
                  title="Group selection"
                  aria-label="Group selection"
                  onClick={() =>
                    action(() => {
                      const p = groupItems(plan, selection),
                        g = p.items.find(
                          (i) =>
                            i.type === "group" &&
                            !plan.items.some((x) => x.id === i.id),
                        )!;
                      commit(p);
                      setSelection([g.id]);
                    })
                  }
                >
                  <Group size={17} />
                </button>
              )}
              {item?.type === "group" && (
                <button
                  title="Ungroup"
                  aria-label="Ungroup"
                  onClick={() =>
                    action(() => {
                      const p = ungroupItems(plan, item.id);
                      commit(p);
                      setSelection(item.children?.map((i) => i.id) || []);
                    })
                  }
                >
                  <Ungroup size={17} />
                </button>
              )}
            </div>
            {item && (
              <label className="field">
                <span>Object name</span>
                <input
                  key={item.id + item.name}
                  defaultValue={item.name}
                  disabled={item.locked}
                  onBlur={(e) => {
                    if (e.target.value !== item.name)
                      patch({ name: e.target.value });
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                />
              </label>
            )}
            {item?.locked && (
              <p className="notice">
                Reference locked. Unlock to edit this object.
              </p>
            )}
          </>
        )}
      </div>
      {item?.evidence && (
        <div className="panel-section">
          <h3>
            {item.evidence.basis === "estimated"
              ? "Estimated geometry"
              : "Measured geometry"}
          </h3>
          <p className="notice">{item.evidence.note}</p>
        </div>
      )}
      <section className="panel-section room-areas" aria-label="Room areas">
        <h3>Room areas</h3>
        {roomError ? (
          <p className="notice">{roomError}</p>
        ) : !rooms.length ? (
          <p className="muted">
            Close a space with walls to calculate its area automatically.
          </p>
        ) : !plan.calibration.calibrated ? (
          <p className="notice">
            {rooms.length} enclosed {rooms.length === 1 ? "room" : "rooms"}.
            Calibrate scale to display areas in m².
          </p>
        ) : (
          <>
            {rooms.map((room, n) => (
              <div className="stat-row" key={n}>
                <span>Room {n + 1}</span>
                <strong>{formatRoomArea(room.areaCm2)}</strong>
              </div>
            ))}
            <div className="stat-row room-area-total">
              <span>Total room area</span>
              <strong>
                {formatRoomArea(
                  rooms.reduce((sum, room) => sum + room.areaCm2, 0),
                )}
              </strong>
            </div>
            <p className="muted">
              Inside wall faces, excluding wall thickness. Updates as walls
              change.
            </p>
          </>
        )}
      </section>
      {item && !item.locked && (
        <>
          {item.type === "wall" && (
            <>
              <div className="panel-section">
                <h3>Wall geometry</h3>
                <NumberField
                  label="Length"
                  unit={units}
                  min={1}
                  value={dist(item.a, item.b)}
                  onChange={(length) => {
                    const r = (angle(item.a, item.b) * Math.PI) / 180;
                    commit(
                      setCorner(plan, item.id, "b", {
                        x: item.a.x + Math.cos(r) * length,
                        y: item.a.y + Math.sin(r) * length,
                      }),
                    );
                  }}
                />
                <div className="field-grid">
                  <NumberField
                    label="Thickness"
                    unit={units}
                    value={item.thickness}
                    min={1}
                    onChange={(v) => patch({ thickness: v })}
                  />
                  <NumberField
                    label="Angle"
                    unit="°"
                    value={angle(item.a, item.b)}
                    onChange={(v) => {
                      const l = dist(item.a, item.b),
                        r = (v * Math.PI) / 180;
                      commit(
                        setCorner(plan, item.id, "b", {
                          x: item.a.x + Math.cos(r) * l,
                          y: item.a.y + Math.sin(r) * l,
                        }),
                      );
                    }}
                  />
                </div>
              </div>
              <div className="panel-section">
                <h3>Endpoints</h3>
                {(["a", "b"] as const).map((end, n) => (
                  <div key={end}>
                    <span className="eyebrow">{n ? "End" : "Start"}</span>
                    <div className="field-grid">
                      <NumberField
                        label={`${n ? "End" : "Start"} X`}
                        unit={units}
                        value={item[end].x}
                        onChange={(x) =>
                          commit(
                            setCorner(plan, item.id, end, { ...item[end], x }),
                          )
                        }
                      />
                      <NumberField
                        label={`${n ? "End" : "Start"} Y`}
                        unit={units}
                        value={item[end].y}
                        onChange={(y) =>
                          commit(
                            setCorner(plan, item.id, end, { ...item[end], y }),
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
                <p className="notice">
                  Shared corners move together. Moving an endpoint also updates
                  every connected wall.
                </p>
              </div>
            </>
          )}
          {(item.type === "door" || item.type === "window") && (
            <div className="panel-section">
              <h3>Wall attachment</h3>
              <p className="muted">
                Attached to {plan.items.find((i) => i.id === item.hostId)?.name}
              </p>
              <NumberField
                label="Opening width"
                unit={units}
                min={1}
                value={item.width}
                onChange={(v) => patch({ width: v })}
              />
              <NumberField
                label="Distance from wall start"
                unit={units}
                min={0}
                value={
                  item.t *
                  dist(
                    (plan.items.find((i) => i.id === item.hostId) as Wall).a,
                    (plan.items.find((i) => i.id === item.hostId) as Wall).b,
                  )
                }
                onChange={(v) => {
                  const w = plan.items.find(
                    (i) => i.id === item.hostId,
                  ) as Wall;
                  patch({ t: v / dist(w.a, w.b) });
                }}
              />
              {item.type === "door" && (
                <div className="button-stack">
                  <button onClick={() => patch({ hinge: -item.hinge })}>
                    <FlipHorizontal size={16} /> Flip hinge side
                  </button>
                  <button onClick={() => patch({ swing: -item.swing })}>
                    <FlipVertical size={16} /> Flip swing direction
                  </button>
                </div>
              )}
              <p className="notice">
                Openings follow their wall. If space shrinks, openings move or
                shrink to fit; openings with less than 5 cm available are
                removed. Deleting the wall removes its openings.
              </p>
            </div>
          )}
          {isRect(item) && (
            <>
              <div className="panel-section">
                <h3>Position & size</h3>
                <div className="field-grid">
                  <NumberField
                    label="Position X"
                    unit={units}
                    value={item.x}
                    onChange={(v) => patch({ x: v })}
                  />
                  <NumberField
                    label="Position Y"
                    unit={units}
                    value={item.y}
                    onChange={(v) => patch({ y: v })}
                  />
                  <NumberField
                    label="Width"
                    unit={units}
                    value={item.w}
                    min={0.001}
                    onChange={(v) => patch({ w: v })}
                  />
                  <NumberField
                    label="Height / length"
                    unit={units}
                    value={item.h}
                    min={0.001}
                    onChange={(v) => patch({ h: v })}
                  />
                </div>
                <NumberField
                  label="Rotation"
                  unit="°"
                  value={item.rotation}
                  onChange={(v) => patch({ rotation: v })}
                />
                {item.type === "stairs" && (
                  <NumberField
                    label="Number of steps"
                    unit="steps"
                    value={item.steps || 12}
                    min={2}
                    max={100}
                    onChange={(v) => patch({ steps: Math.round(v) })}
                  />
                )}
              </div>
              {item.type === "text" && (
                <div className="panel-section">
                  <h3>Label</h3>
                  <label className="field">
                    <span>Text</span>
                    <input
                      key={item.id + item.text}
                      defaultValue={item.text}
                      onBlur={(e) => patch({ text: e.target.value })}
                    />
                  </label>
                  <NumberField
                    label="Font size"
                    min={1}
                    unit={units}
                    value={item.fontSize || 18}
                    onChange={(v) => patch({ fontSize: v })}
                  />
                </div>
              )}
            </>
          )}
          {item.type === "dimension" && (
            <div className="panel-section">
              <h3>Dimension</h3>
              <p className="measure-value">
                {dist(item.a, item.b).toFixed(1)} <small>{units}</small>
              </p>
              <NumberField
                label="Annotation offset"
                unit={units}
                value={item.offset}
                onChange={(v) => patch({ offset: v })}
              />
              {(["a", "b"] as const).map((end, n) => (
                <div className="field-grid" key={end}>
                  <NumberField
                    label={`${n ? "End" : "Start"} X`}
                    unit={units}
                    value={item[end].x}
                    onChange={(v) => patch({ [end]: { ...item[end], x: v } })}
                  />
                  <NumberField
                    label={`${n ? "End" : "Start"} Y`}
                    unit={units}
                    value={item[end].y}
                    onChange={(v) => patch({ [end]: { ...item[end], y: v } })}
                  />
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {!items.length && (
        <>
          <div className="panel-section">
            <h3>Drawing settings</h3>
            {plan.source && (
              <>
                <p className="muted">
                  Source: {plan.source.file}
                  {plan.source.page ? ` · page ${plan.source.page}` : ""}
                </p>
                {plan.source.notes.map((note, n) => (
                  <p className="notice" key={n}>
                    {note}
                  </p>
                ))}
              </>
            )}
            <NumberField
              label="Grid spacing"
              value={plan.grid}
              min={1}
              max={1000}
              unit={units}
              onChange={(v) => commit({ ...plan, grid: v })}
            />
            <div className="stat-row">
              <span>Objects</span>
              <strong>{plan.items.length.toLocaleString()}</strong>
            </div>
            <div className="stat-row">
              <span>Floor</span>
              <strong>01 · Ground floor</strong>
            </div>
            <div className="stat-row">
              <span>Units</span>
              <strong>
                {plan.calibration.calibrated ? "Centimeters" : "Uncalibrated"}
              </strong>
            </div>
          </div>
          <div className="panel-section tip-card">
            <Layers size={22} />
            <h3>A little plan. A big possibility.</h3>
            <p>
              Start with walls, add openings, then make the space your own. All
              dimensions can be edited precisely.
            </p>
            <button onClick={() => setTool("room")}>
              Draw a room <span>↗</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
