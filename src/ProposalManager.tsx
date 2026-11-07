import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { MAX_PROPOSALS, type ProjectDrawing } from "./project";

export default function ProposalManager({
  drawing,
  canAdd,
  canRestore,
  notice,
  onClose,
  onRename,
  onDuplicate,
  onDuplicateExisting,
  onImport,
  onReplace,
  onDelete,
  onRestore,
}: {
  drawing: ProjectDrawing;
  canAdd: boolean;
  canRestore: boolean;
  notice: string;
  onClose: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDuplicateExisting: () => void;
  onImport: () => void;
  onReplace: () => void;
  onDelete: () => void;
  onRestore: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(drawing.name);
  useEffect(() => {
    const modal = dialog.current!;
    modal.showModal();
    return () => modal.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="modal proposal-manager"
      aria-labelledby="proposals-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button
        className="modal-close"
        aria-label="Close proposals"
        onClick={onClose}
      >
        <X size={20} />
      </button>
      <h2 id="proposals-title">Manage proposals</h2>
      <p>
        Active drawing: <strong>{drawing.name}</strong>. Keep up to{" "}
        {MAX_PROPOSALS} independent proposals alongside Existing.
      </p>
      {!canAdd && (
        <p className="notice">
          Maximum of {MAX_PROPOSALS} proposals reached. Delete a proposal to
          make room for another.
        </p>
      )}
      <div className="proposal-actions">
        <button disabled={!canAdd} onClick={onDuplicate}>
          Copy active as new proposal
        </button>
        {drawing.role === "proposal" && (
          <button disabled={!canAdd} onClick={onDuplicateExisting}>
            Copy Existing as new proposal
          </button>
        )}
        <button disabled={!canAdd} onClick={onImport}>
          Import new proposal
        </button>
      </div>
      {drawing.role === "proposal" && (
        <>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onRename(name);
            }}
          >
            <label className="field">
              <span>Proposal name</span>
              <input
                aria-label="Proposal name"
                value={name}
                maxLength={200}
                required
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <button type="submit" disabled={!name.trim()}>
              Rename proposal
            </button>
          </form>
          <div className="proposal-actions">
            <button onClick={onReplace}>
              Replace active proposal from file
            </button>
            <button onClick={onDelete}>Delete active proposal</button>
          </div>
        </>
      )}
      <div className="modal-actions">
        <button disabled={!canRestore} onClick={onRestore}>
          Restore last deleted
        </button>
        <button className="primary" onClick={onClose}>
          Done
        </button>
      </div>
      {notice && <p role="status">{notice}</p>}
    </dialog>
  );
}
