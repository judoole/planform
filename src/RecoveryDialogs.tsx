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
      <h2 id="recovery-title">Local recovery history</h2>
      {revisions.length > 0 ? (
        <label className="field">
          <span>Revision to restore</span>
          <select
            value={selected}
            onChange={(event) => setSelected(Number(event.target.value))}
          >
            {revisions.map(({ project, savedAt }, index) => (
              <option key={index} value={index}>
                {project.name || "Untitled plan"} ·{" "}
                {savedAt === null
                  ? "Legacy recovery, save time unavailable"
                  : new Date(savedAt).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p>No local revisions available.</p>
      )}
      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        <button
          className="primary"
          disabled={!revisions.length}
          onClick={() => onRestore(revisions[selected])}
        >
          Restore revision
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
      <h2 id="replace-project-title">Save your current project?</h2>
      <p>The current project has changes that aren’t in a project file.</p>
      <div className="modal-actions">
        <button onClick={onClose}>Cancel</button>
        <button onClick={() => onContinue(false)}>{action}</button>
        <button className="primary" onClick={() => onContinue(true)}>
          Download and continue
        </button>
      </div>
    </dialog>
  );
}
