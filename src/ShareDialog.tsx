import { useEffect, useRef, useState } from "react";
import { Copy, Download, Link2, X } from "lucide-react";
import {
  activeDrawingId,
  activePlan,
  projectDrawings,
  type Project,
} from "./project";
import { createShareUrl } from "./share";

type ShareLink = { snapshot: Project } & ({ url: string } | { error: string });

export default function ShareDialog({
  project,
  onClose,
  onDownload,
}: {
  project: Project;
  onClose: () => void;
  onDownload: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [includeAll, setIncludeAll] = useState(false);
  const [link, setLink] = useState<ShareLink>();
  const [status, setStatus] = useState<{ message: string; url?: string }>();
  const snapshot = includeAll ? project : activePlan(project);
  const current = link?.snapshot === snapshot ? link : undefined;
  const url = current && "url" in current ? current.url : "";
  const error = current && "error" in current ? current.error : "";
  useEffect(() => {
    const modal = dialog.current!;
    modal.showModal();
    return () => modal.close();
  }, []);
  useEffect(() => {
    let active = true;
    createShareUrl(snapshot, window.location.href).then(
      (url) => {
        if (active) setLink({ snapshot, url });
      },
      (e: unknown) => {
        if (!active) return;
        setLink({
          snapshot,
          error:
            e instanceof Error ? e.message : "Could not create a share link.",
        });
      },
    );
    return () => {
      active = false;
    };
  }, [snapshot]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus({ url, message: "Link copied." });
    } catch {
      if (input.current?.value === url) {
        input.current.focus();
        input.current.select();
      }
      setStatus({ url, message: "Copy the selected link to share it." });
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
        Anyone with the link can open and edit their own copy. The link includes
        the source notes for the drawings you share.
      </p>
      {project.version !== 2 && (
        <label className="field">
          <span>Include in link</span>
          <select
            value={includeAll ? "all" : "active"}
            onChange={(e) => {
              setIncludeAll(e.target.value === "all");
              setStatus(undefined);
            }}
          >
            <option value="active">
              {
                projectDrawings(project).find(
                  (d) => d.id === activeDrawingId(project),
                )!.name
              }{" "}
              only
            </option>
            <option value="all">Entire project</option>
          </select>
        </label>
      )}
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
            try {
              onDownload();
              setStatus({ message: "Project downloaded." });
            } catch (error) {
              setStatus({ message: (error as Error).message });
            }
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
      {status && (!status.url || status.url === url) && (
        <p role="status">{status.message}</p>
      )}
    </dialog>
  );
}
