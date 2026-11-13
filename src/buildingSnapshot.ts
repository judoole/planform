import {
  Color,
  DirectionalLight,
  HemisphereLight,
  OrthographicCamera,
  Scene,
  WebGLRenderer,
} from "three";
import { buildScene } from "./buildingScene";
import type { Plan } from "./model";
import type { SheetDrawing } from "./sheets";

/** Capture a fresh illustration from the same geometry as the interactive 3D view. */
export function buildingSnapshot(plan: Plan): SheetDrawing {
  const building = buildScene(plan);
  if (building.empty) {
    building.dispose();
    throw Error(
      building.issues[0]?.message ?? "Draw walls to include a 3D view.",
    );
  }
  let renderer: WebGLRenderer | undefined;
  try {
    renderer = new WebGLRenderer({ antialias: true });
    const width = 1600;
    const height = 1050;
    renderer.setSize(width, height);

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
    camera.position.set(span * 1.15, middle + span * 0.83, span * 1.05);
    camera.lookAt(0, middle, 0);
    renderer.render(scene, camera);
    const jpeg = renderer.domElement.toDataURL("image/jpeg", 0.92);
    if (!jpeg.startsWith("data:image/jpeg;base64,"))
      throw Error("The browser could not capture the rendered model.");
    return {
      title: "3D view",
      bounds: { x: 0, y: 0, w: width, h: height },
      markup: `<image href="${jpeg}" width="${width}" height="${height}" />`,
      fitLabel: "3D illustration - Not to scale",
    };
  } finally {
    building.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
  }
}
