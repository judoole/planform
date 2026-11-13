import { useTranslation } from "./i18n";
import { useEffect, useRef } from "react";
import { NumberField } from "./Properties";
import type { TraceReference } from "./reference";

export default function TraceReferenceDialog({
  reference,
  onChange,
  onClose,
  onCalibrate,
  onReplace,
  onRemove,
}: {
  reference: TraceReference;
  onChange: (reference: TraceReference) => void;
  onClose: () => void;
  onCalibrate: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  const t = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  const write = (values: Partial<TraceReference>) =>
    onChange({ ...reference, ...values });
  return (
    <dialog
      ref={dialog}
      className="modal save-dialog reference-settings"
      aria-labelledby="reference-settings-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id="reference-settings-title">{t("Tracing reference")}</h2>
      <p>
        {reference.image.name}
        {reference.image.page && ` · page ${reference.image.page}`}
      </p>
      <p>
        {reference.calibrated
          ? t("Calibrated")
          : "Uncalibrated · set a known distance before tracing a measured plan"}
      </p>
      <label className="property-checkbox">
        <input
          type="checkbox"
          checked={reference.visible}
          onChange={(event) => write({ visible: event.target.checked })}
        />
        {t("Show reference")}
      </label>
      <label className="property-checkbox">
        <input
          type="checkbox"
          checked={reference.locked}
          onChange={(event) => write({ locked: event.target.checked })}
        />
        {t("Lock position and size")}
      </label>
      <label className="property-checkbox">
        <input
          type="checkbox"
          checked={reference.includeInExport}
          onChange={(event) => write({ includeInExport: event.target.checked })}
        />
        {t("Include in exports when calibrated")}
      </label>
      <NumberField
        label={t("Opacity (%)")}
        value={reference.opacity * 100}
        min={0}
        max={100}
        unit="%"
        onChange={(value) => write({ opacity: value / 100 })}
      />
      {!reference.locked && (
        <div className="reference-position">
          <NumberField
            label={t("Position X")}
            value={reference.x}
            onChange={(x) => write({ x })}
          />
          <NumberField
            label={t("Position Y")}
            value={reference.y}
            onChange={(y) => write({ y })}
          />
          <NumberField
            label={t("Reference width")}
            value={reference.width}
            min={0.001}
            onChange={(width) => write({ width, calibrated: false })}
          />
        </div>
      )}
      <div className="modal-actions">
        <button type="button" onClick={onReplace}>
          {t("Replace")}
        </button>
        <button type="button" onClick={onRemove}>
          {t("Remove")}
        </button>
        <button
          type="button"
          onClick={onCalibrate}
          disabled={!reference.visible}
        >
          {t("Calibrate scale")}
        </button>
        <button type="button" className="primary" onClick={onClose}>
          {t("Done")}
        </button>
      </div>
    </dialog>
  );
}
