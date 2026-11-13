import { useState, type ReactNode } from "react";
import type { GarageDetails } from "./garage";
import {
  garageViewNames,
  garageViews,
  garageViewSheet,
  type GarageStructure,
  type GarageView,
} from "./garageViews";
import type { Plan, Point } from "./model";
import SheetExport from "./SheetExport";

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value?: number;
  min: number;
  max: number;
  onChange: (value: number | undefined) => void;
}) {
  const [text, setText] = useState(value?.toString() ?? "");
  const valid =
    !text.trim() ||
    (Number.isFinite(Number(text)) &&
      Number(text) >= min &&
      Number(text) <= max);
  return (
    <label>
      {label}
      <input
        type="number"
        step="any"
        min={min}
        max={max}
        value={text}
        onFocus={() => setText(value?.toString() ?? "")}
        onChange={(e) => {
          setText(e.target.value);
          if (e.target.validity.valid)
            onChange(
              e.target.value === "" ? undefined : Number(e.target.value),
            );
        }}
        aria-invalid={!valid}
      />
    </label>
  );
}

function TerrainField({
  label,
  points,
  onChange,
}: {
  label: string;
  points?: Point[];
  onChange: (points: Point[] | undefined) => void;
}) {
  const [value, setValue] = useState(
    () => points?.map(({ x, y }) => `${x}, ${y}`).join("\n") ?? "",
  );
  const [error, setError] = useState("");
  return (
    <label>
      {label}
      <textarea
        rows={3}
        aria-invalid={!!error}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => {
          if (!value.trim()) {
            if (points) onChange(undefined);
            setError("");
            return;
          }
          const rows = value
            .trim()
            .split(/\n+/)
            .map((row) => row.trim().split(/\s*,\s*/));
          const parsed = rows.map(([x, y]) => ({ x: Number(x), y: Number(y) }));
          if (
            rows.length < 2 ||
            rows.length > 150 ||
            rows.some(
              (parts, i) =>
                parts.length !== 2 ||
                parts.some(
                  (part) =>
                    !part ||
                    !Number.isFinite(Number(part)) ||
                    Math.abs(Number(part)) > 10000000,
                ) ||
                (i > 0 && parsed[i].x <= parsed[i - 1].x),
            )
          ) {
            setError(
              "Enter 2–150 lines of station, height in cm, in ascending station order.",
            );
            onChange(undefined);
            return;
          }
          setError("");
          if (JSON.stringify(parsed) !== JSON.stringify(points))
            onChange(parsed);
        }}
      />
      {error && <small role="alert">{error}</small>}
    </label>
  );
}

export default function GarageViewsPanel({
  plan,
  onChange,
}: {
  plan: Plan;
  onChange: (details: GarageDetails) => void;
}) {
  const [view, setView] = useState<GarageView>("section");
  const structure = plan.garage?.structure ?? {};
  function update(next: GarageStructure) {
    onChange({ ...plan.garage, structure: next });
  }
  const terrain = structure.terrain?.[view];
  const fields = [
    ["floor", "Finished floor level (cm)", -1000000, 1000000],
    ["wallHeight", "Clear wall height (cm)", 0.01, 5000],
    ["roofPitch", "Roof pitch (degrees)", 0.01, 75],
    ["roofThickness", "Roof thickness (cm)", 0.01, 500],
  ] as const;
  const openingFields: ReactNode[] = [];
  for (const item of plan.items) {
    if (item.type !== "door" && item.type !== "window") continue;
    const values = Object.hasOwn(structure.openings ?? {}, item.id)
      ? structure.openings?.[item.id]
      : undefined;
    for (const [field, defaultValue] of [
      ["sill", item.type === "door" ? 0 : undefined],
      ["height", undefined],
    ] as const) {
      openingFields.push(
        <NumberField
          key={`${item.id}-${field}`}
          label={`${item.name || item.type} ${field} (cm)`}
          min={field === "sill" ? 0 : 0.01}
          max={5000}
          value={values?.[field] ?? defaultValue}
          onChange={(value) =>
            update({
              ...structure,
              openings: {
                ...structure.openings,
                [item.id]: { ...values, [field]: value },
              },
            })
          }
        />,
      );
    }
  }

  return (
    <>
      <h3>Section and elevations</h3>
      <p>
        Use the same height datum for the floor and terrain. Wall height runs
        from finished floor to the roof underside.
      </p>
      <div className="sheet-fields">
        {fields.map(([field, label, min, max]) => (
          <NumberField
            key={field}
            label={label}
            min={min}
            max={max}
            value={structure[field]}
            onChange={(value) => update({ ...structure, [field]: value })}
          />
        ))}
        <label>
          Ridge direction
          <select
            value={structure.ridge ?? "long"}
            onChange={(e) =>
              update({
                ...structure,
                ridge: e.target.value as GarageStructure["ridge"],
              })
            }
          >
            <option value="long">Parallel to longer walls</option>
            <option value="short">Parallel to shorter walls</option>
          </select>
        </label>
        {openingFields}
      </div>
      <div className="sheet-fields">
        <label>
          Drawing view
          <select
            value={view}
            onChange={(e) => setView(e.target.value as GarageView)}
          >
            {garageViews.map((value) => (
              <option key={value} value={value}>
                {garageViewNames[value]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p>
        Enter one station, height pair in cm on each line. Cover the full
        drawing width. Station zero is the left exterior face.
      </p>
      <div className="sheet-fields">
        {(["existing", "proposed"] as const).map((kind) => (
          <TerrainField
            key={`${view}-${kind}`}
            label={
              kind === "existing" ? "Existing terrain" : "Proposed terrain"
            }
            points={terrain?.[kind]}
            onChange={(points) =>
              update({
                ...structure,
                terrain: {
                  ...structure.terrain,
                  [view]: { ...terrain, [kind]: points },
                },
              })
            }
          />
        ))}
      </div>
      <SheetExport name={plan.name} build={() => garageViewSheet(plan, view)} />
    </>
  );
}
