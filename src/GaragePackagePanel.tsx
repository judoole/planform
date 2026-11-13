import { useMemo, useState } from "react";
import { download } from "./exports";
import type { GarageDetails } from "./garage";
import {
  garagePackageZip,
  permitGuideUrl,
  permitStatusLabels,
  prepareGaragePackage,
  separatePermitDocuments,
  type GaragePermitDetails,
  type PermitSiteSheet,
  type SeparatePermitDocument,
} from "./garagePackage";
import type { Plan } from "./model";

export default function GaragePackagePanel({
  plan,
  onChange,
  makeSiteSheet,
}: {
  plan: Plan;
  onChange: (details: GarageDetails) => void;
  makeSiteSheet: PermitSiteSheet;
}) {
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const prepared = useMemo(
    () => prepareGaragePackage(plan, makeSiteSheet),
    [plan, makeSiteSheet],
  );
  const permit = plan.garage?.permit ?? {};
  const missingCount = prepared.entries.filter(
    ({ status }) => status === "missing",
  ).length;
  function update(changes: Partial<GaragePermitDetails>) {
    onChange({ ...plan.garage, permit: { ...permit, ...changes } });
  }
  async function save() {
    setExporting(true);
    setMessage("");
    setError("");
    try {
      const result = await garagePackageZip(prepared);
      download(result.blob, result.name);
      setMessage(
        result.missing.length
          ? `Downloaded with ${result.missing.length} missing or incomplete items. See the attachment checklist.`
          : "Downloaded the application draft and attachment checklist.",
      );
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setExporting(false);
    }
  }
  return (
    <div className="garage-package">
      <div className="sheet-fields">
        <label>
          Property identifier
          <input
            value={permit.propertyId ?? ""}
            maxLength={120}
            placeholder="e.g. Gnr. 12, bnr. 34"
            onChange={(event) => update({ propertyId: event.target.value })}
          />
        </label>
        <label>
          Property address
          <input
            value={permit.address ?? ""}
            maxLength={200}
            onChange={(event) => update({ address: event.target.value })}
          />
        </label>
        <label>
          Project description
          <textarea
            rows={4}
            value={permit.description ?? ""}
            maxLength={10000}
            onChange={(event) => update({ description: event.target.value })}
          />
        </label>
      </div>
      <h3>Attachment checklist</h3>
      <ul className="permit-checklist">
        {prepared.entries
          .filter(
            (entry) =>
              !Object.values(separatePermitDocuments).includes(
                entry.title as (typeof separatePermitDocuments)[SeparatePermitDocument],
              ),
          )
          .map((entry) => (
            <li key={entry.title}>
              <strong>{entry.title}</strong>
              <span>{permitStatusLabels[entry.status]}</span>
              {entry.detail && <small>{entry.detail}</small>}
            </li>
          ))}
      </ul>
      <div className="sheet-fields">
        {(Object.keys(separatePermitDocuments) as SeparatePermitDocument[]).map(
          (key) => (
            <label key={key}>
              {separatePermitDocuments[key]}
              <select
                value={permit.separate?.[key] ?? "missing"}
                onChange={(event) => {
                  const status = event.target.value as NonNullable<
                    GaragePermitDetails["separate"]
                  >[SeparatePermitDocument];
                  update({ separate: { ...permit.separate, [key]: status } });
                }}
              >
                <option value="missing">Missing</option>
                <option value="supplied">Supplied separately</option>
                <option value="notApplicable">Not applicable</option>
              </select>
            </label>
          ),
        )}
      </div>
      <p>
        <a href={permitGuideUrl} target="_blank" rel="noreferrer">
          Levanger documentation guide
        </a>
      </p>
      <p>
        {missingCount === 0
          ? "All checklist items are accounted for."
          : `${missingCount} missing or incomplete items. You can download and review a partial package.`}
      </p>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <button onClick={() => void save()} disabled={exporting}>
        {exporting
          ? "Preparing application package…"
          : "Download application package"}
      </button>
    </div>
  );
}
