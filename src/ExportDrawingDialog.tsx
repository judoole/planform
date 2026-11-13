import { useTranslation } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { download, exportPng } from "./exports";
import type { Plan } from "./model";
import type { BackgroundId } from "./mapProvider";
import type { useParcelMap } from "./useParcelMap";
import { renderPlanSvg } from "./preview";
import DrawingPdfExport from "./DrawingPdfExport";

type Format = "pdf" | "svg" | "png";

export default function ExportDrawingDialog({
  plan,
  mapBackground,
  parcels,
  name,
  onClose,
  onAdditionalDrawings,
}: {
  plan: Plan;
  mapBackground: BackgroundId;
  parcels: ReturnType<typeof useParcelMap>;
  name: string;
  onClose: () => void;
  onAdditionalDrawings: () => void;
}) {
  const t = useTranslation();
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
        aria-label={t("Close drawing export")}
        onClick={onClose}
      >
        <X size={16} />
      </button>
      <h2 id="drawing-export-title">{t("Export drawing")}</h2>
      <p>{t("Download your available drawing views together in one PDF.")}</p>
      <label className="field">
        <span>{t("Format")}</span>
        <select
          value={format}
          onChange={(event) => {
            setFormat(event.target.value as Format);
            setFailure("");
          }}
        >
          <option value="pdf">PDF</option>
          <option value="svg">{t("SVG · vector drawing")}</option>
          <option value="png">{t("PNG · image")}</option>
        </select>
      </label>
      {format === "pdf" ? (
        <DrawingPdfExport
          plan={plan}
          name={name}
          mapBackground={mapBackground}
          parcels={parcels}
        />
      ) : (
        <>
          {svg && (
            <img
              className="sheet-preview"
              src={`data:image/svg+xml,${encodeURIComponent(svg)}`}
              alt={t("Floor plan export preview")}
            />
          )}
          {(previewError || failure) && (
            <p role="alert">{t(previewError || failure)}</p>
          )}
          <button
            className="primary"
            disabled={!svg || exporting}
            onClick={() => void saveArtwork()}
          >
            {exporting
              ? t("Preparing…")
              : t("Download {format}", { format: format.toUpperCase() })}
          </button>
        </>
      )}
      <button className="more-drawings-button" onClick={onAdditionalDrawings}>
        {t("More drawings and measurements")}
      </button>
    </dialog>
  );
}
