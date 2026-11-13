import { useTranslation } from "./i18n";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Download, FileJson, X } from "lucide-react";

export default function SaveDialog({
  initialName,
  onClose,
  onSave,
}: {
  initialName: string;
  onClose: () => void;
  onSave: (filename: string) => void;
}) {
  const t = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [filename, setFilename] = useState(initialName);

  useEffect(() => {
    dialog.current?.showModal();
    input.current?.select();
    return () => dialog.current?.close();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    const stem = filename
      .trim()
      .replace(/(?:\.planform)?\.json$/i, "")
      .trim();
    if (stem) onSave(`${stem}.planform.json`);
  }

  return (
    <dialog
      ref={dialog}
      className="modal save-dialog"
      aria-labelledby="save-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button
        className="modal-close"
        aria-label={t("Close save dialog")}
        onClick={onClose}
      >
        <X size={20} />
      </button>
      <span className="modal-icon">
        <FileJson size={25} />
      </span>
      <h2 id="save-title">{t("Save project")}</h2>
      <p>{t("Choose a name for the editable project file.")}</p>
      <form onSubmit={submit}>
        <label className="field">
          <span>{t("File name")}</span>
          <input
            ref={input}
            autoFocus
            value={filename}
            onChange={(event) => setFilename(event.target.value)}
            aria-label={t("File name")}
          />
        </label>
        <p className="save-extension">{t("Saved as a .planform.json file")}</p>
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            {t("Cancel")}
          </button>
          <button className="primary" type="submit" disabled={!filename.trim()}>
            <Download size={15} /> {t("Save file")}
          </button>
        </div>
      </form>
    </dialog>
  );
}
