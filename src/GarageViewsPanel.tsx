import { useState } from "react";
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

  return (
    <>
      <h3>Section and elevations</h3>
      <p>
        Set heights and the roof in Building, and opening dimensions in
        Properties.
      </p>
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
