import type { Box } from "./model";

export type SheetDrawing = {
  title: string;
  bounds: Box;
  /** Architectural SVG children. The coordinate unit is one centimeter. */
  markup: string;
  legend?: string[];
  legendSwatches?: {
    index: number;
    fill: string;
    stroke: string;
    dashed?: boolean;
  }[];
};
export type SheetOptions = {
  paper: "A4" | "A3";
  orientation: "portrait" | "landscape";
  scale: 50 | 100 | 200 | 500;
  name: string;
};
export const defaultSheetOptions: Omit<SheetOptions, "name"> = {
  paper: "A4",
  orientation: "landscape",
  scale: 100,
};

export function layoutSheet(drawing: SheetDrawing, options: SheetOptions) {
  const [short, long] = options.paper === "A4" ? [210, 297] : [297, 420];
  const [width, height] =
    options.orientation === "portrait" ? [short, long] : [long, short];
  const margin = 10;
  const footerHeight = 25 + (drawing.legend?.length ?? 0) * 5;
  const contentHeight = height - margin * 2 - footerHeight;
  const mmPerCm = 10 / options.scale;
  const w = drawing.bounds.w * mmPerCm;
  const h = drawing.bounds.h * mmPerCm;
  if (w <= 0 || h <= 0 || !Number.isFinite(w + h))
    throw Error("The drawing has no printable extent.");
  if (w > width - margin * 2 || h > contentHeight)
    throw Error(
      `The drawing needs ${w.toFixed(1)} × ${h.toFixed(1)} mm at 1:${options.scale}. Choose larger paper, a different orientation, or a higher scale denominator.`,
    );

  const barMeters =
    options.scale === 500
      ? 20
      : options.scale === 200
        ? 10
        : options.scale === 100
          ? 5
          : 2;
  return {
    width,
    height,
    margin,
    x: (width - w) / 2,
    y: margin + (contentHeight - h) / 2,
    w,
    h,
    footer: height - margin - footerHeight,
    barMeters,
    barWidth: barMeters * 100 * mmPerCm,
  };
}

function escapeXml(text: string) {
  return text.replace(
    /[&<>"']/g,
    (char) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&apos;",
      })[char]!,
  );
}

function sheetArtwork(drawing: SheetDrawing, width: number, height: number) {
  const { x, y, w, h } = drawing.bounds;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${w} ${h}">${drawing.markup}</svg>`;
}

export async function sheetPdf(drawing: SheetDrawing, options: SheetOptions) {
  const page = layoutSheet(drawing, options);
  const [{ jsPDF }] = await Promise.all([
    import("jspdf"),
    import("svg2pdf.js"),
  ]);
  const pdf = new jsPDF({
    unit: "mm",
    format: [page.width, page.height],
    orientation: options.orientation,
    precision: 8,
    compress: true,
  });
  const svg = new DOMParser().parseFromString(
    sheetArtwork(drawing, page.w, page.h),
    "image/svg+xml",
  ).documentElement;
  // svg2pdf paints the text stroke over the fill even when SVG requests
  // the reverse order. Retain the lettering when converting label halos.
  for (const label of svg.querySelectorAll('text[paint-order="stroke"]')) {
    label.setAttribute("stroke", "none");
  }
  await pdf.svg(svg, { x: page.x, y: page.y, width: page.w, height: page.h });
  pdf.setProperties({ title: `${options.name} - ${drawing.title}` });
  pdf.setDrawColor(65);
  pdf.setLineWidth(0.25);
  pdf.line(page.margin, page.footer, page.width - page.margin, page.footer);
  pdf.setFontSize(13);
  pdf.text(drawing.title, page.margin, page.footer + 6, {
    maxWidth: page.width - 98,
  });
  pdf.setFontSize(9);
  pdf.text(options.name, page.margin, page.footer + 12, {
    maxWidth: page.width - 98,
  });
  pdf.text(
    `1:${options.scale}   ${options.paper}   Print at 100% actual size`,
    page.width - page.margin,
    page.footer + 6,
    { align: "right" },
  );
  const barX = page.width - page.margin - page.barWidth;
  const barY = page.footer + 13;
  pdf.line(barX, barY, barX + page.barWidth, barY);
  for (const x of [barX, barX + page.barWidth / 2, barX + page.barWidth]) {
    pdf.line(x, barY - 1, x, barY + 1);
  }
  pdf.text("0", barX, barY + 5);
  pdf.text(`${page.barMeters} m`, barX + page.barWidth, barY + 5, {
    align: "right",
  });
  drawing.legend?.forEach((entry, index) => {
    const swatch = drawing.legendSwatches?.find((row) => row.index === index);
    const y = page.footer + 23 + index * 5;
    if (swatch) {
      pdf.setFillColor(swatch.fill);
      pdf.setDrawColor(swatch.stroke);
      if (swatch.dashed) pdf.setLineDashPattern([1.2, 0.7], 0);
      pdf.rect(page.margin, y - 2.6, 5, 2.5, "FD");
      pdf.setLineDashPattern([], 0);
    }
    pdf.text(entry, page.margin + (swatch ? 7 : 0), y, {
      maxWidth: page.width - page.margin * 2 - (swatch ? 7 : 0),
    });
  });
  return pdf.output("blob");
}

export function sheetPreview(drawing: SheetDrawing, options: SheetOptions) {
  const page = layoutSheet(drawing, options);
  const barX = page.width - page.margin - page.barWidth;
  const barY = page.footer + 13;
  const title = escapeXml(drawing.title);
  const name = escapeXml(options.name);
  const artwork = sheetArtwork(drawing, page.w, page.h).replace(
    "<svg ",
    `<svg x="${page.x}" y="${page.y}" `,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.width} ${page.height}" width="${page.width}mm" height="${page.height}mm">
    <rect width="100%" height="100%" fill="white"/>
    ${artwork}
    <g fill="none" stroke="#414141" stroke-width=".25">
      <path d="M ${page.margin} ${page.footer} H ${page.width - page.margin} M ${barX} ${barY} h ${page.barWidth}"/>
      ${[barX, barX + page.barWidth / 2, barX + page.barWidth].map((x) => `<path d="M ${x} ${barY - 1} v 2"/>`).join("")}
    </g>
    <g font-family="Arial, sans-serif" font-size="3.2" fill="#222">
      <text x="${page.margin}" y="${page.footer + 6}" font-size="4.6">${title}</text>
      <text x="${page.margin}" y="${page.footer + 12}">${name}</text>
      <text x="${page.width - page.margin}" y="${page.footer + 6}" text-anchor="end">1:${options.scale} · ${options.paper} · Print at 100% actual size</text>
      <text x="${barX}" y="${barY + 5}">0</text>
      <text x="${barX + page.barWidth}" y="${barY + 5}" text-anchor="end">${page.barMeters} m</text>
      ${
        drawing.legend
          ?.map((entry, i) => {
            const swatch = drawing.legendSwatches?.find(
              (row) => row.index === i,
            );
            const y = page.footer + 23 + i * 5;
            const key = swatch
              ? `<rect x="${page.margin}" y="${y - 2.6}" width="5" height="2.5" fill="${swatch.fill}" stroke="${swatch.stroke}" stroke-width=".25"${swatch.dashed ? ' stroke-dasharray="1.2 .7"' : ""}/>`
              : "";
            return `${key}<text x="${page.margin + (swatch ? 7 : 0)}" y="${y}">${escapeXml(entry)}</text>`;
          })
          .join("") ?? ""
      }
    </g>
  </svg>`;
}
