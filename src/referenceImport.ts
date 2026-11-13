import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  MAX_PDF_PAGES,
  MAX_RASTER_EDGE,
  MAX_RASTER_PIXELS,
  MAX_RASTER_URL_LENGTH,
  MAX_SOURCE_BYTES,
  MAX_SOURCE_PIXELS,
  rasterHeader,
  type EmbeddedRaster,
} from "./reference";

export type { EmbeddedRaster } from "./reference";

type ReferenceFile = {
  pageCount: number;
  renderPage(page?: number): Promise<EmbeddedRaster>;
  dispose(): Promise<void>;
};

function rasterScale(width: number, height: number) {
  return Math.min(
    1,
    MAX_RASTER_EDGE / Math.max(width, height),
    Math.sqrt(MAX_RASTER_PIXELS / (width * height)),
  );
}

function canvas(width: number, height: number) {
  const target = document.createElement("canvas");
  target.width = Math.max(1, Math.floor(width));
  target.height = Math.max(1, Math.floor(height));
  return target;
}

function embed(
  target: HTMLCanvasElement,
  name: string,
  page?: number,
): EmbeddedRaster {
  let dataUrl = target.toDataURL("image/png");
  if (dataUrl.length > MAX_RASTER_URL_LENGTH) {
    // The original canvas already has an opaque white underlay.
    dataUrl = target.toDataURL("image/jpeg", 0.83);
  }
  if (dataUrl === "data:," || dataUrl.length > MAX_RASTER_URL_LENGTH)
    throw Error(
      "The reference is too large to embed. Choose a smaller image or crop the PDF page.",
    );
  return {
    name,
    dataUrl,
    width: target.width,
    height: target.height,
    ...(page === undefined ? {} : { page }),
  };
}

function localAssets() {
  return new URL(
    import.meta.env.DEV
      ? "/node_modules/pdfjs-dist/"
      : `${import.meta.env.BASE_URL}pdfjs/`,
    window.location.href,
  );
}

async function openPdf(
  bytes: Uint8Array<ArrayBuffer>,
  name: string,
): Promise<ReferenceFile> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const assets = localAssets();
  const task = pdfjs.getDocument({
    data: bytes,
    cMapUrl: new URL("cmaps/", assets).href,
    standardFontDataUrl: new URL("standard_fonts/", assets).href,
    iccUrl: new URL("iccs/", assets).href,
    wasmUrl: new URL("wasm/", assets).href,
    enableXfa: false,
    stopAtErrors: true,
    maxImageSize: MAX_SOURCE_PIXELS,
    canvasMaxAreaInBytes: MAX_SOURCE_PIXELS * 4,
  });
  let document;
  try {
    document = await task.promise;
  } catch {
    await task.destroy();
    throw Error(
      "This PDF could not be read. Choose a valid PDF without password protection.",
    );
  }
  if (document.numPages < 1 || document.numPages > MAX_PDF_PAGES) {
    await task.destroy();
    throw Error(`PDF references must contain 1–${MAX_PDF_PAGES} pages.`);
  }
  return {
    pageCount: document.numPages,
    async renderPage(page = 1) {
      if (!Number.isInteger(page) || page < 1 || page > document.numPages)
        throw Error("Choose a page within this PDF.");
      try {
        const source = await document.getPage(page);
        const size = source.getViewport({ scale: 1 });
        if (
          !Number.isFinite(size.width + size.height) ||
          size.width <= 0 ||
          size.height <= 0
        )
          throw Error("Invalid page size.");
        const viewport = source.getViewport({
          scale: rasterScale(size.width, size.height),
        });
        const target = canvas(viewport.width, viewport.height);
        await source.render({
          canvas: target,
          viewport,
          transform: [
            target.width / viewport.width,
            0,
            0,
            target.height / viewport.height,
            0,
            0,
          ],
          annotationMode: pdfjs.AnnotationMode.DISABLE,
          background: "white",
        }).promise;
        source.cleanup();
        return embed(target, name, page);
      } catch {
        throw Error(
          "This PDF page could not be rendered. Try another page or a smaller PDF.",
        );
      }
    },
    dispose: () => task.destroy(),
  };
}

export async function openReferenceFile(file: File): Promise<ReferenceFile> {
  if (file.size > MAX_SOURCE_BYTES)
    throw Error("Choose an image or PDF no larger than 24 MB.");
  const name = file.name.slice(0, 200) || "Reference";
  const bytes = new Uint8Array(await file.arrayBuffer());
  const signature = new TextDecoder().decode(bytes.subarray(0, 1024));
  const size = rasterHeader(bytes);
  if (!size && signature.includes("%PDF-")) return openPdf(bytes, name);
  if (!size || size.width <= 0 || size.height <= 0)
    throw Error("Choose a valid PDF, PNG, JPEG, or WebP file.");
  if (size.width * size.height > MAX_SOURCE_PIXELS)
    throw Error("Choose an image no larger than 24 million pixels.");

  return {
    pageCount: 1,
    async renderPage() {
      let source: ImageBitmap;
      try {
        source = await createImageBitmap(
          new Blob([bytes], { type: size.mime }),
        );
      } catch {
        throw Error("This image could not be decoded.");
      }
      try {
        const scale = rasterScale(source.width, source.height);
        const target = canvas(source.width * scale, source.height * scale);
        const context = target.getContext("2d")!;
        context.fillStyle = "white";
        context.fillRect(0, 0, target.width, target.height);
        context.drawImage(source, 0, 0, target.width, target.height);
        return embed(target, name);
      } finally {
        source.close();
      }
    },
    async dispose() {},
  };
}
