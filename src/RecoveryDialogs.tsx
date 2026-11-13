import { useLanguage, useTranslation } from "./i18n";
import { useEffect, useRef, useState } from "react";
import type { RecoveryRevision } from "./recovery";

export function RecoveryDialog({
  revisions,
  onClose,
  onRestore,
}: {
  revisions: RecoveryRevision[];
  onClose: () => void;
  onRestore: (revision: RecoveryRevision) => void;
}) {
  const language = useLanguage();
  const t = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="modal save-dialog"
      aria-labelledby="recovery-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id="recovery-title">{t("Local recovery history")}</h2>
      {revisions.length > 0 ? (
        <label className="field">
          <span>{t("Revision to restore")}</span>
          <select
            value={selected}
            onChange={(event) => setSelected(Number(event.target.value))}
          >
            {revisions.map(({ project, savedAt }, index) => (
              <option key={index} value={index}>
                {project.name || t("Untitled plan")} ·{" "}
                {savedAt === null
                  ? t("Legacy recovery, save time unavailable")
                  : new Date(savedAt).toLocaleString(language)}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p>{t("No local revisions available.")}</p>
      )}
      <div className="modal-actions">
        <button onClick={onClose}>{t("Cancel")}</button>
        <button
          className="primary"
          disabled={!revisions.length}
          onClick={() => onRestore(revisions[selected])}
        >
          {t("Restore revision")}
        </button>
      </div>
    </dialog>
  );
}

export function ReplaceProjectDialog({
  action,
  onClose,
  onContinue,
}: {
  action: string;
  onClose: () => void;
  onContinue: (download: boolean) => void;
}) {
  const t = useTranslation();
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="modal save-dialog"
      aria-labelledby="replace-project-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id="replace-project-title">{t("Save your current project?")}</h2>
      <p>
        {t("The current project has changes that aren’t in a project file.")}
      </p>
      <div className="modal-actions">
        <button onClick={onClose}>{t("Cancel")}</button>
        <button onClick={() => onContinue(false)}>{action}</button>
        <button className="primary" onClick={() => onContinue(true)}>
          {t("Download and continue")}
        </button>
      </div>
    </dialog>
  );
}
