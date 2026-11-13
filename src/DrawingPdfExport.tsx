import { useLanguage, useTranslation } from "./i18n";
import { useEffect, useMemo, useState } from "react";
import {
  drawingPdfOptions,
  drawingPdfPages,
  type DrawingPdfPage,
} from "./drawingPdfPages";
import { download } from "./exports";
import type { Plan } from "./model";
import { backgrounds, printBackground, type BackgroundId } from "./mapProvider";
import type { useParcelMap } from "./useParcelMap";
import { SheetFields } from "./SheetExport";
import {
  defaultSheetOptions,
  layoutSheet,
  sheetPreview,
  sheetsPdf,
  type SheetOptions,
} from "./sheets";

export default function DrawingPdfExport({
  plan,
  name,
  mapBackground,
  parcels,
}: {
  plan: Plan;
  name: string;
  mapBackground: BackgroundId;
  parcels: ReturnType<typeof useParcelMap>;
}) {
  const t = useTranslation();
  const language = useLanguage();
  const { pages, canRender3D } = useMemo(
    () => drawingPdfPages(plan, parcels.data, language),
    [plan, parcels.data, language],
  );
  const [options, setOptions] = useState<SheetOptions>({
    ...defaultSheetOptions,
    scale: "fit",
    name,
  });
  const [hidden, setHidden] = useState<string[]>([]);
  const [active, setActive] = useState<string>();
  const [snapshotResult, setSnapshotResult] = useState<{
    plan: Plan;
    language: typeof language;
    pages: DrawingPdfPage[];
    error?: string;
  }>();
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!canRender3D) return;
    let current = true;
    void import("./buildingSnapshot")
      .then(({ buildingSnapshotPages }) => {
        if (current)
          setSnapshotResult({
            plan,
            language,
            pages: buildingSnapshotPages(plan, language),
          });
      })
      .catch(() => {
        if (current)
          setSnapshotResult({
            plan,
            language,
            pages: [],
            error:
              "The browser could not render the 3D views. The other pages can still be downloaded.",
          });
      });
    return () => {
      current = false;
    };
  }, [canRender3D, plan, language]);
  const snapshots =
    canRender3D &&
    snapshotResult?.plan === plan &&
    snapshotResult.language === language
      ? snapshotResult
      : undefined;
  const snapshotLoading = canRender3D && !snapshots;
  const choices: DrawingPdfPage[] = [...pages];
  if (snapshots)
    choices.splice(pages[0]?.id === "plan" ? 1 : 0, 0, ...snapshots.pages);
  const chosen = choices.filter((page) => !hidden.includes(page.id));
  const includeMap = chosen.some((page) => page.id === "property-map");
  const waitingForMap = includeMap && parcels.loading;
  const shown = chosen.find((page) => page.id === active) ?? chosen[0];
  function makePage(page: DrawingPdfPage) {
    const settings = drawingPdfOptions(
      page,
      { ...options, language },
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
        scaleLabel={t("Drawing scale")}
        showScale={chosen.some((page) => page.scale === "drawing")}
      />
      <details className="pdf-page-choices">
        <summary>
          {t("Pages included ({count})", { count: chosen.length })}
        </summary>
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
          <span>{t("Preview page")}</span>
          <select
            aria-label={t("Preview page")}
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
          alt={t("PDF page preview")}
          src={`data:image/svg+xml,${encodeURIComponent(preview)}`}
        />
      )}
      {includeMap && !backgrounds[mapBackground].exportable && (
        <p>
          {t(
            "PDF background: {print} (Kartverket). The {screen} background is for on-screen use.",
            {
              print: t(printBackground.label),
              screen: t(backgrounds[mapBackground].label).toLowerCase(),
            },
          )}
        </p>
      )}
      {waitingForMap && (
        <p role="status">{t("Loading map boundaries for the PDF…")}</p>
      )}
      {includeMap && !waitingForMap && !parcels.data.selected.length && (
        <p>{t("The selected parcel boundary is unavailable for this PDF.")}</p>
      )}
      {snapshotLoading && <p role="status">{t("Preparing the 3D views…")}</p>}
      {snapshots?.error && <p role="status">{t(snapshots.error)}</p>}
      {!choices.length && !snapshotLoading && (
        <p>{t("Add something to your drawing before exporting.")}</p>
      )}
      {(previewError || error) && (
        <p role="alert">{t(previewError || error)}</p>
      )}
      <button
        className="primary"
        disabled={
          !chosen.length ||
          !!previewError ||
          saving ||
          snapshotLoading ||
          waitingForMap
        }
        onClick={() => void save()}
      >
        {t(saving ? "Preparing PDF…" : "Download PDF")}
      </button>
    </div>
  );
}
