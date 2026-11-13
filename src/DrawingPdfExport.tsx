import { useEffect, useMemo, useState } from "react";
import {
  drawingPdfOptions,
  drawingPdfPages,
  type DrawingPdfPage,
} from "./drawingPdfPages";
import { download } from "./exports";
import type { Plan } from "./model";
import { SheetFields } from "./SheetExport";
import {
  defaultSheetOptions,
  layoutSheet,
  sheetPreview,
  sheetsPdf,
  type SheetDrawing,
  type SheetOptions,
} from "./sheets";

export default function DrawingPdfExport({
  plan,
  name,
}: {
  plan: Plan;
  name: string;
}) {
  const { pages, canRender3D } = useMemo(() => drawingPdfPages(plan), [plan]);
  const [options, setOptions] = useState<SheetOptions>({
    ...defaultSheetOptions,
    scale: "fit",
    name,
  });
  const [hidden, setHidden] = useState<string[]>([]);
  const [active, setActive] = useState<string>();
  const [snapshot, setSnapshot] = useState<SheetDrawing>();
  const [snapshotError, setSnapshotError] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(canRender3D);
  useEffect(() => {
    if (!canRender3D) return;
    let current = true;
    setSnapshotLoading(true);
    setSnapshot(undefined);
    setSnapshotError("");
    void import("./buildingSnapshot")
      .then(({ buildingSnapshot }) => {
        if (current) setSnapshot(buildingSnapshot(plan));
      })
      .catch(() => {
        if (current)
          setSnapshotError(
            "The browser could not render a 3D page. The other pages can still be downloaded.",
          );
      })
      .finally(() => {
        if (current) setSnapshotLoading(false);
      });
    return () => {
      current = false;
    };
  }, [canRender3D, plan]);
  const choices: DrawingPdfPage[] = [...pages];
  if (snapshot)
    choices.splice(pages[0]?.id === "plan" ? 1 : 0, 0, {
      id: "3d",
      label: "3D view",
      scale: "fit",
      drawing: snapshot,
    });
  const chosen = choices.filter((page) => !hidden.includes(page.id));
  const shown = chosen.find((page) => page.id === active) ?? chosen[0];
  function makePage(page: DrawingPdfPage) {
    const settings = drawingPdfOptions(
      page,
      options,
      plan.calibration.calibrated,
    );
    return { drawing: page.drawing, options: settings };
  }
  let preview: string | undefined;
  let previewError: string | undefined;
  try {
    if (shown) {
      const page = makePage(shown);
      preview = sheetPreview(page.drawing, page.options);
    }
    for (const choice of chosen) {
      if (choice.id === shown?.id) continue;
      const { drawing, options } = makePage(choice);
      layoutSheet(drawing, options);
    }
  } catch (e) {
    previewError = (e as Error).message;
  }

  async function save() {
    setSaving(true);
    setError("");
    try {
      const title = options.name.trim() || name || "Planform";
      download(await sheetsPdf(chosen.map(makePage), title), `${title}.pdf`);
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="sheet-export">
      <SheetFields
        options={options}
        onChange={setOptions}
        allowFit
        scaleLabel="Drawing scale"
        showScale={chosen.some((page) => page.scale === "drawing")}
      />
      <details className="pdf-page-choices">
        <summary>Pages included ({chosen.length})</summary>
        {choices.map((page) => (
          <label key={page.id}>
            <input
              type="checkbox"
              checked={!hidden.includes(page.id)}
              onChange={(event) =>
                setHidden((previous) =>
                  event.target.checked
                    ? previous.filter((id) => id !== page.id)
                    : [...previous, page.id],
                )
              }
            />
            {page.label}
          </label>
        ))}
      </details>
      {chosen.length > 1 && (
        <label className="field">
          <span>Preview page</span>
          <select
            aria-label="Preview page"
            value={shown.id}
            onChange={(event) => setActive(event.target.value)}
          >
            {chosen.map((page) => (
              <option key={page.id} value={page.id}>
                {page.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {preview && (
        <img
          className="sheet-preview"
          alt="PDF page preview"
          src={`data:image/svg+xml,${encodeURIComponent(preview)}`}
        />
      )}
      {snapshotLoading && <p role="status">Preparing the 3D page…</p>}
      {snapshotError && <p role="status">{snapshotError}</p>}
      {!choices.length && !snapshotLoading && (
        <p>Add something to your drawing before exporting.</p>
      )}
      {(previewError || error) && <p role="alert">{previewError || error}</p>}
      <button
        className="primary"
        disabled={!chosen.length || !!previewError || saving || snapshotLoading}
        onClick={() => void save()}
      >
        {saving ? "Preparing PDF…" : "Download PDF"}
      </button>
    </div>
  );
}
