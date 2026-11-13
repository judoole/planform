import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { openReferenceFile, type EmbeddedRaster } from "./referenceImport";

export default function ReferencePicker({
  onApply,
  onClose,
}: {
  onApply: (raster: EmbeddedRaster) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sourceRef = useRef<Awaited<
    ReturnType<typeof openReferenceFile>
  > | null>(null);
  const generation = useRef(0);
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(1);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => {
      generation.current++;
      const source = sourceRef.current;
      sourceRef.current = null;
      void source?.dispose().catch(() => undefined);
      element.close();
    };
  }, []);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const id = ++generation.current;
    const previous = sourceRef.current;
    sourceRef.current = null;
    setWorking(true);
    setError("");
    setPageCount(0);
    setPage(1);
    try {
      await previous?.dispose();
      const source = await openReferenceFile(file);
      if (generation.current !== id) {
        await source.dispose();
        return;
      }
      sourceRef.current = source;
      setPageCount(source.pageCount);
    } catch (failure) {
      if (generation.current === id) setError((failure as Error).message);
    } finally {
      if (generation.current === id) setWorking(false);
    }
  }

  async function apply() {
    const source = sourceRef.current;
    if (!source || working) return;
    const id = generation.current;
    setError("");
    setWorking(true);
    try {
      const raster = await source.renderPage(page);
      if (generation.current === id) onApply(raster);
    } catch (failure) {
      if (generation.current === id) setError((failure as Error).message);
    } finally {
      if (generation.current === id) setWorking(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="modal save-dialog"
      aria-labelledby="reference-picker-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id="reference-picker-title">Import local reference</h2>
      <label className="field">
        <span>Image or PDF file</span>
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,application/pdf,image/png,image/jpeg,image/webp"
          disabled={working}
          onChange={choose}
        />
      </label>
      {pageCount > 1 && (
        <label className="field">
          <span>PDF page</span>
          <select
            value={page}
            disabled={working}
            onChange={(event) => setPage(Number(event.target.value))}
          >
            {Array.from({ length: pageCount }, (_, index) => (
              <option key={index} value={index + 1}>
                Page {index + 1} of {pageCount}
              </option>
            ))}
          </select>
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      {working && <p role="status">Reading local reference…</p>}
      <div className="modal-actions">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className="primary"
          disabled={!pageCount || working}
          onClick={() => void apply()}
        >
          Use reference
        </button>
      </div>
    </dialog>
  );
}
