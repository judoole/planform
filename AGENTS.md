# Working with Planform

## Branch naming

Use a consistent, descriptive branch name in `<type>/<short-kebab-case-description>` format. Common types are `feat/` for new functionality, `bugfix/` for bug fixes, `docs/` for documentation, `refactor/` for code restructuring, `test/` for test-only changes, and `chore/` for maintenance. Keep names lowercase and concise; include an issue ID when one exists, for example `feat/123-add-room-labels` or `bugfix/fix-wall-measurement`. Avoid spaces, vague names, and personal names. This follows the general guidance to identify the work by a consistent branch naming convention ([Microsoft Git branching guidance](https://learn.microsoft.com/en-us/azure/devops/repos/git/git-branching-guidance?view=azure-devops)).

For **creating or editing a floor plan**, read `public/agent/drawing-guide.md` and use the project/command schemas alongside it. Return editable architectural `.planform.json`, never arbitrary SVG paths. Keep stable IDs, record estimated measurements, validate, render a PNG and inspect it against the source. Do not edit application source code just to create a drawing.

```sh
npm run plan -- validate drawing.planform.json
npm run plan -- render drawing.planform.json --out preview.png
npm run plan -- apply drawing.planform.json edits.json --out revised.planform.json
```

For **application changes**, keep the browser and CLI on the same schema, relationship validator, command engine and architectural renderer. Do not normalize/repair agent input silently. Preserve legacy recovery data. Validate with `npm test`, `npm run build` and `npx prettier --check src tests scripts public/agent examples AGENTS.md README.md VERIFICATION.md`. Run the agent CLI against the example when changing its contracts. Use browser checks for UI behavior.

The current integration is file/command based; no live MCP server or built-in PDF interpreter exists. Do not claim real-house reconstruction accuracy from the synthetic example. The drawing schema v2 is in `public/agent/planform.schema.json`, the two-drawing comparison schema v3 is in `public/agent/comparison.schema.json`, and command schema v1 is in `public/agent/commands.schema.json`.
