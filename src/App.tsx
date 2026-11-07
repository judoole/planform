import {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
  useSyncExternalStore,
} from "react";
import {
  MousePointer2,
  SquareDashedMousePointer,
  Hand,
  BrickWall,
  DoorOpen,
  PanelsTopLeft,
  Armchair,
  Ruler,
  Type,
  ScanLine,
  Plus,
  Minus,
  Maximize,
  Undo2,
  Redo2,
  Magnet,
  Download,
  FolderOpen,
  FilePlus2,
  ChevronDown,
  X,
  Menu,
  SlidersHorizontal,
  Layers,
  LockKeyhole,
  ChevronRight,
  Check,
  Copy,
  ClipboardPaste,
  Trash2,
  MoveUpRight,
  Square,
  HelpCircle,
  Search,
  PanelRightClose,
  Link2,
} from "lucide-react";
import {
  type Plan,
  type Point,
  type Item,
  type DoorStyle,
  emptyPlan,
  clone,
  normalizeOpenings,
  removeItems,
  duplicateItems,
  History,
  planBounds,
  calibrate,
  dist,
  serialize,
  parseProject,
  isRect,
  uid,
} from "./model";
import { furniture, type FurnitureKind } from "./furniture";
import { download, exportSvg, exportPng } from "./exports";
import ShareDialog from "./ShareDialog";
import SaveDialog from "./SaveDialog";
import { isShareHash, readShareHash } from "./share";
import {
  activePlan,
  planVersions,
  replaceActivePlan,
  versionNames,
  type ComparisonProject,
  type PlanVersion,
  type Project,
} from "./project";
import { checkJsonSize, readProjectFile } from "./validation";
import Canvas, { type Tool, type Camera } from "./Canvas";
import Properties, { DoorStyleSelect, NumberField } from "./Properties";
import { findRooms } from "./rooms";
const RECOVERY = "planform-recovery-v3";
const palette: {
  tool: Tool;
  label: string;
  icon: typeof MousePointer2;
  key?: string;
}[] = [
  { tool: "select", label: "Select", icon: MousePointer2, key: "V" },
  {
    tool: "box",
    label: "Box select",
    icon: SquareDashedMousePointer,
    key: "B",
  },
  { tool: "pan", label: "Pan", icon: Hand, key: "H" },
  { tool: "wall", label: "Wall", icon: BrickWall, key: "W" },
  { tool: "room", label: "Room", icon: Square },
  { tool: "door", label: "Door", icon: DoorOpen, key: "D" },
  { tool: "window", label: "Window", icon: PanelsTopLeft },
  { tool: "stairs", label: "Stairs", icon: MoveUpRight },
  { tool: "furniture", label: "Furniture", icon: Armchair, key: "F" },
  { tool: "dimension", label: "Dimension", icon: Ruler },
  { tool: "measure", label: "Measure", icon: ScanLine, key: "M" },
  { tool: "text", label: "Label", icon: Type, key: "T" },
];
function startup(): Project {
  try {
    const s =
      localStorage.getItem(RECOVERY) ||
      localStorage.getItem("planform-recovery-v2") ||
      localStorage.getItem("planform-recovery-v1");
    if (s) return readProjectFile(s);
  } catch {}
  return emptyPlan();
}
function localAddress() {
  const url = new URL(window.location.href);
  url.hash = "";
  return url.href;
}
function subscribeToHash(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}
function currentShareHash() {
  const { hash } = window.location;
  return isShareHash(hash) ? hash : null;
}

export default function App() {
  const hash = useSyncExternalStore(subscribeToHash, currentShareHash);
  return hash ? <SharedProject key={hash} hash={hash} /> : <Editor />;
}

function SharedProject({ hash }: { hash: string }) {
  const [result, setResult] = useState<Project | "invalid" | null>(null);
  useEffect(() => {
    let active = true;
    readShareHash(hash).then(
      (project) => {
        if (active) setResult(project);
      },
      () => {
        if (active) setResult("invalid");
      },
    );
    return () => {
      active = false;
    };
  }, [hash]);

  if (result && result !== "invalid") return <Editor sharedProject={result} />;
  return (
    <main className="modal-backdrop">
      <section className="modal share-load">
        {result === "invalid" ? (
          <>
            <h2>Couldn’t open this share link</h2>
            <p role="alert">
              Check that you have the full link, or ask the sender for the
              project file.
            </p>
            <a href={localAddress()}>Open local editor</a>
          </>
        ) : (
          <p role="status">Opening shared plan…</p>
        )}
      </section>
    </main>
  );
}

function Editor({ sharedProject }: { sharedProject?: Project }) {
  const [project, setProject] = useState<Project>(
      () => sharedProject ?? startup(),
    ),
    [preview, setPreview] = useState<Plan | null>(null),
    [overlay, setOverlay] = useState(false),
    [selection, setSelection] = useState<string[]>([]),
    [tool, setTool] = useState<Tool>("select"),
    [snap, setSnap] = useState(true),
    [kind, setKind] = useState<FurnitureKind>("sofa"),
    [doorStyle, setDoorStyle] = useState<DoorStyle>("hinged"),
    [wallThickness, setWallThickness] = useState(15),
    [camera, setCamera] = useState<Camera>({ x: 100, y: 100, k: 0.8 }),
    [panelOpen, setPanelOpen] = useState(false),
    [tab, setTab] = useState<"properties" | "objects">("properties"),
    [query, setQuery] = useState(""),
    [overlap, setOverlap] = useState<string[]>([]),
    [overlapOpen, setOverlapOpen] = useState(false),
    [menu, setMenu] = useState(false),
    [exportMenu, setExportMenu] = useState(false),
    [help, setHelp] = useState(false),
    [notice, setNotice] = useState(""),
    [shareOpen, setShareOpen] = useState(false),
    [saveOpen, setSaveOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [autosave, setAutosave] = useState("Saved locally"),
    [coords, setCoords] = useState("0.0, 0.0"),
    [cancelToken, setCancelToken] = useState(0),
    [measure, setMeasure] = useState<{
      a: Point;
      b: Point;
      calibrate: boolean;
    } | null>(null),
    [realDistance, setRealDistance] = useState(""),
    [, setHistoryTick] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null),
    fileRef = useRef<HTMLInputElement>(null),
    proposedFileRef = useRef<HTMLInputElement>(null),
    histories = useRef({ existing: new History(), proposed: new History() }),
    projectRef = useRef(project),
    lastSaved = useRef(project),
    clipboard = useRef<Item[]>([]),
    nameBefore = useRef<Plan | null>(null);
  const saveHandle = useRef<FileSystemFileHandle | null>(null);
  const version = project.version === 3 ? project.active : "existing";
  const otherVersion = version === "existing" ? "proposed" : "existing";
  const drawing = activePlan(project);
  const plan = preview ?? drawing;
  const history = histories.current[version];
  const ghost =
    overlay && project.version === 3 ? project.plans[otherVersion] : undefined;
  const { rooms, roomError } = useMemo(() => {
    try {
      return { rooms: findRooms(plan.items), roomError: undefined };
    } catch {
      // Automatic analysis must not prevent editing or reopening a document
      // when polygon clipping cannot resolve unusual wall geometry.
      return {
        rooms: [],
        roomError:
          "Room areas could not be calculated. Check overlapping or very small walls.",
      };
    }
  }, [plan.items]);
  const showNotice = useCallback((s: string) => {
    setNotice(s);
  }, []);
  const updateProject = useCallback((next: Project) => {
    projectRef.current = next;
    setProject(next);
  }, []);
  const commit = useCallback(
    (next: Plan, base?: Plan, strict = false) => {
      const current = projectRef.current;
      const before = base || activePlan(current);
      const clean = strict ? next : normalizeOpenings(next);
      histories.current[
        current.version === 3 ? current.active : "existing"
      ].push(before);
      setPreview(null);
      updateProject(replaceActivePlan(current, clean));
    },
    [updateProject],
  );
  const fit = useCallback((p: Plan = activePlan(projectRef.current)) => {
    const svg = svgRef.current;
    if (!svg) return;
    const box = planBounds(p),
      b = svg.getBoundingClientRect(),
      pad = Math.min(90, b.width * 0.12),
      k = Math.min(
        3,
        Math.max(
          0.02,
          Math.min(
            (b.width - pad * 2) / Math.max(box.w, 1),
            (b.height - pad * 2) / Math.max(box.h, 1),
          ),
        ),
      );
    setCamera({
      k,
      x: (b.width - box.w * k) / 2 - box.x * k,
      y: (b.height - box.h * k) / 2 - box.y * k,
    });
  }, []);
  useEffect(() => {
    if (activePlan(projectRef.current).items.length) fit();
  }, []);
  const saveRecovery = useCallback(() => {
    const current = projectRef.current;
    if (lastSaved.current !== current) {
      try {
        const contents = serialize(current);
        checkJsonSize(contents);
        localStorage.setItem(RECOVERY, contents);
        lastSaved.current = current;
      } catch {
        return "Recovery unavailable · download to save";
      }
    }
    return "Saved locally";
  }, []);
  useEffect(() => {
    if (sharedProject) return;
    const flush = () => {
      saveRecovery();
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [sharedProject, saveRecovery]);
  useEffect(() => {
    if (sharedProject) return;
    if (project === lastSaved.current) {
      setAutosave("Saved locally");
      return;
    }
    setAutosave("Saving…");
    const timer = setTimeout(() => setAutosave(saveRecovery()), 900);
    return () => clearTimeout(timer);
  }, [project, sharedProject, saveRecovery]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(t);
  }, [notice]);
  function cancel() {
    setPreview(null);
    setCancelToken((v) => v + 1);
    setTool("select");
    setOverlapOpen(false);
  }
  function clearDrawingContext() {
    cancel();
    setSelection([]);
    setOverlap([]);
    setMeasure(null);
  }
  function undo() {
    clearDrawingContext();
    updateProject(replaceActivePlan(project, history.undo(drawing)));
  }
  function redo() {
    clearDrawingContext();
    updateProject(replaceActivePlan(project, history.redo(drawing)));
  }
  function switchVersion(next: PlanVersion) {
    if (project.version !== 3 || next === version) return;
    clearDrawingContext();
    updateProject({ ...project, active: next });
  }
  function setProposed(proposed: Plan) {
    const current = projectRef.current;
    const next: ComparisonProject = {
      format: "planform",
      version: 3,
      name: current.name,
      active: "proposed",
      plans: {
        existing: current.version === 3 ? current.plans.existing : current,
        proposed,
      },
    };
    checkJsonSize(serialize(next));
    if (current.version === 3)
      histories.current.proposed.push(current.plans.proposed);
    clearDrawingContext();
    updateProject(next);
  }
  function duplicateAsProposed() {
    const existing = projectRef.current;
    if (existing.version !== 2) return;
    try {
      setProposed(clone(existing));
    } catch {
      showNotice(
        "This drawing is too large to duplicate into a 15 MB project.",
      );
    }
  }
  function del() {
    const ids = selection.filter(
      (id) => !plan.items.find((i) => i.id === id)?.locked,
    );
    if (!ids.length) return;
    commit(removeItems(plan, ids));
    setSelection([]);
  }
  function duplicate() {
    const ids = selection.filter(
      (id) => !plan.items.find((i) => i.id === id)?.locked,
    );
    if (!ids.length) return;
    const r = duplicateItems(plan, ids);
    commit(r.plan);
    setSelection(r.ids);
  }
  function copy() {
    const ids = new Set(selection);
    clipboard.current = clone(
      plan.items.filter(
        (i) =>
          ids.has(i.id) ||
          ((i.type === "door" || i.type === "window") && ids.has(i.hostId)),
      ),
    );
    showNotice(
      `${selection.length} object(s) copied. Use Paste to place a copy.`,
    );
  }
  function paste() {
    if (!clipboard.current.length) {
      showNotice("Select objects and use Copy first.");
      return;
    }
    const temp = {
      ...plan,
      items: [
        ...plan.items.filter(
          (i) => !clipboard.current.some((x) => x.id === i.id),
        ),
        ...clone(clipboard.current),
      ],
    };
    const r = duplicateItems(
      temp,
      clipboard.current.map((i) => i.id),
    );
    const newItems = r.plan.items.slice(temp.items.length);
    commit({ ...plan, items: [...plan.items, ...newItems] });
    setSelection(r.ids);
  }
  function downloadProject() {
    const current = projectRef.current;
    const contents = serialize(current);
    checkJsonSize(contents);
    download(
      new Blob([contents], { type: "application/json" }),
      `${current.name || "Untitled"}.planform.json`,
    );
  }
  async function save(filename?: string) {
    try {
      if (!filename) {
        const current = projectRef.current;
        const contents = serialize(current);
        checkJsonSize(contents);
        const fileName = `${current.name || "Untitled"}.planform.json`;
        const pickerWindow = window as Window & {
          showSaveFilePicker?: (options: {
            suggestedName: string;
            types: { description: string; accept: Record<string, string[]> }[];
          }) => Promise<FileSystemFileHandle>;
        };
        if (saveHandle.current || pickerWindow.showSaveFilePicker) {
          const handle =
            saveHandle.current ??
            (await pickerWindow.showSaveFilePicker!({
              suggestedName: fileName,
              types: [
                {
                  description: "Planform project",
                  accept: { "application/json": [".planform.json", ".json"] },
                },
              ],
            }));
          const writable = await handle.createWritable();
          await writable.write(contents);
          await writable.close();
          saveHandle.current = handle;
          showNotice("Project saved. Future saves will update this file.");
          return;
        }
        setSaveOpen(true);
        return;
      }
      const current = projectRef.current;
      const contents = serialize(current);
      checkJsonSize(contents);
      download(new Blob([contents], { type: "application/json" }), filename);
      setSaveOpen(false);
      showNotice(
        "Project downloaded. Open the JSON file to continue editing later.",
      );
    } catch (error) {
      if ((error as DOMException).name !== "AbortError")
        showNotice((error as Error).message);
    }
  }
  function openDrawing(next: Plan) {
    clearDrawingContext();
    commit(next, undefined, true);
    fit(next);
    showNotice(
      "Drawing opened. All objects are editable; Undo restores the previous drawing.",
    );
  }
  function replaceProject(next: Project) {
    saveHandle.current = null;
    clearDrawingContext();
    setOverlay(false);
    histories.current = { existing: new History(), proposed: new History() };
    updateProject(next);
  }
  function newProject() {
    saveHandle.current = null;
    if (project.version === 2) {
      clearDrawingContext();
      commit(emptyPlan());
    } else {
      replaceProject(emptyPlan());
    }
    setCamera({ x: 100, y: 100, k: 0.8 });
    setMenu(false);
  }
  async function loadFile(
    input: HTMLInputElement,
    target: "project" | "proposed" = "project",
  ) {
    const file = input.files?.[0];
    input.value = "";
    if (!file || busy) return;
    setBusy(true);
    try {
      if (file.size > 15_000_000)
        throw Error("Files must be smaller than 15 MB.");
      const contents = await file.text();
      if (target === "proposed") {
        setProposed(parseProject(contents));
        showNotice("Drawing loaded as Proposed.");
        return;
      }
      const next = readProjectFile(contents);
      saveHandle.current = null;
      if (next.version === 2 && projectRef.current.version === 2) {
        openDrawing(next);
      } else {
        replaceProject(next);
        fit(activePlan(next));
        showNotice("Project opened.");
      }
    } catch (e) {
      showNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function exporting(png: boolean) {
    setExportMenu(false);
    try {
      const svg = exportSvg(svgRef.current!, planBounds(plan));
      const name =
        project.version === 3
          ? `${project.name} - ${versionNames[version]}`
          : plan.name;
      if (png) await exportPng(svg, `${name}.png`);
      else download(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`);
      showNotice(
        `${png ? "PNG" : "SVG"} exported with a white background, without the editing grid or selection.`,
      );
    } catch (e) {
      showNotice((e as Error).message);
    }
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (shareOpen || busy) return;
      const el = e.target as HTMLElement;
      if (el.closest('input,textarea,select,[contenteditable="true"]')) return;
      const mod = e.metaKey || e.ctrlKey,
        k = e.key.toLowerCase();
      if (e.key === "Escape") {
        cancel();
        setMeasure(null);
        setHelp(false);
        return;
      }
      if (mod && ["s", "o"].includes(k)) {
        e.preventDefault();
        if (k === "s") save();
        else fileRef.current?.click();
        return;
      }
      if (mod && k === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (mod && k === "y") {
        e.preventDefault();
        redo();
        return;
      }
      if (mod && k === "a") {
        e.preventDefault();
        setSelection(plan.items.map((i) => i.id));
        return;
      }
      if (mod && selection.length && ["c", "d", "x"].includes(k)) {
        e.preventDefault();
        if (k === "d") duplicate();
        else {
          copy();
          if (k === "x") del();
        }
        return;
      }
      if (mod && k === "v" && clipboard.current.length) {
        e.preventDefault();
        paste();
        return;
      }
      if (mod || e.altKey) return;
      if (["Delete", "Backspace"].includes(e.key) && selection.length) {
        e.preventDefault();
        del();
        return;
      }
      const t = palette.find((t) => t.key?.toLowerCase() === k);
      if (t) setTool(t.tool);
      if (k === "0") fit();
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  function zoom(mult: number) {
    const b = svgRef.current!.getBoundingClientRect(),
      x = b.width / 2,
      y = b.height / 2,
      k = Math.max(0.02, Math.min(20, camera.k * mult));
    setCamera({
      k,
      x: x - ((x - camera.x) * k) / camera.k,
      y: y - ((y - camera.y) * k) / camera.k,
    });
  }
  function chooseTool(t: Tool) {
    setTool(t);
    if ((t === "furniture" || t === "door") && window.innerWidth < 760)
      setPanelOpen(false);
  }
  const selected = plan.items.filter((i) => selection.includes(i.id));
  const matching = plan.items.filter(
    (i) =>
      !query ||
      `${i.name} ${i.type}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <div className="app-shell">
      <a
        className="github-ribbon"
        href="https://github.com/judoole/planform"
        target="_blank"
        rel="noreferrer"
        aria-label="Fork Planform on GitHub"
      >
        Fork me on GitHub
      </a>
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => e.preventDefault()}
          aria-label="Planform home"
        >
          <span className="brand-mark">
            <span />
            <span />
            <span />
          </span>
          planform<span className="brand-dot">.</span>
        </a>
        <span className="header-divider" />
        <div className="project-heading">
          <input
            aria-label="Project name"
            value={project.name}
            maxLength={200}
            onChange={(e) =>
              updateProject({ ...projectRef.current, name: e.target.value })
            }
            onFocus={() => {
              nameBefore.current = project.version === 2 ? project : null;
            }}
            onBlur={() => {
              if (
                project.version === 2 &&
                nameBefore.current &&
                nameBefore.current.name !== project.name
              ) {
                history.push(nameBefore.current);
                setHistoryTick((v) => v + 1);
              }
              nameBefore.current = null;
            }}
          />
          <span>
            <span className="save-dot" />
            {sharedProject ? "Shared copy" : autosave}
          </span>
        </div>
        <div className="header-actions">
          <button onClick={newProject} title="New empty project">
            <FilePlus2 size={16} />
            <span>New</span>
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            title="Open Planform project"
          >
            <FolderOpen size={16} />
            <span>Open</span>
          </button>
          <button onClick={() => save()} title="Download editable project">
            <Download size={16} />
            <span>Save project</span>
          </button>
          <button
            aria-label="Share plan"
            title="Share plan"
            onClick={() => setShareOpen(true)}
          >
            <Link2 size={16} />
            <span>Share</span>
          </button>
          <div className="dropdown-anchor">
            <button
              className="primary"
              onClick={() => setExportMenu(!exportMenu)}
            >
              Export <ChevronDown size={14} />
            </button>
            {exportMenu && (
              <div className="dropdown">
                <button onClick={() => exporting(false)}>SVG · drawing</button>
                <button onClick={() => exporting(true)}>PNG · image</button>
              </div>
            )}
          </div>
          <button
            className="mobile-menu"
            aria-label="Project menu"
            onClick={() => setMenu(!menu)}
          >
            <Menu size={20} />
          </button>
        </div>
      </header>
      {sharedProject && (
        <div className="share-banner">
          <span>
            Editing a shared copy. Download the project to keep your changes.
          </span>
          <a href={localAddress()}>Open local editor</a>
        </div>
      )}
      {menu && (
        <div className="mobile-project-menu">
          <button onClick={newProject}>New project</button>
          <button
            onClick={() => {
              fileRef.current?.click();
              setMenu(false);
            }}
          >
            Open project
          </button>
          <button
            onClick={() => {
              save();
              setMenu(false);
            }}
          >
            Save project
          </button>
        </div>
      )}
      <input
        type="file"
        ref={fileRef}
        accept=".json,.planform.json"
        hidden
        onChange={(e) => loadFile(e.currentTarget)}
      />
      <input
        type="file"
        ref={proposedFileRef}
        aria-label="Proposed drawing file"
        accept=".json,.planform.json"
        hidden
        onChange={(e) => loadFile(e.currentTarget, "proposed")}
      />
      <div className="workspace-toolbar">
        <div className="plan-toolbar-group">
          <div className="floor-badge">
            <Layers size={15} />
            <span>Ground floor</span>
            <small>01</small>
          </div>
          <div className="plan-versions" role="group" aria-label="Plan version">
            {project.version === 2 ? (
              <>
                <span className="plan-version-name">Existing</span>
                <button onClick={duplicateAsProposed}>
                  <Copy size={14} /> Duplicate as proposed
                </button>
              </>
            ) : (
              <>
                <div className="plan-switch">
                  {planVersions.map((option) => (
                    <button
                      key={option}
                      aria-pressed={version === option}
                      onClick={() => switchVersion(option)}
                    >
                      {versionNames[option]}
                    </button>
                  ))}
                </div>
                <button
                  className="plan-overlay-toggle"
                  aria-pressed={overlay}
                  title="Show the other version as a reference"
                  onClick={() => setOverlay(!overlay)}
                >
                  <Layers size={14} /> Overlay
                </button>
              </>
            )}
            <button onClick={() => proposedFileRef.current?.click()}>
              <FolderOpen size={14} />
              {project.version === 2 ? "Load as proposed" : "Replace proposed"}
            </button>
          </div>
        </div>
        <div className="toolbar-separator" />
        <button
          aria-label="Undo"
          title="Undo · ⌘/Ctrl Z"
          disabled={!history.past.length}
          onClick={undo}
        >
          <Undo2 size={18} />
        </button>
        <button
          aria-label="Redo"
          title="Redo · ⌘/Ctrl Shift Z"
          disabled={!history.future.length}
          onClick={redo}
        >
          <Redo2 size={18} />
        </button>
        <div className="toolbar-separator" />
        <button
          aria-label="Copy"
          title="Copy"
          disabled={!selection.length}
          onClick={copy}
        >
          <Copy size={17} />
        </button>
        <button aria-label="Paste" title="Paste" onClick={paste}>
          <ClipboardPaste size={17} />
        </button>
        <button
          aria-label="Delete"
          title="Delete selected"
          disabled={!selection.length}
          onClick={del}
        >
          <Trash2 size={17} />
        </button>
        <div className="toolbar-spacer" />
        <button
          className={snap ? "snap-toggle active" : "snap-toggle"}
          aria-pressed={snap}
          onClick={() => setSnap(!snap)}
          title="Snap to grid, endpoints and alignments"
        >
          <Magnet size={16} />
          <span>Snap {snap ? "on" : "off"}</span>
        </button>
        <button className="cancel-button" aria-label="Cancel" onClick={cancel}>
          <X size={15} />
          <span>Cancel</span>
        </button>
        <button
          className="properties-toggle"
          aria-label="Toggle properties"
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen(!panelOpen)}
        >
          <SlidersHorizontal size={18} />
        </button>
      </div>
      <main className="workspace">
        <nav className="tool-palette" aria-label="Drawing tools">
          {palette.map(({ tool: t, label, icon: Icon, key }, idx) => (
            <button
              key={t}
              className={`${tool === t ? "selected " : ""}${idx === 3 || idx === 9 ? "tool-divider" : ""}`}
              aria-label={label}
              aria-pressed={tool === t}
              title={`${label}${key ? " · " + key : ""}`}
              onClick={() => chooseTool(t)}
            >
              <Icon size={21} strokeWidth={1.65} />
              <span>{label}</span>
            </button>
          ))}
          <button
            className="help-tool"
            aria-label="Help and shortcuts"
            onClick={() => setHelp(true)}
          >
            <HelpCircle size={21} />
            <span>Help</span>
          </button>
        </nav>
        <section className="drawing-region">
          <div className="drawing-topline">
            <span>
              <span className="tiny-square" /> FLOOR PLAN{" "}
              <span className="muted">/</span>{" "}
              <b className={ghost ? "plan-overlay-key" : undefined}>
                {ghost
                  ? `${versionNames[otherVersion]} overlay`
                  : "DESIGN MODE"}
              </b>
            </span>
            <span className="private-badge">
              {sharedProject ? "SHARED COPY" : "LOCAL & PRIVATE"}
            </span>
          </div>
          {!plan.calibration.calibrated && (
            <div className="calibration-banner">
              <span>Uncalibrated drawing · distances are drawing units</span>
              <button onClick={() => setTool("calibrate")}>
                <Ruler size={14} /> Calibrate scale
              </button>
            </div>
          )}
          {(tool === "furniture" ||
            tool === "door" ||
            tool === "wall" ||
            tool === "room") && (
            <div className="context-toolbar">
              {tool === "furniture" ? (
                <>
                  <span>PLACE</span>
                  <select
                    aria-label="Furniture symbol"
                    value={kind}
                    onChange={(e) => setKind(e.target.value as FurnitureKind)}
                  >
                    {Object.entries(furniture).map(([k, { label }]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </>
              ) : tool === "door" ? (
                <>
                  <span>PLACE</span>
                  <DoorStyleSelect
                    label="New door type"
                    value={doorStyle}
                    onChange={setDoorStyle}
                  />
                </>
              ) : (
                <>
                  <span>WALL THICKNESS</span>
                  <input
                    aria-label="New wall thickness"
                    type="number"
                    min={1}
                    max={200}
                    value={wallThickness}
                    onChange={(e) =>
                      setWallThickness(
                        Math.max(1, Math.min(200, Number(e.target.value))),
                      )
                    }
                  />
                  <small>{plan.calibration.calibrated ? "cm" : "units"}</small>
                </>
              )}
            </div>
          )}
          <Canvas
            plan={plan}
            ghost={ghost}
            rooms={rooms}
            setPreview={setPreview}
            commit={commit}
            selection={selection}
            setSelection={setSelection}
            tool={tool}
            setTool={setTool}
            snap={snap}
            kind={kind}
            doorStyle={doorStyle}
            wallThickness={wallThickness}
            camera={camera}
            setCamera={setCamera}
            svgRef={svgRef}
            onMeasure={(a, b, calibrate) => {
              setMeasure({ a, b, calibrate });
              setRealDistance("");
            }}
            onStatus={(s) => (s.length > 40 ? showNotice(s) : setCoords(s))}
            onOverlap={setOverlap}
            cancelToken={cancelToken}
          />
          <div className="canvas-bottom">
            <div className="canvas-bottom-left">
              <span className="floor-chip">
                01 <span>Ground floor</span>
              </span>
              {overlap.length > 1 && (
                <div className="dropdown-anchor">
                  <button
                    className="overlap-button"
                    onClick={() => setOverlapOpen(!overlapOpen)}
                  >
                    <Layers size={15} />
                    {overlap.length} overlapping <ChevronDown size={12} />
                  </button>
                  {overlapOpen && (
                    <div className="dropdown overlap-dropdown">
                      {overlap.slice(0, 40).map((id) => (
                        <button
                          key={id}
                          onClick={() => {
                            setSelection([id]);
                            setOverlapOpen(false);
                            setPanelOpen(true);
                          }}
                        >
                          {plan.items.find((i) => i.id === id)?.name || id}
                          {selection.includes(id) && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="zoom-controls">
              <button aria-label="Zoom out" onClick={() => zoom(1 / 1.25)}>
                <Minus size={17} />
              </button>
              <span>{Math.round(camera.k * 100)}%</span>
              <button aria-label="Zoom in" onClick={() => zoom(1.25)}>
                <Plus size={17} />
              </button>
              <span className="zoom-divider" />
              <button
                aria-label="Fit drawing"
                title="Fit drawing · 0"
                onClick={() => fit()}
              >
                <Maximize size={17} />
              </button>
            </div>
          </div>
        </section>
        {panelOpen && (
          <button
            className="drawer-scrim"
            aria-label="Close properties"
            onClick={() => setPanelOpen(false)}
          />
        )}
        <aside className={`inspector ${panelOpen ? "open" : ""}`}>
          <div className="inspector-tabs">
            <button
              className={tab === "properties" ? "active" : ""}
              onClick={() => setTab("properties")}
            >
              <SlidersHorizontal size={15} />
              Properties
            </button>
            <button
              className={tab === "objects" ? "active" : ""}
              onClick={() => setTab("objects")}
            >
              <Layers size={15} />
              Objects
            </button>
            <button
              className="drawer-close"
              aria-label="Close properties panel"
              onClick={() => setPanelOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          {tab === "properties" ? (
            <Properties
              plan={plan}
              rooms={rooms}
              roomError={roomError}
              selection={selection}
              commit={commit}
              setSelection={setSelection}
              setTool={setTool}
              onDuplicate={duplicate}
              onDelete={del}
              onError={showNotice}
            />
          ) : (
            <div className="objects-panel">
              <label className="object-search">
                <Search size={15} />
                <input
                  placeholder="Find objects…"
                  aria-label="Find objects"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="objects-summary">
                {matching.length.toLocaleString()} objects{" "}
                <button
                  onClick={() => {
                    setSelection(plan.items.map((i) => i.id));
                  }}
                >
                  Select all
                </button>
              </div>
              <div className="object-list">
                {matching.slice(0, 150).map((i) => (
                  <button
                    className={selection.includes(i.id) ? "selected" : ""}
                    key={i.id}
                    onClick={(e) =>
                      setSelection(
                        e.shiftKey
                          ? [...new Set([...selection, i.id])]
                          : [i.id],
                      )
                    }
                  >
                    <span className={`object-type ${i.type}`}>
                      {i.type === "wall" ? "━" : i.type === "door" ? "⌒" : "□"}
                    </span>
                    <span>
                      {i.name}
                      <small>{i.type}</small>
                    </span>
                    {i.locked && <LockKeyhole size={13} />}
                  </button>
                ))}
              </div>
              {matching.length > 150 && (
                <p className="notice">
                  Showing first 150. Search an object name to find any element.
                </p>
              )}
            </div>
          )}
          <div className="inspector-footer">
            <span className="save-dot" /> One floor. Endless possibilities.
          </div>
        </aside>
      </main>
      <footer className="statusbar">
        <span>
          <span className="status-dot" />
          {selected.length
            ? `${selected.length} selected`
            : tool === "select"
              ? "Ready to design"
              : palette.find((p) => p.tool === tool)?.label || "Select"}
        </span>
        <span className="navigation-hint">
          Scroll to pan · Ctrl/⌘ + scroll to zoom · Pinch on touch
        </span>
        <span className="coordinate-readout">
          {coords} {plan.calibration.calibrated ? "cm" : "units"}
          <span className="status-separator" />
          Grid {plan.grid} {plan.calibration.calibrated ? "cm" : "units"}
        </span>
      </footer>
      {notice && (
        <div role="status" className="toast">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {busy && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="spinner" />
            <h2>Preparing your drawing…</h2>
            <p>Validating architectural objects and their relationships.</p>
          </div>
        </div>
      )}
      {shareOpen && (
        <ShareDialog
          project={project}
          onClose={() => setShareOpen(false)}
          onDownload={downloadProject}
        />
      )}
      {saveOpen && (
        <SaveDialog
          initialName={projectRef.current.name || "Untitled"}
          onClose={() => setSaveOpen(false)}
          onSave={(filename) => void save(filename)}
        />
      )}
      {measure && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={measure.calibrate ? "Calibrate scale" : "Measurement"}
          >
            <button
              className="modal-close"
              aria-label="Close measurement"
              onClick={() => setMeasure(null)}
            >
              <X size={20} />
            </button>
            <div className="modal-icon">
              <Ruler size={25} />
            </div>
            <span className="eyebrow">
              {measure.calibrate ? "SET THE SCALE" : "POINT TO POINT"}
            </span>
            <h2>
              {measure.calibrate
                ? "One known distance."
                : "A little more precise."}
            </h2>
            <p className="measure-value">
              {dist(measure.a, measure.b).toFixed(2)}{" "}
              <small>
                {plan.calibration.calibrated ? "cm" : "drawing units"}
              </small>
            </p>
            {measure.calibrate ? (
              <>
                <p>
                  Enter the real distance between your two points. This rescales
                  the entire floor plan, including objects and annotations.
                </p>
                <label className="field">
                  <span>Real distance in centimeters</span>
                  <input
                    autoFocus
                    aria-label="Real distance in centimeters"
                    type="number"
                    min="0.001"
                    step="any"
                    placeholder="e.g. 500"
                    value={realDistance}
                    onChange={(e) => setRealDistance(e.target.value)}
                  />
                </label>
                <button
                  className="primary wide"
                  disabled={!(Number(realDistance) > 0)}
                  onClick={() => {
                    try {
                      const next = calibrate(
                        plan,
                        dist(measure.a, measure.b),
                        Number(realDistance),
                      );
                      commit(next);
                      setMeasure(null);
                      fit(next);
                      showNotice(
                        "Scale calibrated. All distances now use centimeters.",
                      );
                    } catch (e) {
                      showNotice((e as Error).message);
                    }
                  }}
                >
                  Apply scale <Check size={17} />
                </button>
              </>
            ) : (
              <div className="modal-actions">
                <button
                  onClick={() => {
                    setMeasure({ ...measure, calibrate: true });
                  }}
                >
                  Use for calibration
                </button>
                <button
                  className="primary"
                  onClick={() => {
                    const i: Item = {
                      id: uid(),
                      type: "dimension",
                      name: "Dimension",
                      a: measure.a,
                      b: measure.b,
                      offset: -30,
                    };
                    commit({ ...plan, items: [...plan.items, i] });
                    setMeasure(null);
                    setSelection([i.id]);
                  }}
                >
                  Add dimension
                </button>
              </div>
            )}
          </section>
        </div>
      )}
      {help && (
        <div className="modal-backdrop">
          <section
            className="modal help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Planform help"
          >
            <button
              className="modal-close"
              aria-label="Close help"
              onClick={() => setHelp(false)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">A QUICK FIELD GUIDE</span>
            <h2>Your next space starts here.</h2>
            <p>
              Draw walls by clicking connected corners, or drag a Room. Use
              Finish or Cancel to stop. Doors and windows attach to walls.
            </p>
            <p>
              Drag selected objects to move them. Circular wall handles edit
              shared corners. A square handle resizes symbols; the upper
              circular handle rotates. Properties provides exact numbers.
            </p>
            <p>
              Use Box select, Shift-click, Objects search, or the
              overlapping-object picker for dense drawings. Lock objects from
              Properties. Select two symbols and use Group in Properties.
            </p>
            <p>
              Scroll to pan; Ctrl/⌘ + scroll or pinch to zoom. Pan tool makes
              navigation explicit. Every tool and edit action also has a visible
              control.
            </p>
            <div className="shortcuts">
              <span>V / H / W / F / M</span>
              <b>Select / Pan / Wall / Furniture / Measure</b>
              <span>⌘/Ctrl Z / Shift Z</span>
              <b>Undo / Redo</b>
              <span>⌘/Ctrl C / V / D</span>
              <b>Copy / Paste / Duplicate</b>
              <span>Escape / 0</span>
              <b>Cancel / Fit drawing</b>
            </div>
            <p className="notice">
              Dimensions measure their own endpoints and do not attach to
              walls. Project downloads preserve every editable object.
            </p>
            <button className="primary wide" onClick={() => setHelp(false)}>
              Start planning <ChevronRight size={17} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
