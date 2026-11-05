import { useEffect, useState } from "react";
import { X, Download, Copy, Check } from "lucide-react";
import { parseProject, planBounds, type Plan } from "./model";
import {
  ProjectError,
  projectWarnings,
  readJson,
  type Issue,
} from "./validation";
import { applyCommands } from "./commands";
import { DrawItem } from "./Drawing";
import example from "../public/agent/example.planform.json";
import guide from "../public/agent/drawing-guide.md?raw";

export default function AgentPanel({
  plan,
  onApply,
  onClose,
}: {
  plan: Plan;
  onApply: (p: Plan) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"drawing" | "edits">("drawing");
  const [text, setText] = useState("");
  const [candidate, setCandidate] = useState<Plan | null>(null);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setCandidate(null);
    setIssues([]);
  }, [text, mode, plan]);
  function validate() {
    try {
      const next =
        mode === "drawing"
          ? parseProject(text)
          : applyCommands(plan, readJson(text)).plan;
      setCandidate(next);
      setIssues([]);
    } catch (error) {
      setCandidate(null);
      setIssues(
        error instanceof ProjectError
          ? error.issues
          : [
              {
                path: "/",
                code: "json",
                message:
                  error instanceof Error ? error.message : "Invalid JSON",
              },
            ],
      );
    }
  }
  const b = candidate ? planBounds(candidate) : null;
  const asset = (name: string) => `${import.meta.env.BASE_URL}agent/${name}`;
  return (
    <div className="modal-backdrop">
      <section
        className="modal agent-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="agent-title"
      >
        <button
          className="modal-close"
          aria-label="Close AI drawings"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <span className="eyebrow">DRAW TOGETHER</span>
        <h2 id="agent-title">Start with your AI agent.</h2>
        <p>
          Give ChatGPT or Codex the drawing guide and your floor-plan PDF or
          description. Ask for a Planform project, then open the returned JSON
          here. You can refine every wall and opening yourself.
        </p>
        <div className="agent-downloads">
          <a className="button" href={asset("drawing-guide.md")} download>
            <Download size={15} /> Drawing guide
          </a>
          <a className="button" href={asset("planform.schema.json")} download>
            Project schema
          </a>
          <a className="button" href={asset("example.planform.json")} download>
            Example drawing
          </a>
          <a className="button" href={asset("commands.schema.json")} download>
            Command schema
          </a>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(guide);
                setCopied(true);
              } catch {
                setIssues([
                  {
                    path: "/",
                    code: "clipboard",
                    message:
                      "Clipboard unavailable. Download the drawing guide instead.",
                  },
                ]);
              }
            }}
          >
            {copied ? <Check size={15} /> : <Copy size={15} />}
            {copied ? "Guide copied" : "Copy guide"}
          </button>
        </div>
        <p className="notice">
          Ask your agent to flag estimated measurements. Check the drawing
          against a known real dimension. This workflow creates editable
          architecture; it does not automatically interpret a PDF inside
          Planform.
        </p>
        <button
          onClick={() => {
            setMode("drawing");
            setText(JSON.stringify(example, null, 2));
          }}
        >
          Try the example drawing
        </button>
        <label className="field">
          <span>Open a JSON file from your agent</span>
          <input
            aria-label="Agent JSON file"
            type="file"
            accept=".json,.planform.json,application/json"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              if (file.size > 15_000_000) {
                setCandidate(null);
                setIssues([
                  {
                    path: "/",
                    code: "file_size",
                    message: "Files must be smaller than 15 MB.",
                  },
                ]);
                return;
              }
              try {
                const contents = await file.text();
                setText(contents);
                try {
                  setMode(
                    JSON.parse(contents).format === "planform-commands"
                      ? "edits"
                      : "drawing",
                  );
                } catch {
                  setMode("drawing");
                }
              } catch {
                setIssues([
                  {
                    path: "/",
                    code: "file_read",
                    message:
                      "Could not read this file. Try pasting the JSON instead.",
                  },
                ]);
              }
            }}
          />
        </label>
        <label className="field">
          <span>What did your agent return?</span>
          <select
            aria-label="AI import mode"
            value={mode}
            onChange={(e) => setMode(e.target.value as typeof mode)}
          >
            <option value="drawing">A complete drawing</option>
            <option value="edits">Edits to the current drawing</option>
          </select>
        </label>
        <label className="field">
          <span>
            {mode === "drawing"
              ? "Or paste project JSON"
              : "Paste a Planform command batch"}
          </span>
          <textarea
            aria-label="Agent JSON"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              mode === "drawing"
                ? '{"format":"planform","version":2,…}'
                : '{"format":"planform-commands","version":1,"operations":[…]}'
            }
          />
        </label>
        <p className="muted">
          {mode === "drawing"
            ? "Opening a drawing replaces the current drawing. Undo restores it."
            : "All edits apply together as one undoable change. Invalid batches leave the drawing untouched."}
        </p>
        {issues.length > 0 && (
          <div role="alert">
            <h3>Corrections needed</h3>
            <ul className="agent-errors">
              {issues.map((issue, n) => (
                <li key={n}>
                  <code>
                    {issue.path || "/"}
                    {issue.objectId ? ` (${issue.objectId})` : ""}
                  </code>
                  : {issue.message}
                </li>
              ))}
            </ul>
          </div>
        )}
        {candidate && b && (
          <div className="agent-preview">
            <svg
              viewBox={`${b.x - 40} ${b.y - 40} ${b.w + 80} ${b.h + 80}`}
              role="img"
              aria-label="Validated drawing preview"
            >
              <rect
                x={b.x - 40}
                y={b.y - 40}
                width={b.w + 80}
                height={b.h + 80}
                fill="white"
              />
              {candidate.items.map((item) => (
                <DrawItem
                  key={item.id}
                  item={item}
                  plan={candidate}
                  interactive={false}
                />
              ))}
            </svg>
            <p>{candidate.items.length} objects · geometry validated</p>
            {projectWarnings(candidate).map((warning, n) => (
              <p key={n} className="notice">
                {warning}
              </p>
            ))}
          </div>
        )}
        <div className="modal-actions">
          <button onClick={validate} disabled={!text.trim()}>
            Validate & preview
          </button>
          <button
            className="primary"
            disabled={!candidate}
            onClick={() => candidate && onApply(candidate)}
          >
            {mode === "drawing" ? "Open drawing" : "Apply edits"}
          </button>
        </div>
      </section>
    </div>
  );
}
