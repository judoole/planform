import { cp } from "node:fs/promises";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function pdfAssets(): Plugin {
  const source = resolve("node_modules/pdfjs-dist");
  const folders = ["cmaps", "iccs", "standard_fonts", "wasm"];
  return {
    name: "planform-pdf-assets",
    apply: "build",
    async writeBundle(options) {
      const target = resolve(options.dir ?? "dist", "pdfjs");
      await Promise.all([
        cp(resolve(source, "LICENSE"), resolve(target, "LICENSE")),
        ...folders.map((folder) =>
          cp(resolve(source, folder), resolve(target, folder), {
            recursive: true,
            filter: (file) => !/quickjs|sandbox/i.test(file),
          }),
        ),
      ]);
    },
  };
}

export default defineConfig({
  base: process.env.GITHUB_ACTIONS === "true" ? "/planform/" : "/",
  plugins: [react(), pdfAssets()],
  test: { environment: "jsdom" },
});
