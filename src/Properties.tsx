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
  type DoorStyle,
  clone,
  dist,
  angle,
  setCorner,
  normalizeOpenings,
  isRect,
  groupItems,
  ungroupItems,
} from "./model";
import { openingVertical, wallHeight, DEFAULT_WALL_HEIGHT } from "./building";
import type { Tool } from "./Canvas";
import {
  isEditProtected,
  isLayerLocked,
  renovationStatus,
  renovationStyles,
  renovationViews,
  type RenovationStatus,
  type RenovationView,
} from "./layers";
import { type Room, formatRoomArea } from "./rooms";
import type { ExteriorContour } from "./exterior";
import WallJunctionControls from "./WallJunctionControls";
import { dimensionEndpoints, mapDimensionAnchors } from "./dimensions";

const exteriorMessages = {
  open: "Close the wall loop to show exterior dimensions.",
  unsupported:
    "Exterior lengths need one closed outer outline with straight walls and no inward corners.",
  uncalibrated: "Calibrate scale to show exterior dimensions in meters.",
};

export function DoorStyleSelect({
  label = "Door type",
  value,
  onChange,
}: {
  label?: string;
  value: DoorStyle;
  onChange: (style: DoorStyle) => void;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value as DoorStyle)}
    >
      <option value="hinged">Hinged door</option>
      <option value="sliding">Sliding door</option>
    </select>
  );
}
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
  exterior,
  selection,
  commit,
  setSelection,
  setTool,
  onDuplicate,
  onDelete,
  onError,
  onShowExteriorDimensions,
  onRenovationView,
}: {
  plan: Plan;
  rooms: Room[];
  roomError?: string;
  exterior: ExteriorContour;
  selection: string[];
  commit: (p: Plan, base?: Plan, strict?: boolean) => void;
  setSelection: (s: string[]) => void;
  setTool: (t: Tool) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onError: (s: string) => void;
  onShowExteriorDimensions: (show: boolean) => void;
  onRenovationView?: (view: RenovationView) => void;
}) {
  const items = plan.items.filter((i) => selection.includes(i.id)),
    item = items.length === 1 ? items[0] : null;
  const itemProtected = !!item && isEditProtected(plan, item);
  const lockableItems = items.filter(
    (item) =>
      !isLayerLocked(plan, item) &&
      (!isEditProtected(plan, item) || item.locked),
  );
  const allLocked = lockableItems.every((item) => item.locked);
  const groupProtected = items.some((item) => isEditProtected(plan, item));
  const selectedWalls = new Set(
    items
      .filter((item) => item.type === "wall" && !isEditProtected(plan, item))
      .map((item) => item.id),
  );
  const statuses = new Set(items.map((item) => renovationStatus(plan, item)));
  const units = plan.calibration.calibrated ? "cm" : "units";
  const endpoints =
    item?.type === "dimension" ? dimensionEndpoints(item, plan.items) : null;
  const walls = items.filter((i): i is Wall => i.type === "wall");
  const openingSize =
    item?.type === "door" || item?.type === "window"
      ? openingVertical(plan, item)
      : undefined;
  function setWallHeight(height: number | undefined) {
    const selected = new Set(
      walls
        .filter((wall) => !isEditProtected(plan, wall))
        .map((wall) => wall.id),
    );
    commit({
      ...plan,
      items: plan.items.map((item) =>
        item.type === "wall" && selected.has(item.id)
          ? { ...item, height }
          : item,
      ),
    });
  }
  function patch(changes: Partial<Item>) {
    if (!item || itemProtected) return;
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
  function moveCorner(wall: Wall, end: "a" | "b", point: Wall["a"]) {
    action(() =>
      commit(
        setCorner(plan, wall.id, end, point, true, (item) =>
          isEditProtected(plan, item),
        ),
      ),
    );
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
                  allLocked
                    ? "Unlock selected objects"
                    : "Lock selected objects"
                }
                aria-label={
                  allLocked
                    ? "Unlock selected objects"
                    : "Lock selected objects"
                }
                disabled={!lockableItems.length}
                onClick={() => {
                  const p = clone(plan),
                    lock = !allLocked;
                  p.items.forEach((i) => {
                    if (lockableItems.some((selected) => selected.id === i.id))
                      i.locked = lock;
                  });
                  commit(p);
                }}
              >
                {allLocked ? (
                  <UnlockKeyhole size={17} />
                ) : (
                  <LockKeyhole size={17} />
                )}
              </button>
              {items.length > 1 && (
                <button
                  title="Group selection"
                  aria-label="Group selection"
                  disabled={groupProtected}
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
                  disabled={itemProtected}
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
                  disabled={itemProtected}
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
            {itemProtected && (
              <p className="notice">
                Object or layer is locked. Unlock it to edit this object.
              </p>
            )}
          </>
        )}
      </div>
      {onRenovationView && (
        <div className="panel-section">
          <label className="field">
            <span>Renovation view</span>
            <select
              aria-label="Renovation view"
              value={plan.renovationView ?? "all"}
              onChange={(event) =>
                onRenovationView(event.target.value as RenovationView)
              }
            >
              {Object.entries(renovationViews).map(([value, view]) => (
                <option key={value} value={value}>
                  {view.title}
                </option>
              ))}
            </select>
          </label>
          {selectedWalls.size > 0 && (
            <label className="field">
              <span>Renovation status</span>
              <select
                aria-label="Renovation status"
                value={statuses.size === 1 ? [...statuses][0] : ""}
                onChange={(event) => {
                  const renovationStatus = event.target
                    .value as RenovationStatus;
                  commit({
                    ...plan,
                    items: plan.items.map((entry) =>
                      entry.type === "wall" && selectedWalls.has(entry.id)
                        ? { ...entry, renovationStatus }
                        : entry,
                    ),
                  });
                }}
              >
                <option value="" disabled>
                  Mixed
                </option>
                {Object.entries(renovationStyles).map(([value, style]) => (
                  <option key={value} value={value}>
                    {style.label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {(item?.type === "door" || item?.type === "window") && (
            <p className="muted">
              Renovation status follows its wall (
              {
                renovationStyles[renovationStatus(plan, item) ?? "existing"]
                  .label
              }
              ).
            </p>
          )}
        </div>
      )}
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
      {walls.length > 0 && (
        <section className="panel-section" aria-label="Wall heights">
          <h3>
            {walls.length === 1 ? "Wall height" : "Selected wall heights"}
          </h3>
          {walls.length === 1 ? (
            <NumberField
              label="Wall height"
              value={wallHeight(plan, walls[0])}
              onChange={setWallHeight}
              disabled={isEditProtected(plan, walls[0])}
              unit="cm"
              min={1}
              max={5000}
            />
          ) : (
            <form
              className="wall-height-batch"
              onSubmit={(event) => {
                event.preventDefault();
                const value = new FormData(event.currentTarget).get("height");
                if (value) setWallHeight(Number(value));
                event.currentTarget.reset();
              }}
            >
              <label className="field">
                <span>Height for selected walls</span>
                <div>
                  <input
                    key={walls.map((wall) => wall.id).join(",")}
                    name="height"
                    aria-label="Height for selected walls"
                    type="number"
                    step="any"
                    min={1}
                    max={5000}
                    required
                    disabled={walls.every((wall) =>
                      isEditProtected(plan, wall),
                    )}
                  />
                  <small>cm</small>
                </div>
              </label>
              <button
                disabled={walls.every((wall) => isEditProtected(plan, wall))}
                type="submit"
              >
                Apply height
              </button>
            </form>
          )}
          {walls.some(
            (wall) => !isEditProtected(plan, wall) && wall.height !== undefined,
          ) ? (
            <button onClick={() => setWallHeight(undefined)}>
              Use floor default
            </button>
          ) : (
            <p className="muted">
              Floor default{" "}
              {plan.building?.defaultWallHeight ?? DEFAULT_WALL_HEIGHT} cm.
            </p>
          )}
        </section>
      )}
      {openingSize && item && (
        <section className="panel-section" aria-label="Opening height settings">
          <h3>Opening height</h3>
          <NumberField
            label="Opening height"
            value={openingSize.height}
            onChange={(height) => patch({ height })}
            disabled={item.locked}
            min={1}
            max={5000}
          />
          <NumberField
            label="Sill above floor"
            value={openingSize.sill}
            onChange={(sill) => patch({ sill })}
            disabled={item.locked}
            min={0}
            max={5000}
          />
          {!openingSize.fits && (
            <p className="notice" role="status">
              The opening extends above its wall. Increase the wall height or
              lower the opening.
            </p>
          )}
        </section>
      )}
      <section className="panel-section" aria-label="Exterior dimensions">
        <label className="property-checkbox">
          <input
            type="checkbox"
            checked={plan.showExteriorDimensions !== false}
            onChange={(event) => onShowExteriorDimensions(event.target.checked)}
          />
          Show exterior wall lengths
        </label>
        {exterior.status !== "ready" && (
          <p className="notice" role="status">
            {exteriorMessages[exterior.status]}
          </p>
        )}
      </section>
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
      {item && !itemProtected && (
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
                    moveCorner(item, "b", {
                      x: item.a.x + Math.cos(r) * length,
                      y: item.a.y + Math.sin(r) * length,
                    });
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
                      moveCorner(item, "b", {
                        x: item.a.x + Math.cos(r) * l,
                        y: item.a.y + Math.sin(r) * l,
                      });
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
                          moveCorner(item, end, { ...item[end], x })
                        }
                      />
                      <NumberField
                        label={`${n ? "End" : "Start"} Y`}
                        unit={units}
                        value={item[end].y}
                        onChange={(y) =>
                          moveCorner(item, end, { ...item[end], y })
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
              <WallJunctionControls
                key={item.id}
                plan={plan}
                wall={item}
                protectedItem={(item) => isEditProtected(plan, item)}
                onCommit={(p) => commit(p, undefined, true)}
                onError={onError}
              />
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
                <>
                  <label className="field">
                    <span>Door type</span>
                    <DoorStyleSelect
                      value={item.style ?? "hinged"}
                      onChange={(style) => patch({ style })}
                    />
                  </label>
                  <div className="button-stack">
                    {item.style === "sliding" ? (
                      <button
                        onClick={() =>
                          patch({
                            slideDirection: item.slideDirection === -1 ? 1 : -1,
                          })
                        }
                      >
                        <FlipHorizontal size={16} /> Flip slide direction
                      </button>
                    ) : (
                      <>
                        <button onClick={() => patch({ hinge: -item.hinge })}>
                          <FlipHorizontal size={16} /> Flip hinge side
                        </button>
                        <button onClick={() => patch({ swing: -item.swing })}>
                          <FlipVertical size={16} /> Flip swing direction
                        </button>
                      </>
                    )}
                  </div>
                </>
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
          {item.type === "dimension" && endpoints && (
            <div className="panel-section">
              <h3>Dimension</h3>
              <p className="measure-value">
                {dist(endpoints.a, endpoints.b).toFixed(1)}{" "}
                <small>{units}</small>
              </p>
              <NumberField
                label="Annotation offset"
                unit={units}
                value={item.offset}
                onChange={(v) => patch({ offset: v })}
              />
              {(["a", "b"] as const).map((end, n) => {
                const anchor = item.anchors?.[end];
                const label = n ? "End" : "Start";
                const target =
                  anchor && plan.items.find((i) => i.id === anchor.itemId);
                if (anchor && target) {
                  const point =
                    anchor.point === "a"
                      ? "start"
                      : anchor.point === "b"
                        ? "end"
                        : "center";
                  return (
                    <div key={end} className="field">
                      <span>
                        {label} attached to {target.name || target.id} {point}
                      </span>
                      <button
                        onClick={() => {
                          const updated = mapDimensionAnchors(
                            item,
                            plan.items,
                            (candidate) =>
                              candidate === anchor ? undefined : candidate,
                          );
                          commit({
                            ...plan,
                            items: plan.items.map((i) =>
                              i.id === item.id ? updated : i,
                            ),
                          });
                        }}
                      >
                        Detach {label.toLowerCase()}
                      </button>
                    </div>
                  );
                }
                return (
                  <div className="field-grid" key={end}>
                    <NumberField
                      label={`${label} X`}
                      unit={units}
                      value={endpoints[end].x}
                      onChange={(v) =>
                        patch({ [end]: { ...endpoints[end], x: v } })
                      }
                    />
                    <NumberField
                      label={`${label} Y`}
                      unit={units}
                      value={endpoints[end].y}
                      onChange={(v) =>
                        patch({ [end]: { ...endpoints[end], y: v } })
                      }
                    />
                  </div>
                );
              })}
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
