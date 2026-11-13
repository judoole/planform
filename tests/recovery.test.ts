import { afterEach, expect, it, vi } from "vitest";
import { emptyPlan, serialize } from "../src/model";
import { readRecovery, RECOVERY_LIMIT, saveRecovery } from "../src/recovery";

const drawing = (name: string) => ({ ...emptyPlan(), name });
const historyKey = "planform-recovery-history";

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

it("reads the last valid recovery across corrupt history and all legacy keys", () => {
  const previous = serialize({ ...drawing("Previous"), version: 1 } as never);
  localStorage.setItem("planform-recovery-v1", previous);
  localStorage.setItem("planform-recovery-v4", "{invalid}");
  localStorage.setItem(
    historyKey,
    JSON.stringify([null, { savedAt: 99, project: {} }]),
  );
  expect(readRecovery(localStorage)).toEqual([
    { savedAt: null, project: drawing("Previous") },
  ]);
  saveRecovery(localStorage, drawing("Latest"));
  expect(readRecovery(localStorage).map(({ project }) => project.name)).toEqual(
    ["Latest", "Previous"],
  );
  expect(localStorage.getItem("planform-recovery-v4")).toBe("{invalid}");
  expect(localStorage.getItem("planform-recovery-v1")).toBe(previous);
});

it("bounds retention and keeps the latest version after restoring an earlier one", () => {
  for (let index = 0; index <= RECOVERY_LIMIT; index++)
    saveRecovery(localStorage, drawing(`Revision ${index}`));
  const revisions = readRecovery(localStorage);
  expect(revisions).toHaveLength(RECOVERY_LIMIT);
  expect(revisions[0].project.name).toBe(`Revision ${RECOVERY_LIMIT}`);
  expect(revisions[0].savedAt).toEqual(expect.any(Number));
  expect(revisions.at(-1)?.project.name).toBe("Revision 1");
  saveRecovery(localStorage, revisions[2].project);
  expect(
    readRecovery(localStorage)
      .map(({ project }) => project.name)
      .slice(0, 2),
  ).toEqual([`Revision ${RECOVERY_LIMIT - 2}`, `Revision ${RECOVERY_LIMIT}`]);
});

it("can prune old snapshots under quota pressure and preserves the last successful write if quota is still unavailable", () => {
  saveRecovery(localStorage, drawing("First"));
  saveRecovery(localStorage, drawing("Second"));
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (
    this: Storage,
    key,
    contents,
  ) {
    if (JSON.parse(contents).length > 2)
      throw new DOMException("Storage quota exceeded", "QuotaExceededError");
    original.call(this, key, contents);
  });
  saveRecovery(localStorage, drawing("Third"));
  const persisted = localStorage.getItem(historyKey);
  expect(readRecovery(localStorage).map(({ project }) => project.name)).toEqual(
    ["Third", "Second"],
  );
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage quota exceeded", "QuotaExceededError");
  });
  expect(() => saveRecovery(localStorage, drawing("Fourth"))).toThrow(
    "Storage quota exceeded",
  );
  expect(localStorage.getItem(historyKey)).toBe(persisted);
});
