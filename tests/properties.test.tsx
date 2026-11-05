import { it, expect } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { NumberField } from "../src/Properties";
it("does not round stored precision when a property field is focused and blurred without editing", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const changes: number[] = [];
  await act(async () => {
    root.render(
      <NumberField
        label="Coordinate"
        value={123.456789012345}
        onChange={(v) => changes.push(v)}
      />,
    );
  });
  const input = host.querySelector("input")!;
  await act(async () => {
    input.focus();
    input.blur();
  });
  expect(changes).toEqual([]);
  await act(async () => root.unmount());
  host.remove();
});
