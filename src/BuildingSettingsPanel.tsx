import {
  DEFAULT_ROOF_PITCH,
  DEFAULT_ROOF_THICKNESS,
  DEFAULT_WALL_HEIGHT,
  type RoofSettings,
} from "./building";
import type { Plan } from "./model";
import { NumberField } from "./Properties";

export default function BuildingSettingsPanel({
  plan,
  onChange,
}: {
  plan: Plan;
  onChange: (building: Plan["building"]) => void;
}) {
  const settings = plan.building ?? {};
  const roof = settings.roof;
  const setRoof = (roof: RoofSettings | undefined) =>
    onChange({ ...settings, roof });
  return (
    <div className="properties-content">
      <section className="panel-section" aria-labelledby="floor-settings">
        <h3 id="floor-settings">Floor settings</h3>
        <NumberField
          label="Default wall height"
          value={settings.defaultWallHeight ?? DEFAULT_WALL_HEIGHT}
          onChange={(defaultWallHeight) =>
            onChange({ ...settings, defaultWallHeight })
          }
          min={1}
          max={5000}
        />
        <p className="muted">
          Applies to existing and new walls that use the floor default.
        </p>
        <NumberField
          label="Finished floor level"
          value={settings.floorLevel ?? 0}
          onChange={(floorLevel) => onChange({ ...settings, floorLevel })}
          min={-1000000}
          max={1000000}
        />
      </section>
      <section className="panel-section" aria-labelledby="roof-settings">
        <h3 id="roof-settings">Roof</h3>
        <label className="field">
          <span>Roof type</span>
          <select
            aria-label="Roof type"
            value={roof?.type ?? ""}
            onChange={(event) => {
              const type = event.target.value as RoofSettings["type"] | "";
              setRoof(type ? { ...roof, type } : undefined);
            }}
          >
            <option value="">No roof</option>
            <option value="flat">Flat</option>
            <option value="shed">Shed</option>
            <option value="gable">Gable</option>
          </select>
        </label>
        {roof && (
          <>
            {roof.type !== "flat" && (
              <>
                <NumberField
                  label="Roof pitch"
                  value={roof.pitch ?? DEFAULT_ROOF_PITCH}
                  onChange={(pitch) => setRoof({ ...roof, pitch })}
                  unit="°"
                  min={1}
                  max={75}
                />
                <NumberField
                  label={
                    roof.type === "gable"
                      ? "Ridge direction"
                      : "Uphill direction"
                  }
                  value={roof.direction ?? 0}
                  onChange={(direction) => setRoof({ ...roof, direction })}
                  unit="°"
                  min={-360}
                  max={360}
                />
                <p className="muted">
                  0° points right on the plan. Angles increase clockwise.
                </p>
              </>
            )}
            <NumberField
              label="Roof thickness"
              value={roof.thickness ?? DEFAULT_ROOF_THICKNESS}
              onChange={(thickness) => setRoof({ ...roof, thickness })}
              min={1}
              max={500}
            />
          </>
        )}
      </section>
    </div>
  );
}
