import {
  type Plan,
  type RectItem,
  type Point,
  type Box,
  uid,
  emptyPlan,
  parseProject,
} from "./model";
const NS = "http://www.w3.org/2000/svg";
const allowedTags = new Set([
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "clipPath",
  "mask",
  "linearGradient",
  "radialGradient",
  "stop",
  "use",
  "title",
  "desc",
]);
const shapeTags = new Set([
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "use",
]);
const allowedAttrs = new Set(
  "id version d x y x1 y1 x2 y2 cx cy r rx ry width height points fill stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit fill-rule clip-rule opacity fill-opacity stroke-opacity stroke-dasharray stroke-dashoffset transform clip-path mask clipPathUnits maskUnits maskContentUnits gradientUnits gradientTransform xlink:href href offset stop-color stop-opacity font-family font-size font-weight font-style text-anchor dominant-baseline dx dy viewBox preserveAspectRatio color display visibility vector-effect".split(
    " ",
  ),
);
const styleProps = new Set(
  "fill stroke stroke-width stroke-linecap stroke-linejoin stroke-miterlimit fill-rule clip-rule opacity fill-opacity stroke-opacity stroke-dasharray stroke-dashoffset clip-path mask font-family font-size font-weight font-style text-anchor dominant-baseline color display visibility".split(
    " ",
  ),
);
export function sanitizeSvg(
  text: string,
  prefix = "",
): { root: SVGSVGElement; warnings: string[] } {
  if (text.length > 15_000_000)
    throw Error("SVG exceeds the 15 MB import limit.");
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  if (
    doc.querySelector("parsererror") ||
    doc.documentElement.localName !== "svg"
  )
    throw Error("The file is not valid SVG.");
  const root = doc.documentElement as unknown as SVGSVGElement,
    warnings = new Set<string>();
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))]) {
    if (!allowedTags.has(el.localName)) {
      warnings.add(`Removed unsupported <${el.localName}> content.`);
      el.remove();
      continue;
    }
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name,
        value = attr.value;
      if (name === "xmlns" || name === "xmlns:xlink") continue;
      if (name === "style") {
        for (const declaration of value.split(";")) {
          const colon = declaration.indexOf(":");
          if (colon < 0) continue;
          const prop = declaration.slice(0, colon).trim(),
            v = declaration.slice(colon + 1).trim();
          if (
            styleProps.has(prop) &&
            !/(?:url\s*\((?!\s*['"]?#)|expression|javascript:|@import|\\)/i.test(
              v,
            )
          )
            el.setAttribute(prop, v);
          else warnings.add(`Removed unsupported style: ${prop}.`);
        }
        el.removeAttribute(name);
        continue;
      }
      if (!allowedAttrs.has(name)) {
        warnings.add(`Removed unsupported attribute: ${name}.`);
        el.removeAttribute(name);
        continue;
      }
      if (
        ((name === "href" || name === "xlink:href") &&
          !value.startsWith("#")) ||
        /(?:javascript:|data:|https?:|file:|\/\/|expression|@import|\\)/i.test(
          value,
        ) ||
        /url\s*\((?!\s*['"]?#)/i.test(value)
      ) {
        warnings.add("Blocked an external or unsafe SVG resource.");
        el.removeAttribute(name);
        continue;
      }
    }
  }
  // A second pass checks attributes introduced by inline styles.
  for (const el of [root, ...Array.from(root.querySelectorAll("*"))])
    for (const attr of Array.from(el.attributes))
      if (/url\s*\((?!\s*['"]?#[\w:.-]+['"]?\s*\))/i.test(attr.value)) {
        warnings.add("Blocked an invalid resource reference.");
        el.removeAttribute(attr.name);
      }
  if (prefix)
    for (const el of [root, ...Array.from(root.querySelectorAll("*"))])
      for (const attr of Array.from(el.attributes)) {
        if (attr.name === "id") el.setAttribute("id", prefix + attr.value);
        else if (attr.name === "href" || attr.name === "xlink:href")
          el.setAttribute(attr.name, "#" + prefix + attr.value.slice(1));
        else if (attr.value.includes("url("))
          el.setAttribute(
            attr.name,
            attr.value.replace(
              /url\(\s*['"]?#([\w:.-]+)['"]?\s*\)/g,
              `url(#${prefix}$1)`,
            ),
          );
      }
  for (const u of Array.from(root.querySelectorAll("use"))) {
    const id = (
      u.getAttribute("href") ||
      u.getAttribute("xlink:href") ||
      ""
    ).slice(1);
    const target = Array.from(root.querySelectorAll("[id]")).find(
      (x) => x.id === id,
    );
    if (
      !target ||
      target.contains(u) ||
      target.querySelector("use") ||
      target.localName === "use"
    ) {
      warnings.add("Removed recursive or unresolved <use>.");
      u.remove();
    }
  }
  return { root, warnings: [...warnings] };
}
export function straightNodes(
  el: Element,
): { nodes: Point[]; closed: boolean } | null {
  const n = (a: string) => Number(el.getAttribute(a) || 0);
  if (el.localName === "line")
    return {
      nodes: [
        { x: n("x1"), y: n("y1") },
        { x: n("x2"), y: n("y2") },
      ],
      closed: false,
    };
  if (el.localName === "polyline" || el.localName === "polygon") {
    const nums =
      (el.getAttribute("points") || "")
        .match(/[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)
        ?.map(Number) || [];
    return {
      nodes: Array.from({ length: nums.length / 2 }, (_, i) => ({
        x: nums[i * 2],
        y: nums[i * 2 + 1],
      })),
      closed: el.localName === "polygon",
    };
  }
  if (el.localName !== "path") return null;
  const d = el.getAttribute("d") || "";
  if (/[a-z]/i.test(d.replace(/e[-+]?\d+/gi, "").replace(/[mlhvz]/gi, "")))
    return null;
  const tokens =
    d.match(/[MLHVZmlhvz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi) || [];
  let k = 0,
    cmd = "",
    p: Point = { x: 0, y: 0 },
    closed = false;
  const nodes: Point[] = [];
  while (k < tokens.length) {
    if (/[MLHVZ]/i.test(tokens[k])) {
      cmd = tokens[k++];
      if (cmd.toUpperCase() === "Z") {
        closed = true;
        if (k < tokens.length) return null;
        break;
      }
      if (cmd.toUpperCase() === "M" && nodes.length) return null;
    }
    const relative = cmd === cmd.toLowerCase(),
      c = cmd.toUpperCase();
    if (!["M", "L", "H", "V"].includes(c)) return null;
    const a = Number(tokens[k++]);
    if (!Number.isFinite(a)) return null;
    if (c === "H") p = { x: a + (relative ? p.x : 0), y: p.y };
    else if (c === "V") p = { x: p.x, y: a + (relative ? p.y : 0) };
    else {
      const b = Number(tokens[k++]);
      if (!Number.isFinite(b)) return null;
      p = { x: a + (relative ? p.x : 0), y: b + (relative ? p.y : 0) };
    }
    nodes.push({ ...p });
    if (c === "M") cmd = relative ? "l" : "L";
  }
  return nodes.length ? { nodes, closed } : null;
}
export function updateVectorNode(
  item: RectItem,
  index: number,
  world: Point,
): RectItem {
  const i = structuredClone(item);
  if (!i.nodes || !i.sourceBox) return i;
  const b = i.sourceBox;
  const m = new DOMMatrix()
    .translate(i.x, i.y)
    .rotate(i.rotation)
    .scale(i.w / (b.w || 1), i.h / (b.h || 1))
    .translate(-b.x, -b.y)
    .multiply(new DOMMatrix(i.nodeMatrix));
  const q = new DOMPoint(world.x, world.y).matrixTransform(m.inverse());
  i.nodes[index] = { x: q.x, y: q.y };
  const { root } = sanitizeSvg(`<svg xmlns="${NS}">${i.svg}</svg>`);
  const el =
    root.querySelector("[data-never]") ||
    root.querySelector("path,line,polyline,polygon");
  if (!el) return i;
  const path = document.createElementNS(NS, "path");
  for (const attr of Array.from(el.attributes))
    if (!["d", "points", "x1", "x2", "y1", "y2"].includes(attr.name))
      path.setAttribute(attr.name, attr.value);
  path.setAttribute(
    "d",
    i.nodes.map((p, j) => `${j ? "L" : "M"} ${p.x} ${p.y}`).join(" ") +
      (i.closed ? " Z" : ""),
  );
  el.replaceWith(path);
  i.svg = root.innerHTML;
  return i;
}
export function vectorNodeWorld(i: RectItem, p: Point): Point {
  const b = i.sourceBox!;
  const m = new DOMMatrix()
    .translate(i.x, i.y)
    .rotate(i.rotation)
    .scale(i.w / (b.w || 1), i.h / (b.h || 1))
    .translate(-b.x, -b.y)
    .multiply(new DOMMatrix(i.nodeMatrix));
  const q = new DOMPoint(p.x, p.y).matrixTransform(m);
  return { x: q.x, y: q.y };
}
export async function importSvg(
  text: string,
  name: string,
): Promise<{
  items: RectItem[];
  defs: string;
  warnings: string[];
  viewBox: Box;
}> {
  const prefix = "i" + uid().slice(0, 8) + "_";
  const { root, warnings } = sanitizeSvg(text, prefix);
  const vb = (root.getAttribute("viewBox") || "")
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const viewBox = {
    x: vb[0] || 0,
    y: vb[1] || 0,
    w: vb[2] || parseFloat(root.getAttribute("width") || "800"),
    h: vb[3] || parseFloat(root.getAttribute("height") || "600"),
  };
  const defs = Array.from(root.querySelectorAll("defs"))
    .map((d) => d.innerHTML)
    .join("");
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("width", String(viewBox.w));
  svg.setAttribute("height", String(viewBox.h));
  svg.style.cssText =
    "position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none";
  const probe = document.createElementNS(NS, "g");
  const defsEl = document.createElementNS(NS, "defs");
  defsEl.innerHTML = defs;
  svg.append(defsEl, probe);
  document.body.append(svg);
  const items: RectItem[] = [];
  const serializer = new XMLSerializer();
  function walk(el: Element, ancestors: Element[]) {
    if (
      el.localName === "defs" ||
      el.localName === "title" ||
      el.localName === "desc"
    )
      return;
    if (el.localName === "g" || el.localName === "svg") {
      if (el !== root && el.localName === "svg")
        warnings.push(
          "Nested SVG viewports are flattened; verify their appearance.",
        );
      if (el.getAttribute("opacity") && el.children.length > 1)
        warnings.push("Group opacity is applied per element after flattening.");
      for (const child of el.children) walk(child, [...ancestors, el]);
      return;
    }
    if (!shapeTags.has(el.localName)) return;
    let content = el.cloneNode(true) as Element;
    for (const ancestor of [...ancestors].reverse()) {
      const wrapper = document.createElementNS(NS, "g");
      for (const a of Array.from(ancestor.attributes))
        if (
          !["width", "height", "viewBox", "xmlns", "version", "id"].includes(
            a.name,
          )
        )
          wrapper.setAttribute(a.name, a.value);
      wrapper.append(content);
      content = wrapper;
    }
    probe.replaceChildren(document.importNode(content, true));
    try {
      const b = probe.getBBox();
      const box = { x: b.x, y: b.y, w: b.width, h: b.height };
      const geometry = probe.querySelector(el.localName) as SVGGraphicsElement;
      const m = geometry.getCTM();
      const nodes = straightNodes(el);
      items.push({
        id: uid(),
        type: "vector",
        name:
          el.id.replace(prefix, "") || `${el.localName} ${items.length + 1}`,
        x: b.x,
        y: b.y,
        w: b.width || 0.001,
        h: b.height || 0.001,
        rotation: 0,
        sourceBox: { ...box, w: b.width || 0.001, h: b.height || 0.001 },
        svg: serializer.serializeToString(content),
        ...(nodes
          ? {
              ...nodes,
              nodeMatrix: m
                ? [m.a, m.b, m.c, m.d, m.e, m.f]
                : [1, 0, 0, 1, 0, 0],
            }
          : {}),
      });
    } catch {
      warnings.push(`Could not import ${el.localName} ${el.id}.`);
    }
  }
  try {
    walk(root, []);
  } finally {
    svg.remove();
  }
  if (!items.length) throw Error("No supported visible vector elements found.");
  return { items, defs, warnings: [...new Set(warnings)], viewBox };
}
export function safeOpenProject(text: string): {
  plan: Plan;
  warnings: string[];
} {
  const plan = parseProject(text),
    warnings: string[] = [];
  const clean = (s: string) => {
    const r = sanitizeSvg(`<svg xmlns="${NS}">${s}</svg>`);
    warnings.push(...r.warnings);
    return r.root.innerHTML;
  };
  plan.defs = clean(`<defs>${plan.defs}</defs>`).replace(
    /^<defs[^>]*>|<\/defs>$/g,
    "",
  );
  function walk(items: Plan["items"]) {
    for (const i of items)
      if ("rotation" in i) {
        if (i.svg) i.svg = clean(i.svg);
        if (i.children) walk(i.children);
      }
  }
  walk(plan.items);
  return { plan, warnings: [...new Set(warnings)] };
}
export function freshImportedPlan(name: string): Plan {
  const p = emptyPlan();
  p.name = name.replace(/\.svg$/i, "");
  p.calibration = {
    calibrated: false,
    imported: true,
    factor: 1,
    source: name,
  };
  return p;
}
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
  const defs = element.querySelector("defs[data-export]");
  if (defs) svg.append(defs.cloneNode(true));
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
