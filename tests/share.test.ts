// @vitest-environment node
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { expect, it } from "vitest";
import example from "../public/agent/example.planform.json";
import { parseProject } from "../src/model";
import type { ComparisonProject } from "../src/project";
import { createShareUrl, readShareHash } from "../src/share";

const address = "https://example.com/planform/";
const plan = parseProject(JSON.stringify(example));
const comparison: ComparisonProject = {
  format: "planform",
  version: 3,
  name: "Renovation",
  active: "proposed",
  plans: {
    existing: plan,
    proposed: { ...plan, items: plan.items.filter((i) => i.id !== "sofa") },
  },
};
const hashFor = (json: string) =>
  `#plan=1.${deflateSync(json).toString("base64url")}`;

it("round trips the full editable plan, including source evidence and Unicode, at a static subpath", async () => {
  const original = { ...plan, name: "Første etasje 🏠" };
  const url = new URL(await createShareUrl(original, `${address}?test=1#old`));
  expect(url.href.startsWith(`${address}#plan=1.`)).toBe(true);
  expect(await readShareHash(url.hash)).toEqual(original);
  expect(
    await createShareUrl({ ...original, name: "Revision 2" }, url.href),
  ).not.toBe(url.href);
});

it("round trips both drawings and the selected version in a comparison link", async () => {
  const url = new URL(await createShareUrl(comparison, address));
  expect(await readShareHash(url.hash)).toEqual(comparison);
});

it("rejects damaged, truncated or unsupported links", async () => {
  const hash = new URL(await createShareUrl(plan, address)).hash;
  await expect(readShareHash(hash.slice(0, -12))).rejects.toThrow();
  await expect(readShareHash("#plan=1.a%%%")).rejects.toThrow(/damaged/);
  await expect(readShareHash("#plan=2.abc")).rejects.toThrow(/version/);
});

it("applies strict relationship validation when sharing and opening a link", async () => {
  const invalid = {
    ...plan,
    items: plan.items.filter((i) => i.type !== "wall"),
  };
  await expect(createShareUrl(invalid, address)).rejects.toThrow(/hostId/);
  await expect(readShareHash(hashFor(JSON.stringify(invalid)))).rejects.toThrow(
    /hostId/,
  );
});

it("validates the inactive drawing when creating or opening a comparison link", async () => {
  const invalid = {
    ...comparison,
    plans: {
      ...comparison.plans,
      existing: { ...plan, items: plan.items.filter((i) => i.type !== "wall") },
    },
  };
  await expect(createShareUrl(invalid, address)).rejects.toThrow(
    /\/plans\/existing\/items.*hostId/,
  );
  await expect(readShareHash(hashFor(JSON.stringify(invalid)))).rejects.toThrow(
    /\/plans\/existing\/items.*hostId/,
  );
});

it("limits both link length and decompressed project size", async () => {
  const notes = Array.from({ length: 160 }, (_, i) =>
    createHash("sha256").update(String(i)).digest("base64url"),
  );
  const longUrlPlan = { ...plan, source: { file: "Example", notes } };
  await expect(createShareUrl(longUrlPlan, address)).rejects.toThrow(
    /too large/,
  );
  await expect(
    readShareHash(hashFor(JSON.stringify(longUrlPlan))),
  ).rejects.toThrow(/too long/);

  const largePlan = {
    ...plan,
    source: { file: "Example", notes: Array(7).fill("x".repeat(10_000)) },
  };
  await expect(createShareUrl(largePlan, address)).rejects.toThrow(/too large/);
  await expect(
    readShareHash(hashFor(JSON.stringify(largePlan))),
  ).rejects.toThrow(/too large/);

  const mediumPlan = {
    ...plan,
    source: { file: "Example", notes: Array(4).fill("x".repeat(10_000)) },
  };
  const largeComparison = {
    ...comparison,
    plans: { existing: mediumPlan, proposed: mediumPlan },
  };
  await expect(createShareUrl(mediumPlan, address)).resolves.toContain(
    "#plan=",
  );
  await expect(createShareUrl(largeComparison, address)).rejects.toThrow(
    /too large/,
  );
  await expect(
    readShareHash(hashFor(JSON.stringify(largeComparison))),
  ).rejects.toThrow(/too large/);
});
