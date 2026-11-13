import { useTranslation } from "./i18n";
import { download } from "./exports";
import { garageAreaReport, garageAreas, type GarageDetails } from "./garage";
import { pointsBox, type Plan, type Point } from "./model";

const confirmations = [
  ["clearFloor", "Entire ground floor is measurable"],
  ["loft", "Building has a loft"],
  ["overhang", "Building has a roof overhang"],
  ["otherArea", "Other potentially countable area"],
] as const;

const points = (polygon: Point[]) =>
  polygon.map((p) => `${p.x},${p.y}`).join(" ");

export default function GarageArea({
  plan,
  onChange,
}: {
  plan: Plan;
  onChange: (details: GarageDetails) => void;
}) {
  const t = useTranslation();
  let areas: ReturnType<typeof garageAreas>;
  try {
    areas = garageAreas(plan);
  } catch (e) {
    return <p role="alert">{t((e as Error).message)}</p>;
  }
  const { bra, bya, footprint } = areas;
  const b = pointsBox(footprint.corners);
  return (
    <>
      <div className="sheet-fields">
        {confirmations.map(([field, label]) => (
          <label key={field}>
            {t(label)}
            <select
              value={String(plan.garage?.area?.[field] ?? "")}
              onChange={(e) =>
                onChange({
                  ...plan.garage,
                  area: {
                    ...plan.garage?.area,
                    [field]:
                      e.target.value === ""
                        ? undefined
                        : e.target.value === "true",
                  },
                })
              }
            >
              <option value="">{t("Unconfirmed")}</option>
              <option value="true">{t("Yes")}</option>
              <option value="false">{t("No")}</option>
            </select>
          </label>
        ))}
      </div>
      <svg
        className="garage-area-diagram"
        role="img"
        aria-label={t("BRA inside wall faces and BYA outside wall faces")}
        viewBox={`${b.x - 18} ${b.y - 18} ${b.w + 36} ${b.h + 36}`}
      >
        <polygon
          points={points(footprint.corners)}
          fill="#a6cbbb"
          stroke="#315c4d"
          strokeWidth="5"
        />
        <polygon
          points={points(footprint.insideCorners)}
          fill="#eff6f2"
          stroke="#477d99"
          strokeWidth="5"
          strokeDasharray="12 8"
        />
      </svg>
      <p>
        <strong>BRA {bra.value.toFixed(2)} m²</strong>
        {bra.notes.length ? t(" · Provisional") : ""} ·{" "}
        {t("Inside wall faces, dashed blue.")}
      </p>
      {bra.notes.length > 0 && (
        <ul>
          {bra.notes.map((note) => (
            <li key={t(note)}>{t(note)}</li>
          ))}
        </ul>
      )}
      <p>
        <strong>BYA {bya.value.toFixed(2)} m²</strong>
        {bya.notes.length ? t(" · Provisional") : ""} ·{" "}
        {t("Outside wall faces, solid green.")}
      </p>
      {bya.notes.length > 0 && (
        <ul>
          {bya.notes.map((note) => (
            <li key={t(note)}>{t(note)}</li>
          ))}
        </ul>
      )}
      <p>
        {t(
          "Building areas only. Plot utilization accounts separately for other structures and outdoor parking.",
        )}
      </p>
      <button
        onClick={() =>
          download(
            new Blob([garageAreaReport(plan)], {
              type: "text/plain;charset=utf-8",
            }),
            "Building area calculation - BRA and BYA.txt",
          )
        }
      >
        {t("Download area calculation")}
      </button>
    </>
  );
}
