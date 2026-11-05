# Working with Planform

For **creating or editing a floor plan**, read `public/agent/drawing-guide.md` and use the project/command schemas alongside it. Return editable architectural `.planform.json`, never arbitrary SVG paths. Keep stable IDs, record estimated measurements, validate, render a PNG and inspect it against the source. Do not edit application source code just to create a drawing.

```sh
npm run plan -- validate drawing.planform.json
npm run plan -- render drawing.planform.json --out preview.png
npm run plan -- apply drawing.planform.json edits.json --out revised.planform.json
```

For **application changes**, keep the browser and CLI on the same schema, relationship validator, command engine and architectural renderer. Do not normalize/repair agent input silently. Preserve legacy recovery data. Validate with `npm test`, `npm run build` and `npx prettier --check src tests scripts public/agent examples AGENTS.md README.md VERIFICATION.md`. Run the agent CLI against the example when changing its contracts. Use browser checks for UI behavior.

The current integration is file/command based; no live MCP server or built-in PDF interpreter exists. Do not claim real-house reconstruction accuracy from the synthetic example. Project schema v2 is in `public/agent/planform.schema.json`; command schema v1 is in `public/agent/commands.schema.json`.
