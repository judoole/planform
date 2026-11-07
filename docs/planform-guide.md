# Planform guide

Planform is a browser-based 2D editor for single-floor renovation planning. It runs without a backend, account, remote fonts, model API key or runtime service. Serve the built `dist/` directory from any static host.

## Run locally

Use Node.js **22.12+, 24+, or 26+** (a supported even-numbered release).

```sh
npm ci
npm run dev
```

Open the printed localhost URL, normally `http://127.0.0.1:5173`. A local server is required; opening `index.html` directly is not supported. `npm run build` creates the production site and `npm run preview` serves it locally.

## Save, open and share

Planform automatically keeps the current local draft in this browser. Use **Save project** to download an editable `.planform.json` backup, and **Open** to continue from a saved file.

Use **Share → Copy link** to send a snapshot. Anyone with the link can open and edit their own copy. Later changes require a new link. Opening a shared copy leaves the recipient’s local draft intact; they can download their copy to keep changes.

The link contains the compressed drawing, including source notes, after `#`. Planform does not upload it to a server. Share it only with people you want to see the drawing. The address before `#` must point to Planform on a host recipients can access; a localhost link only works locally. Links support up to 8,000 URL characters and 64 KiB of uncompressed project data. Use the editable project file for larger drawings.

## Compare two versions

Open your first file as **Existing**, then use **Load as proposed** to choose a second single-plan file. You can also use **Duplicate as proposed** to start from a copy of Existing. Use **Replace proposed** to load a different file later. Both versions are editable when active, and each has its own undo and redo history.

Switch between versions in the toolbar to compare from the same pan and zoom. Turn on **Overlay** to trace the inactive drawing in blue behind the active one. For separately drawn files, use the same scale and coordinate origin for the overlay to line up.

**Save project** and browser recovery retain both versions and the active version. Share links, SVG and PNG exports show the active drawing. To share both versions, send the project file.

## Draw and edit

- **Wall** creates connected corners; **Room** creates four walls with a drag. Room is a drawing tool, not a persistent room object. Shared corners use equal endpoint coordinates; split T-junctions into wall segments when they need shared endpoint editing.
- Select walls to edit length, thickness, angle or endpoints. **Door** and **Window** attach to walls. Manual edits retain the existing fit-to-wall behavior: openings may move/shrink when space changes, and are removed when less than 5 cm remains. Deleting a wall removes its openings. Undo restores the edit. Strict agent imports/commands reject these conflicts instead.
- In the **Door** tool, choose a hinged or sliding door before clicking a wall. Change an existing door's type or flip its slide direction in **Properties**.
- Place stairs, furniture, labels and dimensions. Symbols have resize and rotation handles. Dimensions have independent endpoints and are not attached to walls. Joins use simple rounded corner fills.
- Group furniture, stairs, labels or other groups. Walls, openings and dimensions cannot be grouped. Ungrouping non-uniformly scaled groups with rotated children is blocked when it would require shear.
- Use box selection, Shift-click, Objects search and the overlapping-object picker. Properties offers exact numeric editing, locking, duplication and deletion.
- Scroll to pan; Ctrl/Command + scroll zooms around the pointer. Touch uses one pointer for the active tool and two pointers for pinch/pan. Zoom and Fit controls remain visible.
- Snap covers grid, endpoints and axis alignment. Grid spacing is adjustable. Camera changes never modify model coordinates; unedited numeric fields retain stored precision.
- Shortcuts: V select, B box, H pan, W wall, D door, F furniture, M measure, T label, 0 fit, Escape cancel, Delete remove; Command/Ctrl Z undo, Shift Z/Y redo, C/V copy/paste, D duplicate, S save, O open, A select all. Copy/paste uses an editor-local clipboard.
- **Export** downloads SVG or PNG on white without editor overlays. Calibrate a provisional drawing by measuring two points and supplying the actual centimeter distance; calibration scales the entire plan.

## Room areas

Enclosed architectural walls automatically produce numbered room labels with areas in **m²**. **Room areas** in Properties lists each room and the total, including while walls are selected. Draw rooms with **Room** or close a space with **Wall**; shared and intersecting dividers split rooms automatically. Areas update during wall edits and after undo/redo, calibration and reopening a project.

Areas are measured inside wall faces, excluding wall thickness and internal wall footprints. Sloping walls, concave rooms and nested enclosures are supported. Rounded shared corners use a 64-segment approximation. Doors and windows preserve room boundaries; furniture does not define rooms. Uncalibrated plans show **Set scale** until calibration supplies real-world dimensions.

Room labels are included in browser SVG/PNG exports and agent CLI previews. Rooms are derived from walls rather than saved as separate objects, so existing project files need no migration.

## Create a drawing with an agent

1. Open **AI drawings** (on narrow screens, use the project menu).
2. Copy or download the [drawing guide](../public/agent/drawing-guide.md). Give it to ChatGPT/Codex with your PDF, image or description. Download the schema and example too when useful.
3. Ask for a `.planform.json` file with actual walls and attached doors/windows. Require explicit notes for estimated dimensions. The PDF is interpreted in your agent, not uploaded to Planform or converted by the app.
4. Choose the returned JSON file in AI drawings, or paste its contents. Select **Validate & preview**, inspect the result and its source notes, then **Open drawing**. The usual **Open** button also accepts project files.
5. Edit objects manually or give your saved project back to the agent for another revision. Imports are one undoable change. **Save project** downloads a complete, self-contained project.

**Try the example drawing** fills the import box with a three-room demonstration. Its dimensions are invented; it is not a surveyed house or a validated PDF reconstruction.

The project contract is [planform.schema.json](../public/agent/planform.schema.json). These agent files are shipped with the production app for download. Source filename, page, unresolved assumptions and per-object measured/estimated evidence survive saving and appear in Properties. Unknown scale must be marked uncalibrated.

## File format and limitations

Planform v2 is architectural JSON in centimeters, with X right and Y down. Wall endpoints describe **centerlines**; openings refer to a host wall by ID and store center position as a fraction of its length. Rectangles rotate clockwise about their x/y anchor. The drawing guide specifies full conventions, door orientation and all supported objects.

The browser and CLI share the drawing schema and the [comparison project schema](../public/agent/comparison.schema.json). Single drawings use v2. A comparison project uses v3 to store two v2 drawings and the active version. Relationship checks reject duplicate IDs within a drawing, zero-length walls, orphaned openings, out-of-wall openings and overlaps. Errors identify JSON paths and, for relationship failures, affected object IDs. Imports fill documented metadata defaults but never repair geometry. Schema validity alone does not establish measurement accuracy or building feasibility.

Architectural v1 files with no SVG references migrate to v2 on opening. Legacy files containing vectors, definitions or reference pages are rejected with an explanation rather than partially loaded. SVG import, arbitrary embedded markup and vector-node editing have been removed. SVG remains the internal drawing renderer and an export format. The editor writes recovery to a new key and can still read the original v1 and v2 keys.

Projects are limited to 15 MB per file, 50,000 objects per drawing and 15 group levels. Browser recovery is best effort and does not replace downloaded project files. Camera, overlay visibility, selection, active tool, clipboard and each version's 60-entry undo history are session state.

See [VERIFICATION.md](../VERIFICATION.md) for verification history and remaining implementation limitations.
