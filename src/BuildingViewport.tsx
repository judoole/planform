import { useLanguage, useTranslation } from "./i18n";
import { Eye, EyeOff, Maximize, Minus, Plus } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import {
  Color,
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { exteriorWallLengthSummary } from "./exterior";
import { buildScene } from "./buildingScene";
import type { Plan } from "./model";
import "./buildingViewport.css";

type BuildingScene = ReturnType<typeof buildScene>;
const noSelection: string[] = [];

function createViewport(host: HTMLDivElement, onPick: (id: string) => void) {
  const canvas = host.querySelector("canvas")!;
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new Scene();
  scene.background = new Color("#eef3ed");
  const sky = new HemisphereLight("#ffffff", "#889a8c", 2.35);
  const sun = new DirectionalLight("#fff5e0", 1.75);
  sun.position.set(-5, 9, 7);
  scene.add(sky, sun);

  const camera = new OrthographicCamera(-5, 5, 5, -5, 0.01, 1000);
  const controls = new OrbitControls(camera, canvas);
  controls.minPolarAngle = Math.PI / 24;
  controls.maxPolarAngle = Math.PI / 2 - Math.PI / 36;
  controls.minZoom = 0.2;
  controls.maxZoom = 12;
  controls.enableDamping = false;
  controls.cursorStyle = "grab";

  let frame: number | undefined;
  let visible = false;
  let contextLost = false;
  let span = 6;
  let height = 1;
  let building: BuildingScene | undefined;
  let pointer: { id: number; x: number; y: number } | undefined;

  function scheduleRender() {
    if (!visible || contextLost || frame !== undefined) return;
    frame = requestAnimationFrame(() => {
      frame = undefined;
      renderer.render(scene, camera);
    });
  }

  function resize() {
    const { width, height } = host.getBoundingClientRect();
    visible = width > 0 && height > 0;
    if (!visible) {
      if (frame !== undefined) cancelAnimationFrame(frame);
      frame = undefined;
      return;
    }
    const aspect = width / height;
    const half = span * 0.82 * Math.max(1, 1 / aspect);
    camera.left = -half * aspect;
    camera.right = half * aspect;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    scheduleRender();
  }

  function reset() {
    const middle = height * 0.38;
    controls.target.set(0, middle, 0);
    camera.position.set(span * 1.15, middle + span * 0.83, span * 1.05);
    camera.zoom = 1;
    camera.far = span * 20 + 1000;
    camera.updateProjectionMatrix();
    controls.update();
    scheduleRender();
  }

  const raycaster = new Raycaster();
  const mouse = new Vector2();
  const activePointers = new Set<number>();
  function press(event: PointerEvent) {
    canvas.focus({ preventScroll: true });
    activePointers.add(event.pointerId);
    pointer =
      event.button === 0 && activePointers.size === 1
        ? { id: event.pointerId, x: event.clientX, y: event.clientY }
        : undefined;
  }
  function cancel(event: PointerEvent) {
    activePointers.delete(event.pointerId);
    pointer = undefined;
  }
  function release(event: PointerEvent) {
    const start = pointer;
    cancel(event);
    if (
      !building ||
      !start ||
      event.pointerId !== start.id ||
      Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5
    )
      return;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    mouse.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    // Check the roof as an occluder so covered interior walls cannot be picked.
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    raycaster.setFromCamera(mouse, camera);
    const targets = building.roof.visible
      ? [building.walls, building.roof]
      : [building.walls];
    const hit = raycaster.intersectObjects(targets, true)[0];
    const id = hit?.object.userData.itemId;
    if (typeof id === "string") onPick(id);
  }

  function lost(event: Event) {
    event.preventDefault();
    contextLost = true;
    host.dataset.contextLost = "true";
    canvas.dispatchEvent(new Event("planform-gl-change"));
  }
  function restored() {
    contextLost = false;
    delete host.dataset.contextLost;
    canvas.dispatchEvent(new Event("planform-gl-change"));
    scheduleRender();
  }

  controls.addEventListener("change", scheduleRender);
  canvas.addEventListener("pointerdown", press);
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", cancel);
  canvas.addEventListener("webglcontextlost", lost);
  canvas.addEventListener("webglcontextrestored", restored);
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();
  reset();

  return {
    load(next: BuildingScene) {
      const reframe =
        !building ||
        building.empty ||
        span > next.span * 2.1 ||
        next.span > span * 2.1;
      if (building) scene.remove(building.model);
      building = next;
      scene.add(next.model);
      span = next.span;
      height = next.height;
      resize();
      if (reframe) reset();
      scheduleRender();
      return () => {
        // Keep the previous dimensions for the next scene's framing decision.
        scene.remove(next.model);
      };
    },
    render: scheduleRender,
    reset,
    orbit(horizontal: number, vertical: number) {
      if (horizontal !== 0) controls.rotateLeft(horizontal);
      if (vertical !== 0) controls.rotateUp(vertical);
    },
    zoom(factor: number) {
      camera.zoom = Math.min(
        controls.maxZoom,
        Math.max(controls.minZoom, camera.zoom * factor),
      );
      camera.updateProjectionMatrix();
      controls.update();
      scheduleRender();
    },
    dispose() {
      if (frame !== undefined) cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", press);
      canvas.removeEventListener("pointerup", release);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      controls.dispose();
      renderer.dispose();
    },
  };
}

type Viewport = ReturnType<typeof createViewport>;

export default function BuildingViewport({
  plan,
  selection = noSelection,
  onSelect,
}: {
  plan: Plan;
  selection?: string[];
  onSelect?: (id: string) => void;
}) {
  const t = useTranslation();
  const language = useLanguage();
  const [showRoof, setShowRoof] = useState(true);
  const [error, setError] = useState("");
  const host = useRef<HTMLDivElement>(null);
  const viewport = useRef<Viewport>(null);
  const select = useRef(onSelect);
  const building = useMemo(() => buildScene(plan), [plan]);

  useEffect(() => {
    select.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const element = host.current!;
    const canvas = element.querySelector("canvas")!;
    function contextChange() {
      setError(
        element.dataset.contextLost
          ? "The 3D view is waiting for the graphics context to recover."
          : "",
      );
    }
    try {
      viewport.current = createViewport(element, (id) => select.current?.(id));
      canvas.addEventListener("planform-gl-change", contextChange);
      return () => {
        canvas.removeEventListener("planform-gl-change", contextChange);
        viewport.current?.dispose();
        viewport.current = null;
      };
    } catch {
      setError(
        "3D preview needs WebGL 2. You can continue editing in the floor plan.",
      );
    }
  }, []);

  useEffect(() => {
    const unload = viewport.current?.load(building);
    return () => {
      unload?.();
      building.dispose();
    };
  }, [building]);

  useEffect(() => {
    building.roof.visible = showRoof;
    building.select(selection);
    viewport.current?.render();
  }, [building, selection, showRoof]);

  function keyboard(event: KeyboardEvent<HTMLCanvasElement>) {
    const view = viewport.current;
    if (!view || event.ctrlKey || event.metaKey || event.altKey) return;
    const step = Math.PI / 18;
    switch (event.key) {
      case "ArrowLeft":
        view.orbit(step, 0);
        break;
      case "ArrowRight":
        view.orbit(-step, 0);
        break;
      case "ArrowUp":
        view.orbit(0, -step);
        break;
      case "ArrowDown":
        view.orbit(0, step);
        break;
      case "+":
      case "=":
        view.zoom(1.2);
        break;
      case "-":
        view.zoom(1 / 1.2);
        break;
      case "0":
        view.reset();
        break;
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation();
  }

  const exteriorLengths = useMemo(
    () => exteriorWallLengthSummary(plan, language),
    [plan, language],
  );
  const hasRoof = building.roof.children.length > 0;
  return (
    <section className="building-viewport" aria-label={t("Building 3D view")}>
      <div className="building-viewport-surface" ref={host}>
        <canvas
          aria-label={t("Interactive 3D building model")}
          aria-describedby="building-viewport-controls"
          tabIndex={error || building.empty ? -1 : 0}
          onKeyDown={keyboard}
        />
      </div>
      {!building.empty && !error && exteriorLengths && (
        <p className="building-viewport-dimensions">{exteriorLengths}</p>
      )}
      <span className="building-viewport-help" id="building-viewport-controls">
        {t("Drag to orbit · Right-drag to pan · Scroll to zoom")}
        <span className="building-viewport-keyboard">
          {". "}
          {t(
            "When the model has focus, use arrow keys to orbit, plus or minus to zoom, and zero to reset.",
          )}
        </span>
      </span>
      {!building.empty && !error && (
        <div
          className="building-viewport-actions"
          role="group"
          aria-label={t("3D view controls")}
        >
          <button
            type="button"
            aria-pressed={hasRoof && showRoof}
            disabled={!hasRoof}
            onClick={() => setShowRoof((showing) => !showing)}
          >
            {showRoof ? <Eye size={16} /> : <EyeOff size={16} />} {t("Roof")}
          </button>
          <button
            type="button"
            aria-label={t("Zoom out 3D")}
            title={t("Zoom out")}
            onClick={() => viewport.current?.zoom(1 / 1.2)}
          >
            <Minus size={17} />
          </button>
          <button
            type="button"
            aria-label={t("Zoom in 3D")}
            title={t("Zoom in")}
            onClick={() => viewport.current?.zoom(1.2)}
          >
            <Plus size={17} />
          </button>
          <button
            type="button"
            aria-label={t("Reset 3D view")}
            title={t("Reset view")}
            onClick={() => viewport.current?.reset()}
          >
            <Maximize size={16} />
          </button>
        </div>
      )}
      {error || building.empty ? (
        <p
          className="building-viewport-empty"
          role={error ? "alert" : "status"}
        >
          {t(
            error ||
              building.issues[0]?.message ||
              "Draw walls in the floor plan to begin the 3D model.",
          )}
        </p>
      ) : building.issues.length > 0 ? (
        <details className="building-viewport-issues">
          <summary>
            {building.issues.length === 1
              ? t(building.issues[0].message)
              : t("{count} issues in the 3D model", {
                  count: building.issues.length,
                })}
          </summary>
          {building.issues.length > 1 && (
            <ul>
              {building.issues.map((issue, i) => (
                <li key={`${issue.code}-${issue.itemId ?? i}`}>
                  {t(issue.message)}
                </li>
              ))}
            </ul>
          )}
        </details>
      ) : null}
    </section>
  );
}
