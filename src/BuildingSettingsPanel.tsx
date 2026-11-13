import { useTranslation } from "./i18n";
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
  const t = useTranslation();
  const settings = plan.building ?? {};
  const roof = settings.roof;
  const setRoof = (roof: RoofSettings | undefined) =>
    onChange({ ...settings, roof });
  return (
    <div className="properties-content">
      <section className="panel-section" aria-labelledby="floor-settings">
        <h3 id="floor-settings">{t("Floor settings")}</h3>
        <NumberField
          label={t("Default wall height")}
          value={settings.defaultWallHeight ?? DEFAULT_WALL_HEIGHT}
          onChange={(defaultWallHeight) =>
            onChange({ ...settings, defaultWallHeight })
          }
          min={1}
          max={5000}
        />
        <p className="muted">
          {t("Applies to existing and new walls that use the floor default.")}
        </p>
        <details className="optional-floor-settings">
          <summary>{t("Floor elevation (optional)")}</summary>
          <NumberField
            label={t("Floor elevation")}
            value={settings.floorLevel ?? 0}
            onChange={(floorLevel) => onChange({ ...settings, floorLevel })}
            min={-1000000}
            max={1000000}
          />
          <p className="muted">
            {t(
              "The height of the floor surface where you walk, measured from a reference you choose. Leave it at 0 for a sketch. For example, enter 30 if the floor is 30 cm above the ground you use as zero.",
            )}
          </p>
        </details>
      </section>
      <section className="panel-section" aria-labelledby="roof-settings">
        <h3 id="roof-settings">{t("Roof")}</h3>
        <label className="field">
          <span>{t("Roof type")}</span>
          <select
            aria-label={t("Roof type")}
            value={roof?.type ?? ""}
            onChange={(event) => {
              const type = event.target.value as RoofSettings["type"] | "";
              setRoof(type ? { ...roof, type } : undefined);
            }}
          >
            <option value="">{t("No roof")}</option>
            <option value="flat">{t("Flat")}</option>
            <option value="shed">{t("Shed")}</option>
            <option value="gable">{t("Gable")}</option>
          </select>
        </label>
        {roof && (
          <>
            {roof.type !== "flat" && (
              <>
                <NumberField
                  label={t("Roof pitch")}
                  value={roof.pitch ?? DEFAULT_ROOF_PITCH}
                  onChange={(pitch) => setRoof({ ...roof, pitch })}
                  unit="°"
                  min={1}
                  max={75}
                />
                <NumberField
                  label={
                    roof.type === "gable"
                      ? t("Ridge direction")
                      : t("Uphill direction")
                  }
                  value={roof.direction ?? 0}
                  onChange={(direction) => setRoof({ ...roof, direction })}
                  unit="°"
                  min={-360}
                  max={360}
                />
                <p className="muted">
                  {t("0° points right on the plan. Angles increase clockwise.")}
                </p>
              </>
            )}
            <NumberField
              label={t("Roof thickness")}
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
