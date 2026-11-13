import {
  Color,
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { exteriorWallLengthSummary } from "./exterior";
import { buildScene } from "./buildingScene";
import type { DrawingPdfPage } from "./drawingPdfPages";
import { visiblePlan } from "./layers";
import type { Plan } from "./model";

const views = [
  { id: "3d", label: "3D view", direction: 1 },
  { id: "3d-opposite", label: "3D view - Opposite corner", direction: -1 },
];

/** Capture both illustrations from the same geometry as the interactive view. */
export function buildingSnapshotPages(input: Plan): DrawingPdfPage[] {
  const plan = visiblePlan(input);
  const building = buildScene(plan);
  let renderer: WebGLRenderer | undefined;
  try {
    if (building.empty)
      throw Error(
        building.issues[0]?.message ?? "Draw walls to include a 3D view.",
      );
    const capture = new WebGLRenderer({ antialias: true });
    renderer = capture;
    const width = 1600;
    const height = 1050;
    capture.setSize(width, height);

    const scene = new Scene();
    scene.background = new Color("#eef3ed");
    const sky = new HemisphereLight("#ffffff", "#889a8c", 2.35);
    const sun = new DirectionalLight("#fff5e0", 1.75);
    sun.position.set(-5, 9, 7);
    scene.add(building.model, sky, sun);
    const { span } = building;
    const half = span * 0.76;
    const wide = (half * width) / height;
    const camera = new OrthographicCamera(
      -wide,
      wide,
      half,
      -half,
      0.01,
      span * 20 + 1000,
    );
    const middle = building.height * 0.43;
    const dimensions = exteriorWallLengthSummary(plan);
    return views.map(({ id, label, direction }) => {
      camera.position.set(
        direction * span * 1.15,
        middle + span * 0.83,
        direction * span * 1.05,
      );
      camera.lookAt(0, middle, 0);
      capture.render(scene, camera);
      const jpeg = capture.domElement.toDataURL("image/jpeg", 0.92);
      if (!jpeg.startsWith("data:image/jpeg;base64,"))
        throw Error("The browser could not capture the rendered model.");
      return {
        id,
        label,
        scale: "fit",
        drawing: {
          title: label,
          bounds: { x: 0, y: 0, w: width, h: height },
          markup: `<image href="${jpeg}" width="${width}" height="${height}" />`,
          fitLabel: "3D illustration - Not to scale",
          legend: dimensions ? [dimensions] : undefined,
        },
      };
    });
  } finally {
    building.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
