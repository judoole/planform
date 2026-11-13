import { useLanguage, useTranslation } from "./i18n";
import { useState } from "react";
import { download } from "./exports";
import {
  defaultSheetOptions,
  sheetPdf,
  sheetPreview,
  type SheetDrawing,
  type SheetOptions,
} from "./sheets";

export default function SheetExport({
  build,
  name,
  initialScale = defaultSheetOptions.scale,
  allowFit = false,
}: {
  build: (options: SheetOptions) => SheetDrawing;
  name: string;
  initialScale?: SheetOptions["scale"];
  allowFit?: boolean;
}) {
  const t = useTranslation();
  const [options, setOptions] = useState<SheetOptions>({
    ...defaultSheetOptions,
    scale: initialScale,
    name,
  });
  const language = useLanguage();
  const localizedOptions = { ...options, language };
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  let preview: string | undefined;
  let error: string | undefined;
  try {
    preview = sheetPreview(build(localizedOptions), localizedOptions);
  } catch (e) {
    error = (e as Error).message;
  }

  async function save() {
    setExporting(true);
    setExportError("");
    try {
      const drawing = build(localizedOptions);
      download(
        await sheetPdf(drawing, localizedOptions),
        `${options.name} - ${drawing.title}.pdf`,
      );
    } catch (e) {
      setExportError((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="sheet-export">
      <SheetFields
        options={options}
        onChange={setOptions}
        allowFit={allowFit}
      />
      {error && <p role="alert">{t(error)}</p>}
      {preview && (
        <img
          className="sheet-preview"
          alt={t("Scaled sheet preview")}
          src={`data:image/svg+xml,${encodeURIComponent(preview)}`}
        />
      )}
      {exportError && <p role="alert">{t(exportError)}</p>}
      <button disabled={!preview || exporting} onClick={() => void save()}>
        {t(exporting ? "Preparing PDF…" : "Download PDF")}
      </button>
    </div>
  );
}

export function SheetFields({
  options,
  onChange,
  allowFit,
  scaleLabel,
  showScale = true,
}: {
  options: SheetOptions;
  onChange: (options: SheetOptions) => void;
  allowFit?: boolean;
  scaleLabel?: string;
  showScale?: boolean;
}) {
  const t = useTranslation();
  return (
    <div className="sheet-fields">
      <label>
        {t("Paper")}
        <select
          value={options.paper}
          onChange={(e) =>
            onChange({
              ...options,
              paper: e.target.value as SheetOptions["paper"],
            })
          }
        >
          <option>A4</option>
          <option>A3</option>
        </select>
      </label>
      <label>
        {t("Orientation")}
        <select
          value={options.orientation}
          onChange={(e) =>
            onChange({
              ...options,
              orientation: e.target.value as SheetOptions["orientation"],
            })
          }
        >
          <option value="portrait">{t("Portrait")}</option>
          <option value="landscape">{t("Landscape")}</option>
        </select>
      </label>
      {showScale && (
        <label>
          {scaleLabel ?? t("Scale")}
          <select
            aria-label={scaleLabel ?? t("Scale")}
            value={options.scale}
            onChange={(e) =>
              onChange({
                ...options,
                scale:
                  e.target.value === "fit"
                    ? "fit"
                    : (Number(e.target.value) as SheetOptions["scale"]),
              })
            }
          >
            {allowFit && <option value="fit">{t("Fit to page")}</option>}
            {[50, 100, 200, 500].map((scale) => (
              <option value={scale} key={scale}>
                1:{scale}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        {t("Sheet name")}
        <input
          maxLength={100}
          value={options.name}
          onChange={(e) => onChange({ ...options, name: e.target.value })}
        />
      </label>
    </div>
  );
}
