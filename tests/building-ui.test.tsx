import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import BuildingSettingsPanel from "../src/BuildingSettingsPanel";
import { emptyPlan, type Plan } from "../src/model";
import { DEFAULT_WALL_HEIGHT } from "../src/building";

it("edits the floor default and explicitly removes a roof", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let plan = emptyPlan();
  function update(building: Plan["building"]) {
    plan = { ...plan, building };
    render();
  }
  function render() {
    root.render(<BuildingSettingsPanel plan={plan} onChange={update} />);
  }
  try {
    await act(async () => render());
    const field = container.querySelector<HTMLInputElement>(
      '[aria-label="Default wall height"]',
    )!;
    expect(field.value).toBe(String(DEFAULT_WALL_HEIGHT));
    const select = container.querySelector<HTMLSelectElement>("select")!;
    await act(async () => {
      select.value = "shed";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(plan.building?.roof?.type).toBe("shed");
    expect(
      container.querySelector('[aria-label="Uphill direction"]'),
    ).toBeTruthy();
    await act(async () => {
      select.value = "";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(plan.building?.roof).toBeUndefined();
    expect(container.querySelector('[aria-label="Roof pitch"]')).toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
