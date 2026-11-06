import type { Project } from "./project";
import { readProjectFile, validateProjectFile } from "./validation";

const PREFIX = "#plan=";
const VERSION = "1.";
const MAX_URL_LENGTH = 8000;
const MAX_PROJECT_BYTES = 64 * 1024;
const TOO_LARGE =
  "This selection is too large for a share link. Download the project file to share it.";

export function isShareHash(hash: string) {
  return hash.startsWith(PREFIX);
}

export async function createShareUrl(project: Project, address: string) {
  const url = new URL(address);
  url.search = "";
  const bytes = new TextEncoder().encode(
    JSON.stringify(validateProjectFile(project)),
  );
  if (bytes.length > MAX_PROJECT_BYTES) throw new Error(TOO_LARGE);
  const stream = new Blob([bytes])
    .stream()
    .pipeThrough(new CompressionStream("deflate"));
  const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
  const payload = btoa(
    Array.from(compressed, (b) => String.fromCharCode(b)).join(""),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");
  url.hash = `${PREFIX}${VERSION}${payload}`;
  if (url.href.length > MAX_URL_LENGTH) throw new Error(TOO_LARGE);
  return url.href;
}

export async function readShareHash(hash: string): Promise<Project> {
  if (!isShareHash(hash) || hash.length > MAX_URL_LENGTH)
    throw new Error("This share link is invalid or too long.");
  const versioned = hash.slice(PREFIX.length);
  if (!versioned.startsWith(VERSION))
    throw new Error("This version of the share link is not supported.");
  const payload = versioned.slice(VERSION.length);
  if (!/^[A-Za-z0-9_-]+$/.test(payload) || payload.length % 4 === 1)
    throw new Error("The share link is incomplete or damaged.");

  const bytes = Uint8Array.from(
    atob(payload.replaceAll("-", "+").replaceAll("_", "/")),
    (c) => c.charCodeAt(0),
  );
  const reader = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream("deflate"))
    .getReader();
  const output = new Uint8Array(MAX_PROJECT_BYTES);
  let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (length + value.length > output.length) {
        await reader.cancel();
        throw new Error("The drawing in this share link is too large.");
      }
      output.set(value, length);
      length += value.length;
    }
  } finally {
    reader.releaseLock();
  }
  return readProjectFile(
    new TextDecoder("utf-8", { fatal: true }).decode(
      output.subarray(0, length),
    ),
  );
}
