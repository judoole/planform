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
  const [options, setOptions] = useState<SheetOptions>({
    ...defaultSheetOptions,
    scale: initialScale,
    name,
  });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  let preview: string | undefined;
  let error: string | undefined;
  try {
    preview = sheetPreview(build(options), options);
  } catch (e) {
    error = (e as Error).message;
  }

  async function save() {
    setExporting(true);
    setExportError("");
    try {
      const drawing = build(options);
      download(
        await sheetPdf(drawing, options),
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
      <div className="sheet-fields">
        <label>
          Paper
          <select
            value={options.paper}
            onChange={(e) =>
              setOptions({
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
          Orientation
          <select
            value={options.orientation}
            onChange={(e) =>
              setOptions({
                ...options,
                orientation: e.target.value as SheetOptions["orientation"],
              })
            }
          >
            <option value="portrait">Portrait</option>
            <option value="landscape">Landscape</option>
          </select>
        </label>
        <label>
          Scale
          <select
            aria-label="Scale"
            value={options.scale}
            onChange={(e) =>
              setOptions({
                ...options,
                scale:
                  e.target.value === "fit"
                    ? "fit"
                    : (Number(e.target.value) as SheetOptions["scale"]),
              })
            }
          >
            {allowFit && <option value="fit">Fit to page</option>}
            {[50, 100, 200, 500].map((scale) => (
              <option value={scale} key={scale}>
                1:{scale}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sheet name
          <input
            maxLength={100}
            value={options.name}
            onChange={(e) => setOptions({ ...options, name: e.target.value })}
          />
        </label>
      </div>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <img
          className="sheet-preview"
          alt="Scaled sheet preview"
          src={`data:image/svg+xml,${encodeURIComponent(preview)}`}
        />
      )}
      {exportError && <p role="alert">{exportError}</p>}
      <button disabled={!preview || exporting} onClick={() => void save()}>
        {exporting ? "Preparing PDF…" : "Download PDF"}
      </button>
    </div>
  );
}
