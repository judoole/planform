import type { Project } from "./project";
import {
  checkJsonSize,
  readProjectFile,
  validateProjectFile,
} from "./validation";

const HISTORY_KEY = "planform-recovery-history";
const LEGACY_KEYS = [4, 3, 2, 1].map(
  (version) => `planform-recovery-v${version}`,
);
export const RECOVERY_LIMIT = 8;

export type RecoveryRevision = {
  savedAt: number | null;
  project: Project;
};

function readHistory(storage: Storage): RecoveryRevision[] {
  const contents = storage.getItem(HISTORY_KEY);
  if (!contents) return [];
  let entries: unknown;
  try {
    entries = JSON.parse(contents);
  } catch {
    return [];
  }
  if (!Array.isArray(entries)) return [];
  return entries.slice(0, RECOVERY_LIMIT).flatMap((entry) => {
    try {
      const { savedAt, project } = entry;
      if (
        typeof savedAt !== "number" ||
        !Number.isFinite(new Date(savedAt).getTime())
      )
        return [];
      return [{ savedAt, project: validateProjectFile(project) }];
    } catch {
      return [];
    }
  });
}

export function readRecovery(storage: Storage): RecoveryRevision[] {
  const history = readHistory(storage);
  const seen = new Set(history.map(({ project }) => JSON.stringify(project)));
  for (const key of LEGACY_KEYS) {
    const contents = storage.getItem(key);
    if (!contents) continue;
    try {
      const project = readProjectFile(contents);
      const fingerprint = JSON.stringify(project);
      if (seen.has(fingerprint)) continue;
      seen.add(fingerprint);
      history.push({ savedAt: null, project });
    } catch {
      // Keep legacy data intact and try the next recovery.
    }
  }
  return history;
}

export function saveRecovery(storage: Storage, project: Project) {
  const snapshot = validateProjectFile(project);
  const fingerprint = JSON.stringify(snapshot);
  checkJsonSize(fingerprint);
  const history = readHistory(storage);
  const retained = history
    .filter(({ project }) => JSON.stringify(project) !== fingerprint)
    .slice(0, RECOVERY_LIMIT - 1);
  const next = [{ savedAt: Date.now(), project: snapshot }, ...retained];
  // A single atomic storage write preserves the previous revision on failure.
  // Trim older copies under quota pressure while retaining the last valid one.
  for (;;) {
    try {
      storage.setItem(HISTORY_KEY, JSON.stringify(next));
      return;
    } catch (error) {
      if (
        !(error instanceof DOMException) ||
        error.name !== "QuotaExceededError" ||
        next.length <= 2
      )
        throw error;
      next.pop();
    }
  }
}
