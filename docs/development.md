# Development notes

## Commands

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

## Agent CLI and batch edits

Agents in this repository can validate and inspect drawings without driving the canvas:

```sh
npm run plan -- validate public/agent/example.planform.json
npm run plan -- render public/agent/example.planform.json --out preview.png
npm run plan -- render public/agent/example.planform.json --out preview.svg
npm run plan -- apply public/agent/example.planform.json examples/revise-example.commands.json --out revised.planform.json
```

The CLI returns machine-readable JSON, exits nonzero on failure, and requires a separate output file to protect its inputs. PNG previews use Sharp and the same architectural React renderer as the editor. Previews omit grid, hit targets, selection and handles; raster output has a maximum 4096-pixel edge. View the preview and compare it with the source before calling a reconstruction accurate.

Command batches use [commands.schema.json](../public/agent/commands.schema.json). Supported operations:

| Operation | Purpose                                                                             |
| --------- | ----------------------------------------------------------------------------------- |
| `add`     | Add typed architectural items with stable IDs                                       |
| `opening` | Place a door/window by host wall and center distance in centimeters                 |
| `corner`  | Move a wall endpoint and every wall sharing that coordinate                         |
| `update`  | Change object properties while preserving ID, type, endpoints and group structure   |
| `delete`  | Remove named objects; require explicit cascading to remove a wall's hosted openings |

Batches apply in order and validate the final result atomically. They respect locks and never silently shrink, reposition or discard openings. A failed batch leaves the input unchanged and produces no output project. Successful batches report changed and deleted IDs. Use **AI drawings → Edits to the current drawing** to preview and apply the same batches in the browser as one history entry. For multi-drawing projects, the CLI validates all drawings, renders the saved active drawing and applies batches to it while keeping every drawing in the output file. Add `--plan <id>` to render or edit a particular drawing, including an inactive proposal. Targeted edits preserve the saved active ID; unknown IDs fail without producing output. `validate` reports every drawing ID, name, role, object count and warnings. The browser applies batches to the selected drawing.

```sh
npm run plan -- validate project.planform.json
npm run plan -- render project.planform.json --plan proposal-id --out preview.png
npm run plan -- apply project.planform.json edits.json --plan proposal-id --out revised.planform.json
```

The shared command/validation layer can be exposed through MCP later. This version does not include a live agent connection, an MCP server, an embedded model, or automatic PDF conversion.

## Code layout

- `src/model.ts`: document types, geometry, manual-edit constraints, history, serialization.
- `src/validation.ts`: shared schema validation, relationship checks, v1 migration and source warnings.
- `src/commands.ts`: strict, atomic architectural batch operations.
- `src/preview.tsx`, `scripts/planform.ts`: shared renderer and agent CLI.
- `src/AgentPanel.tsx`: guide/schema downloads, JSON file/paste import, preview and command application.
- `src/Drawing.tsx`, `src/Canvas.tsx`: architectural rendering and pointer interactions.
- `src/Properties.tsx`, `src/App.tsx`: object/source editors and editor shell.
- `src/rooms.ts`: enclosed floor detection, wall footprint subtraction, room areas and interior label placement.
- `src/exterior.ts`: convex exterior contour and annotation bounds. `deriveExteriorContour(plan)` returns clockwise outside-face intersections in centimeters or a status explaining why the footprint is unavailable. Each edge corresponds to one wall. The contour is independent of annotation visibility and is the geometry input for the garage area and site plan features.
- `src/exports.ts`: browser downloads and SVG/PNG exports.

## Schemas and examples

The drawing schema v2 is [planform.schema.json](../public/agent/planform.schema.json), the multi-drawing project schema v4 is [project.schema.json](../public/agent/project.schema.json), the legacy two-drawing comparison schema v3 is [comparison.schema.json](../public/agent/comparison.schema.json), and command schema v1 is [commands.schema.json](../public/agent/commands.schema.json). The bundled example drawing is [example.planform.json](../public/agent/example.planform.json).
