import { useEffect, useRef, useState } from "react";
import { Copy, Download, Link2, X } from "lucide-react";
import type { Plan } from "./model";
import { createShareUrl } from "./share";

export default function ShareDialog({
  plan,
  onClose,
  onDownload,
}: {
  plan: Plan;
  onClose: () => void;
  onDownload: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    const modal = dialog.current!;
    modal.showModal();
    return () => modal.close();
  }, []);
  useEffect(() => {
    let active = true;
    createShareUrl(plan, window.location.href).then(
      (link) => {
        if (active) setUrl(link);
      },
      (e: unknown) => {
        if (!active) return;
        setError(
          e instanceof Error ? e.message : "Could not create a share link.",
        );
      },
    );
    return () => {
      active = false;
    };
  }, [plan]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Link copied.");
    } catch {
      input.current?.focus();
      input.current?.select();
      setStatus("Copy the selected link to share it.");
    }
  }

  const local = ["localhost", "127.0.0.1", "[::1]"].includes(
    window.location.hostname,
  );
  return (
    <dialog
      ref={dialog}
      className="modal share-dialog"
      aria-labelledby="share-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <button
        className="modal-close"
        aria-label="Close share dialog"
        onClick={onClose}
      >
        <X size={20} />
      </button>
      <span className="modal-icon">
        <Link2 size={25} />
      </span>
      <h2 id="share-title">Share this plan</h2>
      <p>
        Anyone with the link can open and edit their own copy. The link contains
        the whole project, including any source notes, and captures the plan as
        it is now.
      </p>
      {local && (
        <p>
          This address is local. To share across devices, open Planform at a
          hosted address or download the project file.
        </p>
      )}
      {error ? (
        <p role="alert" className="share-error">
          {error}
        </p>
      ) : url ? (
        <label className="field">
          <span>Share link</span>
          <input
            ref={input}
            value={url}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      ) : (
        <p role="status">Creating your link…</p>
      )}
      <div className="modal-actions">
        <button
          onClick={() => {
            onDownload();
            setStatus("Project downloaded.");
          }}
        >
          <Download size={15} /> Download project
        </button>
        {url && (
          <button className="primary" onClick={copyLink}>
            <Copy size={15} /> Copy link
          </button>
        )}
      </div>
      {status && <p role="status">{status}</p>}
    </dialog>
  );
}
