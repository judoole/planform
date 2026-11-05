# Planform

A private, browser-based 2D editor for single-floor renovation planning. Create editable architectural drawings yourself or with ChatGPT, Codex, or another agent. React + TypeScript, SVG rendering, Vite; no backend, account, remote fonts, model API key or runtime service.

## Run

Use Node.js **22.12+, 24+, or 26+** (a supported even-numbered release).

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Open the printed localhost URL, normally `http://127.0.0.1:5173`. A local server is required; opening `index.html` directly is not supported. Serve `dist/` on any ordinary static host. There are no server-side routes or secrets.

## Save and share a plan

- Planform automatically keeps the current local draft in this browser. Use **Save project** to download an editable `.planform.json` backup, and **Open** to continue from a saved file.
- Use **Share → Copy link** to send a snapshot. Anyone with the link can open and edit their own copy. Later changes require a new link. Opening a shared copy leaves the recipient’s local draft intact; they can download their copy to keep changes.
- The link contains the compressed project, including source notes, after `#`. Planform does not upload it to a server. Share it only with people you want to see the drawing. The address before `#` must point to Planform on a host recipients can access; a localhost link only works locally.
- Links support up to 8,000 URL characters and 64 KiB of uncompressed project data. Use the editable project file for larger drawings.

## Create a drawing with an agent

1. Open **AI drawings** (on narrow screens, use the project menu).
2. Copy or download the **Drawing guide**. Give it to ChatGPT/Codex with your PDF, image or description. Download the schema and example too when useful.
3. Ask for a `.planform.json` file with actual walls and attached doors/windows. Require explicit notes for estimated dimensions. The PDF is interpreted in your agent, not uploaded to Planform or converted by the app.
4. Choose the returned JSON file in AI drawings, or paste its contents. Select **Validate & preview**, inspect the result and its source notes, then **Open drawing**. The usual **Open** button also accepts project files.
5. Edit objects manually or give your saved project back to the agent for another revision. Imports are one undoable change. **Save project** downloads a complete, self-contained project.

**Try the example drawing** fills the import box with a three-room demonstration. Its dimensions are invented; it is not a surveyed house or a validated PDF reconstruction.

The portable instructions are in [public/agent/drawing-guide.md](public/agent/drawing-guide.md). The project contract is [public/agent/planform.schema.json](public/agent/planform.schema.json). Both are shipped with the production app for download. Source filename, page, unresolved assumptions and per-object measured/estimated evidence survive saving and appear in Properties. Unknown scale must be marked uncalibrated.

## Agent CLI and batch edits

Agents in this repository can validate and inspect drawings without driving the canvas:

```sh
npm run plan -- validate public/agent/example.planform.json
npm run plan -- render public/agent/example.planform.json --out preview.png
npm run plan -- render public/agent/example.planform.json --out preview.svg
npm run plan -- apply public/agent/example.planform.json examples/revise-example.commands.json --out revised.planform.json
```

The CLI returns machine-readable JSON, exits nonzero on failure, and requires a separate output file to protect its inputs. PNG previews use Sharp and the same architectural React renderer as the editor. Previews omit grid, hit targets, selection and handles; raster output has a maximum 4096-pixel edge. View the preview and compare it with the source before calling a reconstruction accurate.

Command batches use [public/agent/commands.schema.json](public/agent/commands.schema.json). Supported operations:

| Operation | Purpose                                                                             |
| --------- | ----------------------------------------------------------------------------------- |
| `add`     | Add typed architectural items with stable IDs                                       |
| `opening` | Place a door/window by host wall and center distance in centimeters                 |
| `corner`  | Move a wall endpoint and every wall sharing that coordinate                         |
| `update`  | Change object properties while preserving ID, type, endpoints and group structure   |
| `delete`  | Remove named objects; require explicit cascading to remove a wall's hosted openings |

Batches apply in order and validate the final result atomically. They respect locks and never silently shrink, reposition or discard openings. A failed batch leaves the input unchanged and produces no output project. Successful batches report changed and deleted IDs. Use **AI drawings → Edits to the current drawing** to preview and apply the same batches in the browser as one history entry.

The shared command/validation layer can be exposed through MCP later. This version does not include a live agent connection, an MCP server, an embedded model, or automatic PDF conversion. A local trial reconstructed the original house PDF as architectural objects and exposed stair/terrace limitations. It remains an approximate, uncalibrated trace; no dimensional accuracy claim is made. The private source and trial outputs are kept outside the shipped app in the Git-ignored `work/` directory.

## Format and validation

Planform v2 is architectural JSON in centimeters, with X right and Y down. Wall endpoints describe **centerlines**; openings refer to a host wall by ID and store center position as a fraction of its length. Rectangles rotate clockwise about their x/y anchor. The drawing guide specifies full conventions, door orientation and all supported objects.

A single JSON schema is used by the browser and CLI. Additional relationship checks reject duplicate IDs, zero-length walls, orphaned openings, out-of-wall openings and overlaps. Errors identify JSON paths and, for relationship failures, affected object IDs. Imports fill documented metadata defaults but never repair geometry. Schema validity alone does not establish measurement accuracy or building feasibility.

Architectural v1 files with no SVG references migrate to v2 on opening. Legacy files containing vectors, definitions or reference pages are rejected with an explanation rather than partially loaded. SVG import, arbitrary embedded markup and vector-node editing have been removed. SVG remains the internal drawing renderer and an export format. Old v1 browser recovery is preserved in its original storage key; v2 uses a separate key.

Projects are limited to 15 MB, 50,000 total objects and 15 group levels. Browser recovery is best effort and does not replace downloaded project files. Camera, selection, active tool, clipboard and the 60-entry undo history are session state.

## Automatic room areas

Enclosed architectural walls automatically produce numbered room labels with areas in **m²**. **Room areas** in Properties lists each room and the total, including while walls are selected. Draw rooms with **Room** or close a space with **Wall**; shared and intersecting dividers split rooms automatically. Areas update during wall edits and after undo/redo, calibration and reopening a project.

Areas are measured inside wall faces, excluding wall thickness and internal wall footprints. Sloping walls, concave rooms and nested enclosures are supported. Rounded shared corners use a 64-segment approximation. Doors and windows preserve room boundaries; furniture does not define rooms. Uncalibrated plans show **Set scale** until calibration supplies real-world dimensions.

Room labels are included in browser SVG/PNG exports and agent CLI previews. Rooms are derived from walls rather than saved as separate objects, so existing project files need no migration.

## Manual drawing

- **Wall** creates connected corners; **Room** creates four walls with a drag. Room is a drawing tool, not a persistent room object. Shared corners use equal endpoint coordinates; split T-junctions into wall segments when they need shared endpoint editing.
- Select walls to edit length, thickness, angle or endpoints. **Door** and **Window** attach to walls. Manual edits retain the existing fit-to-wall behavior: openings may move/shrink when space changes, and are removed when less than 5 cm remains. Deleting a wall removes its openings. Undo restores the edit. Strict agent imports/commands reject these conflicts instead.
- Place stairs, furniture, labels and dimensions. Symbols have resize and rotation handles. Dimensions have independent endpoints and are not attached to walls. Joins use simple rounded corner fills.
- Group furniture, stairs, labels or other groups. Walls, openings and dimensions cannot be grouped. Ungrouping non-uniformly scaled groups with rotated children is blocked when it would require shear.
- Use box selection, Shift-click, Objects search and the overlapping-object picker. Properties offers exact numeric editing, locking, duplication and deletion.
- Scroll to pan; Ctrl/Command + scroll zooms around the pointer. Touch uses one pointer for the active tool and two pointers for pinch/pan. Zoom and Fit controls remain visible.
- Snap covers grid, endpoints and axis alignment. Grid spacing is adjustable. Camera changes never modify model coordinates; unedited numeric fields retain stored precision.
- Shortcuts: V select, B box, H pan, W wall, D door, F furniture, M measure, T label, 0 fit, Escape cancel, Delete remove; Command/Ctrl Z undo, Shift Z/Y redo, C/V copy/paste, D duplicate, S save, O open, A select all. Copy/paste uses an editor-local clipboard.
- **Export** downloads SVG or PNG on white without editor overlays. Calibrate a provisional drawing by measuring two points and supplying the actual centimeter distance; calibration scales the entire plan.

## Code layout

- `src/model.ts`: document types, geometry, manual-edit constraints, history, serialization.
- `src/validation.ts`: shared schema validation, relationship checks, v1 migration and source warnings.
- `src/commands.ts`: strict, atomic architectural batch operations.
- `src/preview.tsx`, `scripts/planform.ts`: shared renderer and agent CLI.
- `src/AgentPanel.tsx`: guide/schema downloads, JSON file/paste import, preview and command application.
- `src/Drawing.tsx`, `src/Canvas.tsx`: architectural rendering and pointer interactions.
- `src/Properties.tsx`, `src/App.tsx`: object/source editors and editor shell.
- `src/rooms.ts`: enclosed floor detection, wall footprint subtraction, room areas and interior label placement.
- `src/exports.ts`: browser downloads and SVG/PNG exports.

See [VERIFICATION.md](VERIFICATION.md) for checks and remaining limitations.
