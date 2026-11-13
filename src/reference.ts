export type EmbeddedRaster = {
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  page?: number;
};

export type TraceReference = {
  image: EmbeddedRaster;
  x: number;
  y: number;
  width: number;
  opacity: number;
  locked: boolean;
  visible: boolean;
  calibrated: boolean;
  includeInExport: boolean;
};

export const MAX_SOURCE_BYTES = 24_000_000;
export const MAX_SOURCE_PIXELS = 24_000_000;
export const MAX_PDF_PAGES = 100;
export const MAX_RASTER_EDGE = 3000;
export const MAX_RASTER_PIXELS = 6_000_000;
export const MAX_RASTER_URL_LENGTH = 3_500_000;

export const referenceHeight = (reference: TraceReference) =>
  (reference.width * reference.image.height) / reference.image.width;

export function traceForExport(reference: TraceReference | undefined) {
  return reference?.visible && reference.calibrated && reference.includeInExport
    ? reference
    : undefined;
}

export function traceBounds(reference: TraceReference) {
  return {
    x: reference.x,
    y: reference.y,
    w: reference.width,
    h: referenceHeight(reference),
  };
}

function pngSize(bytes: Uint8Array) {
  if (
    bytes.byteLength < 24 ||
    ![137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82].every(
      (byte, index) => bytes[index] === byte,
    )
  )
    return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

function jpegSize(bytes: Uint8Array) {
  if (bytes[0] !== 255 || bytes[1] !== 216) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 2; i + 7 <= view.byteLength;) {
    if (bytes[i++] !== 255) return;
    while (bytes[i] === 255) i++;
    const marker = bytes[i++];
    if (marker === 0xda || marker === 0xd9 || i + 2 > view.byteLength) return;
    const length = view.getUint16(i);
    if (length < 2 || i + length > view.byteLength) return;
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      ![0xc4, 0xc8, 0xcc].includes(marker)
    ) {
      if (length < 7) return;
      return { width: view.getUint16(i + 5), height: view.getUint16(i + 3) };
    }
    i += length;
  }
}

function webpSize(bytes: Uint8Array) {
  if (bytes.byteLength < 30) return;
  const ascii = (position: number) =>
    String.fromCharCode(...bytes.subarray(position, position + 4));
  if (ascii(0) !== "RIFF" || ascii(8) !== "WEBP") return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ascii(12) === "VP8X")
    return {
      width: 1 + (view.getUint32(24, true) & 0xffffff),
      height: 1 + (view.getUint32(25, true) >>> 8),
    };
  if (
    ascii(12) === "VP8 " &&
    bytes[23] === 157 &&
    bytes[24] === 1 &&
    bytes[25] === 42
  )
    return {
      width: view.getUint16(26, true) & 0x3fff,
      height: view.getUint16(28, true) & 0x3fff,
    };
  if (ascii(12) === "VP8L" && bytes[20] === 0x2f) {
    const size = view.getUint32(21, true);
    return { width: 1 + (size & 0x3fff), height: 1 + ((size >>> 14) & 0x3fff) };
  }
}

export function rasterHeader(bytes: Uint8Array) {
  const png = pngSize(bytes);
  if (png) return { ...png, mime: "image/png" };
  const jpeg = jpegSize(bytes);
  if (jpeg) return { ...jpeg, mime: "image/jpeg" };
  const webp = webpSize(bytes);
  if (webp) return { ...webp, mime: "image/webp" };
}

export function embeddedRasterProblem(raster: EmbeddedRaster) {
  if (raster.width * raster.height > MAX_RASTER_PIXELS)
    return "Embedded raster exceeds 6 million pixels.";
  const [mime, contents] = raster.dataUrl.split(",", 2);
  try {
    const bytes = Uint8Array.from(atob(contents), (c) => c.charCodeAt(0));
    const size =
      mime === "data:image/png;base64" ? pngSize(bytes) : jpegSize(bytes);
    if (!size || size.width !== raster.width || size.height !== raster.height)
      return "Embedded raster data does not match its declared format or dimensions.";
  } catch {
    return "Embedded raster data is not valid base64.";
  }
}
