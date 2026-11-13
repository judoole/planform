import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { download, exportPng } from "./exports";
import type { Plan } from "./model";
import { floorPlanSheet } from "./planSheet";
import { renderPlanSvg } from "./preview";
import SheetExport from "./SheetExport";

type Format = "pdf" | "svg" | "png";

export default function ExportDrawingDialog({
  plan,
  name,
  onClose,
}: {
  plan: Plan;
  name: string;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [format, setFormat] = useState<Format>("pdf");
  const [exporting, setExporting] = useState(false);
  const [failure, setFailure] = useState("");

  useEffect(() => {
    const modal = dialog.current!;
    modal.showModal();
    return () => modal.close();
  }, []);

  let svg: string | undefined;
  let previewError = "";
  if (format !== "pdf") {
    try {
      svg = renderPlanSvg(plan);
    } catch (error) {
      previewError = (error as Error).message;
    }
  }

  async function saveArtwork() {
    if (!svg || format === "pdf") return;
    setExporting(true);
    setFailure("");
    try {
      if (format === "png") await exportPng(svg, `${name}.png`);
      else download(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`);
    } catch (error) {
      setFailure((error as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="modal save-dialog drawing-export-dialog"
      aria-labelledby="drawing-export-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button
        className="modal-close"
        aria-label="Close drawing export"
        onClick={onClose}
      >
        <X size={16} />
      </button>
      <h2 id="drawing-export-title">Export drawing</h2>
      <label className="field">
        <span>Format</span>
        <select
          value={format}
          onChange={(event) => {
            setFormat(event.target.value as Format);
            setFailure("");
          }}
        >
          <option value="pdf">PDF · scaled sheet</option>
          <option value="svg">SVG · vector drawing</option>
          <option value="png">PNG · image</option>
        </select>
      </label>
      {format === "pdf" ? (
        <SheetExport build={() => floorPlanSheet(plan)} name={name} />
      ) : (
        <>
          {svg && (
            <img
              className="sheet-preview"
              src={`data:image/svg+xml,${encodeURIComponent(svg)}`}
              alt="Floor plan export preview"
            />
          )}
          {(previewError || failure) && (
            <p role="alert">{previewError || failure}</p>
          )}
          <button
            className="primary"
            disabled={!svg || exporting}
            onClick={() => void saveArtwork()}
          >
            {exporting ? "Preparing…" : `Download ${format.toUpperCase()}`}
          </button>
        </>
      )}
    </dialog>
  );
}
