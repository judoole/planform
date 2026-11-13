import {
  LanguagePicker,
  LanguageProvider,
  useLanguage,
  useTranslation,
  type MessageValues,
} from "./i18n";
import {
  lazy,
  Suspense,
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
  History as HistoryIcon,
  Image as ImageIcon,
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
  deletionIds,
  duplicateItems,
  History,
  calibrate,
  dist,
  serialize,
  parseProject,
  isRect,
  uid,
} from "./model";
import { furniture, type FurnitureKind } from "./furniture";
import GarageArea from "./GarageArea";
import GarageSitePanel from "./GarageSitePanel";
import GarageViewsPanel from "./GarageViewsPanel";
import { planArtworkBounds } from "./preview";
import ExportDrawingDialog from "./ExportDrawingDialog";
import type { BackgroundId } from "./mapProvider";
import type { PropertyMap } from "./propertyMap";
import { useParcelMap } from "./useParcelMap";
import { mapDimensionAnchors } from "./dimensions";
import { download } from "./exports";
import ShareDialog from "./ShareDialog";
import SaveDialog from "./SaveDialog";
import BuildingSettingsPanel from "./BuildingSettingsPanel";
import ProposalManager from "./ProposalManager";
import { RecoveryDialog, ReplaceProjectDialog } from "./RecoveryDialogs";
import {
  readRecovery,
  saveRecovery as saveLocalRevision,
  type RecoveryRevision,
} from "./recovery";
import ReferencePicker from "./ReferencePicker";
import TraceReferenceDialog from "./TraceReferenceDialog";
import type { EmbeddedRaster, TraceReference } from "./reference";
import LayerPanel from "./LayerPanel";
import {
  activeLayer,
  blockedDrawingEdit,
  isEditProtected,
  isItemLocked,
  placeOnActiveLayer,
  visiblePlan,
  type RenovationView,
} from "./layers";
import { isShareHash, readShareHash } from "./share";
import {
  activePlan,
  activeDrawingId,
  projectDrawings,
  asMultiProject,
  selectDrawing,
  addProposal,
  renameProposal,
  removeProposal,
  MAX_PROPOSALS,
  replaceActivePlan,
  versionNames,
  type ProjectDrawing,
  type Project,
} from "./project";
import { checkJsonSize, readProjectFile, validateProject } from "./validation";
import Canvas, { type Tool, type Camera } from "./Canvas";
import Properties, { DoorStyleSelect, NumberField } from "./Properties";
import { findRooms } from "./rooms";
import {
  createExteriorContourReader,
  visibleExteriorContour,
} from "./exterior";
const BuildingViewport = lazy(() => import("./BuildingViewport"));
const MapWorkspace = lazy(() => import("./MapWorkspace"));
type ViewMode = "plan" | "3d" | "map";

const itemTypes: Record<Item["type"], string> = {
  wall: "Wall",
  door: "Door",
  window: "Window",
  stairs: "Stairs",
  furniture: "Furniture",
  dimension: "Dimension",
  text: "Label",
  group: "Group",
};

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
function startup(sharedProject?: Project) {
  if (sharedProject) return { project: sharedProject, status: "Shared copy" };
  try {
    const latest = readRecovery(localStorage)[0];
    if (latest)
      return {
        project: latest.project,
        status: "Saved locally",
        recovered: true,
      };
    return { project: emptyPlan(), status: "No local recovery yet" };
  } catch {
    return { project: emptyPlan(), status: "Recovery unavailable" };
  }
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
  return (
    <LanguageProvider>
      {hash ? <SharedProject key={hash} hash={hash} /> : <Editor />}
    </LanguageProvider>
  );
}

function SharedProject({ hash }: { hash: string }) {
  const t = useTranslation();
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
        <LanguagePicker />
        {result === "invalid" ? (
          <>
            <h2>{t("Couldn’t open this share link")}</h2>
            <p role="alert">
              {t(
                "Check that you have the full link, or ask the sender for the project file.",
              )}
            </p>
            <a href={localAddress()}>{t("Open local editor")}</a>
          </>
        ) : (
          <p role="status">{t("Opening shared plan…")}</p>
        )}
      </section>
    </main>
  );
}

function Editor({ sharedProject }: { sharedProject?: Project }) {
  const language = useLanguage();
  const t = useTranslation();
  const [initial] = useState(() => startup(sharedProject));
  const [project, setProject] = useState<Project>(initial.project),
    [preview, setPreview] = useState<Plan | null>(null),
    [overlay, setOverlay] = useState(false),
    [overlayId, setOverlayId] = useState<string>(),
    [manageOpen, setManageOpen] = useState(false),
    [deletedProposals, setDeletedProposals] = useState<
      { drawing: ProjectDrawing; index: number }[]
    >([]),
    [selection, setSelection] = useState<string[]>([]),
    [tool, setTool] = useState<Tool>("select"),
    [snap, setSnap] = useState(true),
    [kind, setKind] = useState<FurnitureKind>("sofa"),
    [doorStyle, setDoorStyle] = useState<DoorStyle>("hinged"),
    [wallThickness, setWallThickness] = useState(15),
    [camera, setCamera] = useState<Camera>({ x: 100, y: 100, k: 0.8 }),
    [panelOpen, setPanelOpen] = useState(false),
    [tab, setTab] = useState<"properties" | "objects" | "layers" | "building">(
      "properties",
    ),
    [viewMode, setViewMode] = useState<ViewMode>("plan"),
    [openedMap, setOpenedMap] = useState(false),
    [mapBackground, setMapBackground] = useState<BackgroundId>("property"),
    [opened3D, setOpened3D] = useState(false),
    [buildingViewReset, setBuildingViewReset] = useState(0),
    [query, setQuery] = useState(""),
    [overlap, setOverlap] = useState<string[]>([]),
    [overlapOpen, setOverlapOpen] = useState(false),
    [menu, setMenu] = useState(false),
    [exportOpen, setExportOpen] = useState(false),
    [drawingToolsOpen, setDrawingToolsOpen] = useState(false),
    [drawingTool, setDrawingTool] = useState<"area" | "views" | "site">(
      "views",
    ),
    [help, setHelp] = useState(false),
    [notice, setNotice] = useState<{
      message: string;
      values?: MessageValues;
    } | null>(null),
    [shareOpen, setShareOpen] = useState(false),
    [saveOpen, setSaveOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [referencePicker, setReferencePicker] = useState(false),
    [referenceSettings, setReferenceSettings] = useState(false),
    [autosave, setAutosave] = useState(initial.status),
    [revisions, setRevisions] = useState<RecoveryRevision[] | null>(null),
    [replacement, setReplacement] = useState<{
      action: string;
      run: () => void;
    } | null>(null),
    [fileState, setFileState] = useState<{
      baseline: Project | null;
      hasFile: boolean;
    }>({
      baseline: initial.recovered ? null : initial.project,
      hasFile: false,
    }),
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
    proposalImportTarget = useRef<string | null>(null),
    histories = useRef(new Map<string, History>()),
    projectRef = useRef(project),
    lastSaved = useRef(project),
    fileSession = useRef(0),
    clipboard = useRef<Item[]>([]),
    nameBefore = useRef<Plan | null>(null);
  const saveHandle = useRef<FileSystemFileHandle | null>(null);
  const version = activeDrawingId(project);
  const drawings = projectDrawings(project);
  const activeDrawing = drawings.find((d) => d.id === version)!;
  const drawingName = (entry: ProjectDrawing) =>
    entry.role === "existing" && entry.name === versionNames.existing
      ? t(versionNames.existing)
      : entry.name;
  const proposals = drawings.filter((d) => d.role === "proposal");
  const canAddProposal = proposals.length < MAX_PROPOSALS;
  const reference =
    drawings.find((d) => d.id === overlayId && d.id !== version) ??
    drawings.find((d) => d.role === "existing" && d.id !== version) ??
    drawings.find((d) => d.id !== version);
  const drawing = activePlan(project);
  const parcels = useParcelMap(
    viewMode === "map" || exportOpen ? drawing.propertyMap : undefined,
  );
  const plan = preview ?? drawing;
  const shown = useMemo(() => visiblePlan(plan), [plan]);
  const shownIds = useMemo(
    () => new Set(shown.items.map((item) => item.id)),
    [shown.items],
  );
  const visibleSelection = selection.filter((id) => shownIds.has(id));
  useEffect(() => {
    setSelection((ids) =>
      ids.every((id) => shownIds.has(id))
        ? ids
        : ids.filter((id) => shownIds.has(id)),
    );
    setOverlap((ids) =>
      ids.every((id) => shownIds.has(id))
        ? ids
        : ids.filter((id) => shownIds.has(id)),
    );
  }, [shownIds]);
  function drawingHistory(id: string) {
    let history = histories.current.get(id);
    if (!history) {
      history = new History();
      histories.current.set(id, history);
    }
    return history;
  }
  const history = drawingHistory(version);
  const ghostPlan = overlay ? reference?.plan : undefined;
  const ghost = useMemo(() => ghostPlan && visiblePlan(ghostPlan), [ghostPlan]);
  const [readExterior] = useState(createExteriorContourReader);
  const exterior = readExterior(shown);
  const visibleExterior = visibleExteriorContour(shown, readExterior);
  const { rooms, roomError } = useMemo(() => {
    try {
      return { rooms: findRooms(shown.items), roomError: undefined };
    } catch {
      // Automatic analysis must not prevent editing or reopening a document
      // when polygon clipping cannot resolve unusual wall geometry.
      return {
        rooms: [],
        roomError:
          "Room areas could not be calculated. Check overlapping or very small walls.",
      };
    }
  }, [shown.items]);
  const showNotice = useCallback((message: string, values?: MessageValues) => {
    setNotice({ message, values });
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
      if (!strict) {
        const blocked = blockedDrawingEdit(before, clean);
        if (blocked) {
          setPreview(null);
          showNotice(
            "“{name}” is hidden or locked. Show and unlock it to make this edit.",
            { name: blocked.name },
          );
          return;
        }
      }
      drawingHistory(activeDrawingId(current)).push(before);
      setPreview(null);
      updateProject(replaceActivePlan(current, clean));
    },
    [showNotice, updateProject],
  );
  function setRenovationView(view: RenovationView) {
    const current = projectRef.current;
    const update = (plan: Plan) => ({ ...plan, renovationView: view });
    drawingHistory(activeDrawingId(current)).updateSnapshots(update);
    setPreview(null);
    setOverlapOpen(false);
    setCancelToken((id) => id + 1);
    updateProject(replaceActivePlan(current, update(activePlan(current))));
  }
  function previewEdit(next: Plan | null) {
    if (next && blockedDrawingEdit(drawing, next)) {
      setPreview(null);
      return;
    }
    setPreview(next);
  }
  function changeLayers(next: Plan) {
    setOverlapOpen(false);
    setCancelToken((id) => id + 1);
    commit(next, undefined, true);
  }
  function updatePropertyMap(propertyMap: PropertyMap) {
    const current = projectRef.current;
    const next = { ...activePlan(current), propertyMap };
    try {
      checkJsonSize(serialize(replaceActivePlan(current, next)));
      commit(next, undefined, true);
    } catch (error) {
      showNotice((error as Error).message);
    }
  }
  function updateGarage(garage: Plan["garage"]) {
    const current = projectRef.current;
    const next = { ...activePlan(current), garage };
    checkJsonSize(serialize(replaceActivePlan(current, next)));
    commit(next, undefined, true);
  }
  const fit = useCallback(
    (p: Plan = activePlan(projectRef.current)) => {
      const svg = svgRef.current;
      if (!svg) return;
      const visible = visiblePlan(p);
      const box = planArtworkBounds(
          visible,
          visibleExteriorContour(visible, readExterior),
        ),
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
    },
    [readExterior],
  );
  useEffect(() => {
    const plan = activePlan(projectRef.current);
    if (plan.items.length || plan.traceReference?.visible) fit();
  }, []);
  const saveRecovery = useCallback(() => {
    if (sharedProject || lastSaved.current === projectRef.current) return;
    try {
      saveLocalRevision(localStorage, projectRef.current);
      lastSaved.current = projectRef.current;
      setAutosave("Saved locally");
    } catch {
      setAutosave("Recovery unavailable");
    }
  }, [sharedProject]);
  useEffect(() => {
    if (sharedProject) return;
    window.addEventListener("pagehide", saveRecovery);
    return () => {
      window.removeEventListener("pagehide", saveRecovery);
      saveRecovery();
    };
  }, [sharedProject, saveRecovery]);
  useEffect(() => {
    if (sharedProject || project === lastSaved.current) return;
    setAutosave("Saving locally…");
    const timer = setTimeout(saveRecovery, 900);
    return () => clearTimeout(timer);
  }, [project, sharedProject, saveRecovery]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  function changeViewMode(next: ViewMode) {
    if (next === viewMode) return;
    cancel();
    setMeasure(null);
    setViewMode(next);
    if (next === "map") {
      setOpenedMap(true);
      setPanelOpen(false);
    }
    if (next === "3d") {
      setOpened3D(true);
      if (!selection.length) setTab("building");
    }
  }

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
  function setExteriorDimensions(show: boolean) {
    const current = projectRef.current;
    const withVisibility = (p: Plan) => ({
      ...p,
      showExteriorDimensions: show,
    });
    drawingHistory(activeDrawingId(current)).updateSnapshots(withVisibility);
    if (preview) cancel();
    updateProject(
      replaceActivePlan(current, withVisibility(activePlan(current))),
    );
  }
  function installReference(image: EmbeddedRaster) {
    const current = projectRef.current;
    const plan = activePlan(current);
    const previous = plan.traceReference;
    const reference: TraceReference = {
      image,
      x: previous?.x ?? 0,
      y: previous?.y ?? 0,
      width: previous?.width ?? Math.min(image.width, 1000),
      opacity: previous?.opacity ?? 0.55,
      locked: previous?.locked ?? true,
      visible: true,
      calibrated: false,
      includeInExport: previous?.includeInExport ?? false,
    };
    const next = {
      ...plan,
      traceReference: reference,
      calibration:
        plan.items.length === 0
          ? { ...plan.calibration, imported: true, calibrated: false }
          : plan.calibration,
    };
    checkJsonSize(serialize(replaceActivePlan(current, next)));
    validateProject(next);
    clearDrawingContext();
    commit(next, undefined, true);
    setReferencePicker(false);
    fit(next);
    showNotice(
      "Tracing reference imported. Calibrate a known distance to set its scale.",
    );
  }
  function changeReference(reference?: TraceReference) {
    const current = activePlan(projectRef.current);
    let next: Plan;
    if (reference) {
      next = { ...current, traceReference: reference };
    } else {
      const { traceReference: _removed, ...remaining } = current;
      next = remaining;
    }
    try {
      validateProject(next);
      commit(next, undefined, true);
      if (!reference) setReferenceSettings(false);
    } catch (error) {
      showNotice((error as Error).message);
    }
  }
  function switchVersion(next: string) {
    if (next === version) return;
    clearDrawingContext();
    updateProject(selectDrawing(projectRef.current, next));
  }
  function updateProposalProject(next: Project) {
    checkJsonSize(serialize(next));
    clearDrawingContext();
    updateProject(next);
  }
  function createProposal(source: Plan) {
    updateProposalProject(addProposal(projectRef.current, source));
    setManageOpen(false);
  }
  function duplicateAsProposal(sourceId = version) {
    try {
      const source = projectDrawings(projectRef.current).find(
        (d) => d.id === sourceId,
      )!;
      createProposal(source.plan);
    } catch (error) {
      showNotice((error as Error).message);
    }
  }
  function renameActiveProposal(name: string) {
    try {
      updateProposalProject(renameProposal(projectRef.current, version, name));
      showNotice("Proposal renamed.");
    } catch (error) {
      showNotice((error as Error).message);
    }
  }
  function deleteActiveProposal() {
    const current = projectRef.current;
    const entries = projectDrawings(current);
    try {
      updateProposalProject(removeProposal(current, version));
      const deleted = [
        ...deletedProposals,
        {
          drawing: activeDrawing,
          index: entries.findIndex((d) => d.id === version),
        },
      ];
      if (deleted.length > MAX_PROPOSALS) {
        const expired = deleted.shift()!;
        histories.current.delete(expired.drawing.id);
      }
      setDeletedProposals(deleted);
      showNotice("Deleted {name}. Use Restore last deleted to undo.", {
        name: activeDrawing.name,
      });
    } catch (error) {
      showNotice((error as Error).message);
    }
  }
  function restoreProposal() {
    const deleted = deletedProposals.at(-1);
    if (!deleted) return;
    try {
      const current = asMultiProject(projectRef.current);
      if (
        current.drawings.filter((d) => d.role === "proposal").length >=
        MAX_PROPOSALS
      )
        throw Error(`Projects allow up to ${MAX_PROPOSALS} proposals.`);
      const restored = [...current.drawings];
      restored.splice(deleted.index, 0, deleted.drawing);
      updateProposalProject({
        ...current,
        active: deleted.drawing.id,
        drawings: restored,
      });
      setDeletedProposals((entries) => entries.slice(0, -1));
      showNotice("Proposal restored, including its edit history.");
    } catch (error) {
      showNotice((error as Error).message);
    }
  }
  function chooseProposalFile(replace = false) {
    proposalImportTarget.current = replace ? version : null;
    proposedFileRef.current?.click();
  }
  function editableSelection() {
    return shown.items
      .filter(
        (item) => selection.includes(item.id) && !isEditProtected(plan, item),
      )
      .map((item) => item.id);
  }
  function del() {
    const ids = editableSelection();
    if (!ids.length) return;
    const removed = deletionIds(plan, ids);
    const dependent = plan.items.filter(
      (i) => removed.has(i.id) && !ids.includes(i.id),
    );
    if (dependent.some((i) => isEditProtected(plan, i))) {
      showNotice(
        "Show and unlock the attached objects before deleting this selection.",
      );
      return;
    }
    const dimensions = dependent.filter((i) => i.type === "dimension").length;
    if (
      dimensions &&
      !window.confirm(
        t(
          "Delete the selection and {count} attached dimension(s)? Undo will restore their attachments.",
          { count: dimensions },
        ),
      )
    )
      return;
    commit(removeItems(plan, ids));
    setSelection([]);
  }
  function duplicate() {
    const ids = editableSelection();
    if (!ids.length) return;
    const wallIds = new Set(ids);
    const blocked = plan.items.find(
      (item) =>
        (item.type === "door" || item.type === "window") &&
        wallIds.has(item.hostId) &&
        isEditProtected(plan, item),
    );
    if (blocked) {
      showNotice("Unlock “{name}” before duplicating its wall.", {
        name: blocked.name,
      });
      return;
    }
    const r = duplicateItems(plan, ids);
    commit(r.plan);
    setSelection(r.ids);
  }
  function copy() {
    const ids = new Set(visibleSelection);
    const copied = shown.items.filter(
      (i) =>
        ids.has(i.id) ||
        ((i.type === "door" || i.type === "window") && ids.has(i.hostId)),
    );
    const copiedIds = new Set(copied.map((i) => i.id));
    clipboard.current = clone(
      copied.map((i) =>
        i.type === "dimension"
          ? mapDimensionAnchors(i, plan.items, (anchor) =>
              copiedIds.has(anchor.itemId) ? anchor : undefined,
            )
          : i,
      ),
    );
    showNotice("{count} object(s) copied. Use Paste to place a copy.", {
      count: visibleSelection.length,
    });
  }
  function paste() {
    if (!clipboard.current.length) {
      showNotice("Select objects and use Copy first.");
      return;
    }
    if (activeLayer(plan).locked || !activeLayer(plan).visible) {
      showNotice("Choose a visible, unlocked layer to paste objects.");
      return;
    }
    const copiedWalls = new Set(
      clipboard.current
        .filter((item) => item.type === "wall")
        .map((item) => item.id),
    );
    const visibleWalls = new Set(
      shown.items
        .filter((item) => item.type === "wall" && !isItemLocked(plan, item))
        .map((item) => item.id),
    );
    const items = clone(clipboard.current)
      .filter(
        (item) =>
          (item.type !== "door" && item.type !== "window") ||
          copiedWalls.has(item.hostId) ||
          visibleWalls.has(item.hostId),
      )
      .map((item) => {
        const { layerId: _sourceLayer, ...copy } = item;
        return placeOnActiveLayer(plan, copy);
      });
    if (!items.length) {
      showNotice(
        "Paste openings with their host walls or into a drawing with the same visible, unlocked host.",
      );
      return;
    }
    const temp = {
      ...plan,
      items: [
        ...plan.items.filter((i) => !items.some((x) => x.id === i.id)),
        ...items,
      ],
    };
    const r = duplicateItems(
      temp,
      items.map((i) => i.id),
    );
    const newItems = r.plan.items.slice(temp.items.length);
    commit({ ...plan, items: [...plan.items, ...newItems] });
    setSelection(r.ids);
  }
  function downloadProject(filename?: string) {
    const current = projectRef.current;
    const contents = serialize(current);
    checkJsonSize(contents);
    download(
      new Blob([contents], { type: "application/json" }),
      filename ?? `${current.name || "Untitled"}.planform.json`,
    );
    setFileState({ baseline: current, hasFile: true });
  }
  async function save(filename?: string) {
    try {
      if (!filename) {
        const current = projectRef.current;
        const session = fileSession.current;
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
                  description: t("Planform project"),
                  accept: { "application/json": [".planform.json", ".json"] },
                },
              ],
            }));
          const writable = await handle.createWritable();
          await writable.write(contents);
          await writable.close();
          if (fileSession.current === session) {
            saveHandle.current = handle;
            setFileState({ baseline: current, hasFile: true });
            showNotice("Project saved. Future saves will update this file.");
          }
          return;
        }
        setSaveOpen(true);
        return;
      }
      downloadProject(filename);
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
    setBuildingViewReset((n) => n + 1);
    clearDrawingContext();
    commit(next, undefined, true);
    fit(next);
    showNotice("Drawing opened. Undo restores the previous drawing.");
  }
  function replaceProject(next: Project) {
    setBuildingViewReset((n) => n + 1);
    clearDrawingContext();
    setOverlay(false);
    histories.current = new Map();
    setDeletedProposals([]);
    setOverlayId(undefined);
    setManageOpen(false);
    updateProject(next);
  }
  function resetFileSession(next: Project | null, hasFile: boolean) {
    fileSession.current++;
    saveHandle.current = null;
    setFileState({ baseline: next, hasFile });
  }
  function requestReplacement(action: string, run: () => void) {
    if (projectRef.current === fileState.baseline) run();
    else setReplacement({ action, run });
  }
  function continueReplacement(downloadFirst: boolean) {
    if (!replacement) return;
    try {
      if (downloadFirst) downloadProject();
      setReplacement(null);
      replacement.run();
    } catch (error) {
      showNotice((error as Error).message);
    }
  }
  function newProject() {
    saveRecovery();
    const next = emptyPlan();
    resetFileSession(next, false);
    if (projectRef.current.version === 2) {
      setBuildingViewReset((n) => n + 1);
      clearDrawingContext();
      commit(next, undefined, true);
    } else {
      replaceProject(next);
    }
    setCamera({ x: 100, y: 100, k: 0.8 });
    setMenu(false);
  }
  function requestNewProject() {
    requestReplacement("Create new project", newProject);
  }
  function chooseProjectFile() {
    fileRef.current?.click();
    setMenu(false);
  }
  function showRecovery() {
    setMenu(false);
    saveRecovery();
    try {
      setRevisions(readRecovery(localStorage));
    } catch {
      setAutosave("Recovery unavailable");
      setRevisions([]);
    }
  }
  function restoreRecovery(revision: RecoveryRevision) {
    setRevisions(null);
    requestReplacement("Restore selected revision", () => {
      saveRecovery();
      const next = revision.project;
      resetFileSession(null, false);
      replaceProject(next);
      fit(activePlan(next));
      showNotice("Local revision restored.");
    });
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
        const imported = parseProject(contents);
        const targetId = proposalImportTarget.current;
        const current = projectRef.current;
        if (targetId) {
          const entry = projectDrawings(current).find((d) => d.id === targetId);
          if (!entry || entry.role !== "proposal")
            throw Error("Choose a proposal to replace.");
          const next = replaceActivePlan(
            selectDrawing(current, targetId),
            imported,
          );
          checkJsonSize(serialize(next));
          drawingHistory(targetId).push(entry.plan);
          updateProposalProject(next);
          setManageOpen(false);
          showNotice("Proposal replaced. Undo restores its previous drawing.");
        } else {
          createProposal(imported);
          showNotice("Drawing imported as a new proposal.");
        }
        return;
      }
      const next = readProjectFile(contents);
      requestReplacement("Open selected project", () => {
        saveRecovery();
        resetFileSession(next, true);
        if (next.version === 2 && projectRef.current.version === 2) {
          openDrawing(next);
        } else {
          replaceProject(next);
          fit(activePlan(next));
          showNotice("Project opened.");
        }
      });
    } catch (e) {
      showNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (e.key === "Escape" && !referencePicker) {
        if (drawingToolsOpen) {
          setDrawingToolsOpen(false);
          return;
        }
      }
      if (
        drawingToolsOpen ||
        exportOpen ||
        shareOpen ||
        manageOpen ||
        saveOpen ||
        revisions ||
        replacement ||
        referencePicker ||
        referenceSettings ||
        busy
      )
        return;
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
        else chooseProjectFile();
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
      if (viewMode === "map") return;
      if (mod && k === "a") {
        e.preventDefault();
        setSelection(shown.items.map((i) => i.id));
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
      if (viewMode === "plan" && t) setTool(t.tool);
      if (viewMode === "plan" && k === "0") fit();
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
    if (viewMode !== "plan") changeViewMode("plan");
    setTool(t);
    if ((t === "furniture" || t === "door") && window.innerWidth < 760)
      setPanelOpen(false);
  }
  const selected = shown.items.filter((i) => selection.includes(i.id));
  const toolLabel = t(
    tool === "calibrate"
      ? "Calibrate scale"
      : (palette.find((entry) => entry.tool === tool)?.label ?? "Select"),
  );
  const matching = shown.items.filter(
    (i) =>
      !query ||
      `${i.name} ${i.type} ${t(itemTypes[i.type])}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <div className="app-shell">
      <header className="topbar">
        <a
          className="brand"
          href="#"
          onClick={(e) => e.preventDefault()}
          aria-label={t("Planform home")}
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
            aria-label={t("Project name")}
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
          <span role="status">{t(autosave)}</span>
          <span role="status">
            {project !== fileState.baseline
              ? t("File has unsaved edits")
              : fileState.hasFile
                ? t("Project file current")
                : t("No project file saved")}
          </span>
        </div>
        <div className="header-actions">
          <button onClick={requestNewProject} title={t("New empty project")}>
            <FilePlus2 size={16} />
            <span>{t("New")}</span>
          </button>
          <button
            onClick={chooseProjectFile}
            title={t("Open Planform project")}
          >
            <FolderOpen size={16} />
            <span>{t("Open")}</span>
          </button>
          {!sharedProject && (
            <button
              onClick={showRecovery}
              className="recovery-button"
              title={t("Local recovery history")}
              aria-label={t("Local recovery history")}
            >
              <HistoryIcon size={16} />
            </button>
          )}
          <button onClick={() => save()} title={t("Download editable project")}>
            <Download size={16} />
            <span>{t("Save project")}</span>
          </button>
          <button
            aria-label={t("Share plan")}
            title={t("Share plan")}
            onClick={() => setShareOpen(true)}
          >
            <Link2 size={16} />
            <span>{t("Share")}</span>
          </button>
          <LanguagePicker />
          <div className="drawing-export-action">
            <button className="primary" onClick={() => setExportOpen(true)}>
              {t("Export")}
            </button>
          </div>
          <button
            className="mobile-menu"
            aria-label={t("Project menu")}
            onClick={() => setMenu(!menu)}
          >
            <Menu size={20} />
          </button>
        </div>
      </header>
      {sharedProject && (
        <div className="share-banner">
          <span>
            {t(
              "Editing a shared copy. Download the project to keep your changes.",
            )}
          </span>
          <a href={localAddress()}>{t("Open local editor")}</a>
        </div>
      )}
      {menu && (
        <div className="mobile-project-menu">
          <LanguagePicker />
          <button onClick={requestNewProject}>{t("New project")}</button>
          <button onClick={chooseProjectFile}>{t("Open project")}</button>
          {!sharedProject && (
            <button onClick={showRecovery}>
              {t("Local recovery history")}
            </button>
          )}
          <button
            onClick={() => {
              save();
              setMenu(false);
            }}
          >
            {t("Save project")}
          </button>
        </div>
      )}
      <input
        type="file"
        ref={fileRef}
        accept=".json,.planform.json"
        aria-label={t("Project file")}
        hidden
        onChange={(e) => loadFile(e.currentTarget)}
      />
      <input
        type="file"
        ref={proposedFileRef}
        aria-label={t("Proposed drawing file")}
        accept=".json,.planform.json"
        hidden
        onChange={(e) => loadFile(e.currentTarget, "proposed")}
      />
      <div className="workspace-toolbar">
        <div className="plan-toolbar-group">
          <div className="floor-badge">
            <Layers size={15} />
            <span>{t("Ground floor")}</span>
            <small>01</small>
          </div>
          <div
            className="plan-versions"
            role="group"
            aria-label={t("Plan versions")}
          >
            <select
              aria-label={t("Active drawing")}
              value={version}
              onChange={(e) => switchVersion(e.target.value)}
            >
              {drawings.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {drawingName(entry)}
                </option>
              ))}
            </select>
            <button
              disabled={!canAddProposal}
              title={
                canAddProposal
                  ? t("Copy the active drawing as a new proposal")
                  : t("Maximum of {count} proposals reached", {
                      count: MAX_PROPOSALS,
                    })
              }
              onClick={() => duplicateAsProposal()}
            >
              <Copy size={14} /> {t("New proposal")}
            </button>
            <button
              onClick={() => {
                setNotice(null);
                setManageOpen(true);
              }}
            >
              {t("Manage proposals")}{" "}
              <span className="proposal-count">
                {proposals.length}/{MAX_PROPOSALS}
              </span>
            </button>
            {reference && (
              <>
                <button
                  className="plan-overlay-toggle"
                  aria-pressed={overlay}
                  onClick={() => setOverlay(!overlay)}
                >
                  <Layers size={14} /> {t("Overlay")}
                </button>
                {overlay && (
                  <select
                    aria-label={t("Overlay drawing")}
                    value={reference.id}
                    onChange={(e) => setOverlayId(e.target.value)}
                  >
                    {drawings
                      .filter((entry) => entry.id !== version)
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {drawingName(entry)}
                        </option>
                      ))}
                  </select>
                )}
              </>
            )}
          </div>
        </div>
        <div className="toolbar-separator" />
        <button
          aria-label={t("Undo")}
          title={t("Undo · ⌘/Ctrl Z")}
          disabled={!history.past.length}
          onClick={undo}
        >
          <Undo2 size={18} />
        </button>
        <button
          aria-label={t("Redo")}
          title={t("Redo · ⌘/Ctrl Shift Z")}
          disabled={!history.future.length}
          onClick={redo}
        >
          <Redo2 size={18} />
        </button>
        <div className="toolbar-separator" />
        <button
          aria-label={t("Copy")}
          title={t("Copy")}
          hidden={viewMode === "map"}
          disabled={!selection.length}
          onClick={copy}
        >
          <Copy size={17} />
        </button>
        <button
          hidden={viewMode === "map"}
          aria-label={t("Paste")}
          title={t("Paste")}
          onClick={paste}
        >
          <ClipboardPaste size={17} />
        </button>
        <button
          aria-label={t("Delete")}
          title={t("Delete selected")}
          hidden={viewMode === "map"}
          disabled={!selection.length}
          onClick={del}
        >
          <Trash2 size={17} />
        </button>
        <div className="toolbar-spacer" />
        <div
          className="building-view-switch"
          role="group"
          aria-label={t("Drawing view")}
        >
          <button
            aria-pressed={viewMode === "plan"}
            onClick={() => changeViewMode("plan")}
          >
            {t("Floor plan")}
          </button>
          <button
            aria-pressed={viewMode === "3d"}
            onClick={() => changeViewMode("3d")}
          >
            3D
          </button>
          <button
            aria-pressed={viewMode === "map"}
            onClick={() => changeViewMode("map")}
          >
            {t("Map")}
          </button>
        </div>
        <button
          hidden={viewMode !== "plan"}
          className={snap ? "snap-toggle active" : "snap-toggle"}
          aria-pressed={snap}
          onClick={() => setSnap(!snap)}
          title={t("Snap to grid, endpoints and alignments")}
        >
          <Magnet size={16} />
          <span>{t(snap ? "Snap on" : "Snap off")}</span>
        </button>
        <button
          hidden={viewMode === "map"}
          className="cancel-button"
          aria-label={t("Cancel")}
          onClick={cancel}
        >
          <X size={15} />
          <span>{t("Cancel")}</span>
        </button>
        <button
          className="properties-toggle"
          hidden={viewMode === "map"}
          aria-label={t("Toggle properties")}
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen(!panelOpen)}
        >
          <SlidersHorizontal size={18} />
        </button>
      </div>
      <main className="workspace">
        <nav
          className="tool-palette"
          aria-label={t("Drawing tools")}
          hidden={viewMode === "map"}
        >
          {palette.map(({ tool: entryTool, label, icon: Icon, key }, idx) => (
            <button
              key={entryTool}
              className={`${tool === entryTool ? "selected " : ""}${idx === 3 || idx === 9 ? "tool-divider" : ""}`}
              aria-label={t(label)}
              aria-pressed={tool === entryTool}
              title={`${t(label)}${key ? " · " + key : ""}`}
              onClick={() => chooseTool(entryTool)}
            >
              <Icon size={21} strokeWidth={1.65} />
              <span>{t(label)}</span>
            </button>
          ))}
          <button
            className="help-tool"
            aria-label={t("Help and shortcuts")}
            onClick={() => setHelp(true)}
          >
            <HelpCircle size={21} />
            <span>{t("Help")}</span>
          </button>
        </nav>
        <section className="drawing-region">
          <div
            className="plan-view"
            inert={viewMode !== "plan"}
            aria-hidden={viewMode !== "plan"}
          >
            <div className="drawing-topline">
              <span>
                <span className="tiny-square" /> {t("FLOOR PLAN")}{" "}
                <span className="muted">/</span>{" "}
                <b className={ghost ? "plan-overlay-key" : undefined}>
                  {ghost
                    ? t("{name} overlay", { name: drawingName(reference!) })
                    : t("DESIGN MODE")}
                </b>
              </span>
              <button
                className="trace-reference-button"
                onClick={() =>
                  plan.traceReference
                    ? setReferenceSettings(true)
                    : setReferencePicker(true)
                }
              >
                <ImageIcon size={14} />
                <span>
                  {plan.traceReference
                    ? t("Tracing reference")
                    : t("Import reference")}
                </span>
              </button>
            </div>
            {!plan.calibration.calibrated && (
              <div className="calibration-banner">
                <span>
                  {t("Uncalibrated drawing · distances are drawing units")}
                </span>
                <button onClick={() => setTool("calibrate")}>
                  <Ruler size={14} /> {t("Calibrate scale")}
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
                    <span>{t("PLACE")}</span>
                    <select
                      aria-label={t("Furniture symbol")}
                      value={kind}
                      onChange={(e) => setKind(e.target.value as FurnitureKind)}
                    >
                      {Object.entries(furniture).map(([k, { label }]) => (
                        <option key={k} value={k}>
                          {t(label)}
                        </option>
                      ))}
                    </select>
                  </>
                ) : tool === "door" ? (
                  <>
                    <span>{t("PLACE")}</span>
                    <DoorStyleSelect
                      label={t("New door type")}
                      value={doorStyle}
                      onChange={setDoorStyle}
                    />
                  </>
                ) : (
                  <>
                    <span>{t("WALL THICKNESS")}</span>
                    <input
                      aria-label={t("New wall thickness")}
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
                    <small>
                      {plan.calibration.calibrated ? "cm" : t("units")}
                    </small>
                  </>
                )}
              </div>
            )}
            <Canvas
              plan={plan}
              shown={shown}
              ghost={ghost}
              rooms={rooms}
              exterior={visibleExterior}
              setPreview={previewEdit}
              commit={commit}
              selection={visibleSelection}
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
                  01 <span>{t("Ground floor")}</span>
                </span>
                {overlap.length > 1 && (
                  <div className="dropdown-anchor">
                    <button
                      className="overlap-button"
                      onClick={() => setOverlapOpen(!overlapOpen)}
                    >
                      <Layers size={15} />
                      {t("{count} overlapping", { count: overlap.length })}{" "}
                      <ChevronDown size={12} />
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
                            {shown.items.find((i) => i.id === id)?.name || id}
                            {selection.includes(id) && <Check size={14} />}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="zoom-controls">
                <button
                  aria-label={t("Zoom out")}
                  onClick={() => zoom(1 / 1.25)}
                >
                  <Minus size={17} />
                </button>
                <span>{Math.round(camera.k * 100)}%</span>
                <button aria-label={t("Zoom in")} onClick={() => zoom(1.25)}>
                  <Plus size={17} />
                </button>
                <span className="zoom-divider" />
                <button
                  aria-label={t("Fit drawing")}
                  title={t("Fit drawing · 0")}
                  onClick={() => fit()}
                >
                  <Maximize size={17} />
                </button>
              </div>
            </div>
          </div>
          {opened3D && (
            <div className="building-view" hidden={viewMode !== "3d"}>
              <Suspense
                fallback={
                  <p className="building-view-loading" role="status">
                    {t("Loading 3D view…")}
                  </p>
                }
              >
                <BuildingViewport
                  key={`${buildingViewReset}:${version}`}
                  plan={shown}
                  selection={visibleSelection}
                  onSelect={(id) => {
                    setSelection([id]);
                    setTab("properties");
                    setPanelOpen(true);
                  }}
                />
              </Suspense>
            </div>
          )}
          {openedMap && (
            <div className="building-view" hidden={viewMode !== "map"}>
              <Suspense
                fallback={
                  <p className="building-view-loading" role="status">
                    {t("Loading map…")}
                  </p>
                }
              >
                <MapWorkspace
                  key={`${buildingViewReset}:${version}`}
                  plan={shown}
                  active={viewMode === "map"}
                  background={mapBackground}
                  onBackground={setMapBackground}
                  parcels={parcels}
                  onChange={updatePropertyMap}
                  onImportedMap={() => {
                    setDrawingTool("site");
                    setDrawingToolsOpen(true);
                  }}
                />
              </Suspense>
            </div>
          )}
        </section>
        {panelOpen && viewMode !== "map" && (
          <button
            className="drawer-scrim"
            aria-label={t("Close properties")}
            onClick={() => setPanelOpen(false)}
          />
        )}
        <aside
          className={`inspector ${panelOpen ? "open" : ""}`}
          hidden={viewMode === "map"}
        >
          <div className="inspector-tabs">
            <button
              className={tab === "properties" ? "active" : ""}
              onClick={() => setTab("properties")}
            >
              <SlidersHorizontal size={15} />
              {t("Properties")}
            </button>
            <button
              className={tab === "objects" ? "active" : ""}
              onClick={() => setTab("objects")}
            >
              <Layers size={15} />
              {t("Objects")}
            </button>
            <button
              className={tab === "layers" ? "active" : ""}
              onClick={() => setTab("layers")}
            >
              {t("Layers")}
            </button>
            <button
              className={tab === "building" ? "active" : ""}
              onClick={() => setTab("building")}
            >
              {t("Building")}
            </button>
            <button
              className="drawer-close"
              aria-label={t("Close properties panel")}
              onClick={() => setPanelOpen(false)}
            >
              <X size={17} />
            </button>
          </div>
          {tab === "properties" ? (
            <Properties
              plan={plan}
              rooms={rooms}
              roomError={roomError && t(roomError)}
              exterior={exterior}
              selection={visibleSelection}
              commit={commit}
              setSelection={setSelection}
              setTool={setTool}
              onDuplicate={duplicate}
              onDelete={del}
              onError={showNotice}
              onShowExteriorDimensions={setExteriorDimensions}
              onRenovationView={setRenovationView}
            />
          ) : tab === "layers" ? (
            <LayerPanel
              plan={plan}
              selection={visibleSelection}
              onLayerChange={changeLayers}
              onMove={commit}
              onError={showNotice}
            />
          ) : tab === "building" ? (
            <BuildingSettingsPanel
              plan={plan}
              onChange={(building) =>
                commit({ ...drawing, building }, undefined, true)
              }
            />
          ) : (
            <div className="objects-panel">
              <label className="object-search">
                <Search size={15} />
                <input
                  placeholder={t("Find objects…")}
                  aria-label={t("Find objects")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="objects-summary">
                {t(
                  matching.length === 1 ? "{count} object" : "{count} objects",
                  { count: matching.length.toLocaleString(language) },
                )}{" "}
                <button
                  onClick={() => {
                    setSelection(shown.items.map((i) => i.id));
                  }}
                >
                  {t("Select all")}
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
                      <small>
                        {language === "en" ? i.type : t(itemTypes[i.type])}
                      </small>
                    </span>
                    {isItemLocked(plan, i) && <LockKeyhole size={13} />}
                  </button>
                ))}
              </div>
              {matching.length > 150 && (
                <p className="notice">
                  {t(
                    "Showing first 150. Search an object name to find any element.",
                  )}
                </p>
              )}
            </div>
          )}
          <div className="inspector-footer">
            <span className="save-dot" />{" "}
            {t("One floor. Endless possibilities.")}
          </div>
        </aside>
      </main>
      <footer className="statusbar">
        <span>
          <span className="status-dot" />
          {viewMode === "map"
            ? t("Map")
            : viewMode === "3d" && !selected.length
              ? t("3D view")
              : selected.length
                ? t("{count} selected", { count: selected.length })
                : tool === "select"
                  ? t("Ready to design")
                  : toolLabel}
        </span>
        {viewMode === "plan" && (
          <>
            <span className="navigation-hint">
              {t("Scroll to pan · Ctrl/⌘ + scroll to zoom · Pinch on touch")}
            </span>
            <span className="coordinate-readout">
              {coords} {plan.calibration.calibrated ? "cm" : t("units")}
              <span className="status-separator" />
              {t("Grid")} {plan.grid}{" "}
              {plan.calibration.calibrated ? "cm" : t("units")}
            </span>
          </>
        )}
      </footer>
      {notice && (
        <div role="status" className="toast">
          {t(notice.message, notice.values)}
          <button
            aria-label={t("Dismiss notification")}
            onClick={() => setNotice(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {busy && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="spinner" />
            <h2>{t("Preparing your drawing…")}</h2>
            <p>
              {t("Validating architectural objects and their relationships.")}
            </p>
          </div>
        </div>
      )}
      {manageOpen && (
        <ProposalManager
          key={version}
          drawing={activeDrawing}
          canAdd={canAddProposal}
          canRestore={canAddProposal && deletedProposals.length > 0}
          notice={notice ? t(notice.message, notice.values) : ""}
          onClose={() => setManageOpen(false)}
          onRename={renameActiveProposal}
          onDuplicate={() => duplicateAsProposal()}
          onDuplicateExisting={() =>
            duplicateAsProposal(drawings.find((d) => d.role === "existing")!.id)
          }
          onImport={() => chooseProposalFile()}
          onReplace={() => chooseProposalFile(true)}
          onDelete={deleteActiveProposal}
          onRestore={restoreProposal}
        />
      )}
      {shareOpen && (
        <ShareDialog
          project={project}
          onClose={() => setShareOpen(false)}
          onDownload={downloadProject}
        />
      )}
      {drawingToolsOpen && (
        <div className="modal-backdrop">
          <section
            className="modal sheet-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="drawing-tools-title"
          >
            <button
              className="modal-close"
              aria-label={t("Close more drawings")}
              onClick={() => setDrawingToolsOpen(false)}
            >
              <X size={16} />
            </button>
            <h2 id="drawing-tools-title">
              {t("More drawings and measurements")}
            </h2>
            <p>
              {t(
                "Open a side view, mark a site map or estimate building areas for a simple rectangular building.",
              )}
            </p>
            <div
              className="drawing-tools-tabs"
              role="group"
              aria-label={t("Drawing tools")}
            >
              <button
                aria-pressed={drawingTool === "area"}
                onClick={() => setDrawingTool("area")}
              >
                {t("Building areas")}
              </button>
              <button
                aria-pressed={drawingTool === "views"}
                onClick={() => setDrawingTool("views")}
              >
                {t("Section and elevations")}
              </button>
              <button
                aria-pressed={drawingTool === "site"}
                onClick={() => setDrawingTool("site")}
              >
                {t("Site plan")}
              </button>
            </div>
            {drawingTool === "area" ? (
              <GarageArea plan={drawing} onChange={updateGarage} />
            ) : drawingTool === "views" ? (
              <GarageViewsPanel
                key={version}
                plan={drawing}
                onChange={updateGarage}
              />
            ) : (
              <GarageSitePanel
                key={version}
                plan={drawing}
                onChange={updateGarage}
              />
            )}
          </section>
        </div>
      )}
      {exportOpen && (
        <ExportDrawingDialog
          plan={drawing}
          mapBackground={mapBackground}
          parcels={parcels}
          name={
            project.version === 2
              ? drawing.name
              : `${project.name} - ${activeDrawing.name}`
          }
          onClose={() => setExportOpen(false)}
          onAdditionalDrawings={() => {
            setExportOpen(false);
            setDrawingToolsOpen(true);
          }}
        />
      )}
      {revisions && (
        <RecoveryDialog
          revisions={revisions}
          onClose={() => setRevisions(null)}
          onRestore={restoreRecovery}
        />
      )}
      {replacement && (
        <ReplaceProjectDialog
          action={t(replacement.action)}
          onClose={() => setReplacement(null)}
          onContinue={continueReplacement}
        />
      )}
      {referencePicker && (
        <ReferencePicker
          onApply={installReference}
          onClose={() => setReferencePicker(false)}
        />
      )}
      {referenceSettings && plan.traceReference && (
        <TraceReferenceDialog
          reference={plan.traceReference}
          onChange={changeReference}
          onClose={() => setReferenceSettings(false)}
          onCalibrate={() => {
            setReferenceSettings(false);
            setTool("calibrate");
          }}
          onReplace={() => {
            setReferenceSettings(false);
            setReferencePicker(true);
          }}
          onRemove={() => changeReference()}
        />
      )}
      {saveOpen && (
        <SaveDialog
          initialName={projectRef.current.name || t("Untitled")}
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
            aria-label={
              measure.calibrate ? t("Calibrate scale") : t("Measurement")
            }
          >
            <button
              className="modal-close"
              aria-label={t("Close measurement")}
              onClick={() => setMeasure(null)}
            >
              <X size={20} />
            </button>
            <div className="modal-icon">
              <Ruler size={25} />
            </div>
            <span className="eyebrow">
              {measure.calibrate ? t("SET THE SCALE") : t("POINT TO POINT")}
            </span>
            <h2>
              {measure.calibrate
                ? t("One known distance.")
                : t("A little more precise.")}
            </h2>
            <p className="measure-value">
              {dist(measure.a, measure.b).toFixed(2)}{" "}
              <small>
                {plan.calibration.calibrated ? "cm" : t("drawing units")}
              </small>
            </p>
            {measure.calibrate ? (
              <>
                <p>
                  {t(
                    "Enter the real distance between your two points. This rescales the entire floor plan, including hidden and locked objects and any tracing reference. The site map keeps its own scale.",
                  )}
                </p>
                <label className="field">
                  <span>{t("Real distance in centimeters")}</span>
                  <input
                    autoFocus
                    aria-label={t("Real distance in centimeters")}
                    type="number"
                    min="0.001"
                    step="any"
                    placeholder={t("e.g. 500")}
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
                      commit(next, undefined, true);
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
                  {t("Apply scale")} <Check size={17} />
                </button>
              </>
            ) : (
              <div className="modal-actions">
                <button
                  onClick={() => {
                    setMeasure({ ...measure, calibrate: true });
                  }}
                >
                  {t("Use for calibration")}
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
                    try {
                      commit({
                        ...plan,
                        items: [...plan.items, placeOnActiveLayer(plan, i)],
                      });
                    } catch (error) {
                      showNotice((error as Error).message);
                      return;
                    }
                    setMeasure(null);
                    setSelection([i.id]);
                  }}
                >
                  {t("Add dimension")}
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
            aria-label={t("Planform help")}
          >
            <button
              className="modal-close"
              aria-label={t("Close help")}
              onClick={() => setHelp(false)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">{t("A QUICK FIELD GUIDE")}</span>
            <h2>{t("Your next space starts here.")}</h2>
            <p>
              {t(
                "Draw walls by clicking connected corners, or drag a Room. Use Finish or Cancel to stop. Doors and windows attach to walls.",
              )}
            </p>
            <p>
              {t(
                "Drag selected objects to move them. Circular wall handles edit shared corners. A square handle resizes symbols; the upper circular handle rotates. Properties provides exact numbers.",
              )}
            </p>
            <p>
              {t(
                "Use Box select, Shift-click, Objects search, or the overlapping-object picker for dense drawings. Lock objects from Properties. Select two symbols and use Group in Properties.",
              )}
            </p>
            <p>
              {t(
                "Scroll to pan; Ctrl/⌘ + scroll or pinch to zoom. Pan tool makes navigation explicit. Every tool and edit action also has a visible control.",
              )}
            </p>
            <p>
              {t(
                "Open Building to set floor heights and a roof. Switch to 3D to inspect the building and select walls or openings.",
              )}
            </p>
            <div className="shortcuts">
              <span>V / H / W / F / M</span>
              <b>{t("Select / Pan / Wall / Furniture / Measure")}</b>
              <span>⌘/Ctrl Z / Shift Z</span>
              <b>{t("Undo / Redo")}</b>
              <span>⌘/Ctrl C / V / D</span>
              <b>{t("Copy / Paste / Duplicate")}</b>
              <span>{t("Escape / 0")}</span>
              <b>{t("Cancel / Fit drawing")}</b>
            </div>
            <p className="notice">
              {t(
                "Dimensions measure their own endpoints and do not attach to walls. Project downloads preserve every editable object.",
              )}
            </p>
            <p className="github-help">
              {t("Planform is open source.")}{" "}
              <a
                href="https://github.com/judoole/planform"
                target="_blank"
                rel="noreferrer"
              >
                {t("View the project on GitHub")}
              </a>
              .
            </p>
            <button className="primary wide" onClick={() => setHelp(false)}>
              {t("Start planning")} <ChevronRight size={17} />
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
