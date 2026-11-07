import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import App from "../src/App";
import { emptyPlan, serialize } from "../src/model";
import { activePlan, addProposal, asMultiProject } from "../src/project";
import { readProjectFile } from "../src/validation";

let host: HTMLDivElement, root: Root;
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = true;
      },
    },
    close: {
      configurable: true,
      value: function (this: HTMLDialogElement) {
        this.open = false;
      },
    },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function click(name: string) {
  const button = [...host.querySelectorAll("button")].find(
    (b) =>
      b.getAttribute("aria-label") === name ||
      b.textContent?.trim() === name ||
      b.textContent?.startsWith(name),
  );
  expect(button, name).toBeTruthy();
  await act(async () => button!.click());
}
async function select(id: string) {
  await act(async () => {
    const input = host.querySelector<HTMLSelectElement>(
      '[aria-label="Active drawing"]',
    )!;
    input.value = id;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
const selected = () =>
  host.querySelector<HTMLSelectElement>('[aria-label="Active drawing"]')!.value;

it("restores deleted proposals with their own undo history and saves every drawing", async () => {
  const initial = {
    ...emptyPlan(),
    items: [
      {
        id: "wall",
        name: "Wall",
        type: "wall" as const,
        a: { x: 0, y: 0 },
        b: { x: 400, y: 0 },
        thickness: 20,
      },
    ],
  };
  localStorage.setItem("planform-recovery-v2", serialize(initial));
  await act(async () => root.render(<App />));
  await click("New proposal");
  const first = selected();
  // The Objects panel selects the wall without depending on SVG layout in jsdom.
  await click("Objects");
  const wall = host.querySelector<HTMLButtonElement>(".object-list button")!;
  await act(async () => wall.click());
  await click("Delete");
  await click("New proposal");
  const second = selected();
  await select("existing");
  expect(host.querySelectorAll(".object-list button")).toHaveLength(1);
  await select(first);
  expect(host.querySelectorAll(".object-list button")).toHaveLength(0);
  await click("Undo");
  expect(host.querySelectorAll(".object-list button")).toHaveLength(1);
  await click("Redo");
  expect(host.querySelectorAll(".object-list button")).toHaveLength(0);
  await click("Manage proposals");
  await click("Delete active proposal");
  expect(selected()).toBe("existing");
  await click("Restore last deleted");
  expect(selected()).toBe(first);
  await click("Done");
  await click("Undo");
  expect(host.querySelectorAll(".object-list button")).toHaveLength(1);
  await select(second);
  expect(host.querySelectorAll(".object-list button")).toHaveLength(0);
  // pagehide flushes recovery immediately, like navigating away from the editor.
  await act(async () => window.dispatchEvent(new Event("pagehide")));
  const saved = readProjectFile(localStorage.getItem("planform-recovery-v4")!);
  expect(saved.version).toBe(4);
  if (saved.version !== 4) throw Error("Expected v4");
  expect(saved.drawings).toHaveLength(3);
  expect(saved.active).toBe(second);
  expect(saved.drawings.find((d) => d.id === first)!.plan.items).toHaveLength(
    1,
  );
  expect(activePlan(saved).items).toHaveLength(0);
  expect(localStorage.getItem("planform-recovery-v2")).toBe(serialize(initial));
});

it("disables creation at ten proposals and lets a deletion free a slot", async () => {
  let project = asMultiProject(emptyPlan());
  for (let i = 0; i < 10; i++) project = addProposal(project, emptyPlan());
  localStorage.setItem("planform-recovery-v4", serialize(project));
  await act(async () => root.render(<App />));
  expect(
    [...host.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "New proposal",
    )!.disabled,
  ).toBe(true);
  await click("Manage proposals");
  expect(
    [...host.querySelectorAll("button")].find(
      (b) => b.textContent === "Import new proposal",
    )!.disabled,
  ).toBe(true);
  await click("Delete active proposal");
  await click("Copy active as new proposal");
  expect(
    host.querySelectorAll('[aria-label="Active drawing"] option'),
  ).toHaveLength(11);
});

it("migrates v3 recovery and replaces only the chosen proposal as one undoable edit", async () => {
  const source = {
    ...emptyPlan(),
    items: [
      {
        id: "wall",
        name: "Wall",
        type: "wall" as const,
        a: { x: 0, y: 0 },
        b: { x: 400, y: 0 },
        thickness: 20,
      },
    ],
  };
  const legacy = {
    format: "planform" as const,
    version: 3 as const,
    name: "Renovation",
    active: "proposed" as const,
    plans: { existing: source, proposed: emptyPlan() },
  };
  localStorage.setItem("planform-recovery-v3", serialize(legacy));
  await act(async () => root.render(<App />));
  expect(selected()).toBe("proposed");
  await click("Objects");
  expect(host.querySelectorAll(".object-list button")).toHaveLength(0);
  await click("Manage proposals");
  await click("Replace active proposal from file");
  async function upload(contents: string) {
    await act(async () => {
      const input = host.querySelector<HTMLInputElement>(
        '[aria-label="Proposed drawing file"]',
      )!;
      Object.defineProperty(input, "files", {
        configurable: true,
        value: [{ size: contents.length, text: async () => contents }],
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  await upload(serialize(legacy));
  expect(host.querySelector(".proposal-manager")?.textContent).toContain(
    "multi-drawing project",
  );
  expect(selected()).toBe("proposed");
  await upload(serialize(source));
  expect(host.querySelector(".proposal-manager")).toBeNull();
  expect(host.querySelectorAll(".object-list button")).toHaveLength(1);
  await click("Undo");
  expect(host.querySelectorAll(".object-list button")).toHaveLength(0);
  await click("Redo");
  expect(host.querySelectorAll(".object-list button")).toHaveLength(1);
  await select("existing");
  expect(host.querySelectorAll(".object-list button")).toHaveLength(1);
  await act(async () => window.dispatchEvent(new Event("pagehide")));
  const saved = readProjectFile(localStorage.getItem("planform-recovery-v4")!);
  expect(saved.version).toBe(4);
  expect(localStorage.getItem("planform-recovery-v3")).toBe(serialize(legacy));
});
