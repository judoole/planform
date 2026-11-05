import type { Box } from "./model";
const NS = "http://www.w3.org/2000/svg";
export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function exportSvg(element: SVGSVGElement, box: Box): string {
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("xmlns", NS);
  const pad = Math.max(box.w, box.h) * 0.025 + 10;
  svg.setAttribute(
    "viewBox",
    `${box.x - pad} ${box.y - pad} ${box.w + pad * 2} ${box.h + pad * 2}`,
  );
  svg.setAttribute("width", String(Math.ceil(box.w + pad * 2)));
  svg.setAttribute("height", String(Math.ceil(box.h + pad * 2)));
  const bg = document.createElementNS(NS, "rect");
  bg.setAttribute("x", String(box.x - pad));
  bg.setAttribute("y", String(box.y - pad));
  bg.setAttribute("width", String(box.w + pad * 2));
  bg.setAttribute("height", String(box.h + pad * 2));
  bg.setAttribute("fill", "white");
  svg.append(bg);
  const drawing = element.querySelector("[data-drawing]");
  if (drawing) svg.append(drawing.cloneNode(true));
  svg.querySelectorAll("[data-hit]").forEach((n) => n.remove());
  return new XMLSerializer().serializeToString(svg);
}
export async function exportPng(svg: string, name: string) {
  const img = new Image(),
    url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((ok, no) => {
      img.onload = () => ok();
      img.onerror = () => no(Error("Could not rasterize SVG."));
      img.src = url;
    });
    const scale = Math.min(2, 4096 / Math.max(img.width, img.height)),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(img.width * scale));
    canvas.height = Math.max(1, Math.ceil(img.height * scale));
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((ok, no) =>
      canvas.toBlob((b) => (b ? ok(b) : no(Error("PNG export failed.")))),
    );
    download(blob, name);
  } finally {
    URL.revokeObjectURL(url);
  }
}
