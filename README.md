# Planform

A private, browser-based 2D editor for one-floor renovation planning. React + TypeScript, native SVG rendering, Vite; no backend, account, remote fonts or runtime service.

## Run and build

Use Node.js **22.12+, 24+, or 26+** (the test runner requires a supported even-numbered Node release).

```sh
cd /Users/judoole/Code/oc/planform
npm ci
npm run dev
```

Open the printed localhost URL, normally `http://127.0.0.1:5173`. A local server is required; opening `index.html` directly from Finder is not supported.

```sh
npm test                 # 20 geometry, persistence, safety and precision tests
npm run build           # TypeScript check + static production build in dist/
npm run preview         # serve the production build, normally port 4173
npm audit               # dependency audit
npx prettier --check src tests
```

Serve `dist/` on any ordinary static web host. There are no server-side routes or secrets. This repository has not been pushed or deployed.

## First drawing

- Start empty with **New**. Choose **Wall**, click successive connected corners, then **Finish** or **Cancel**. **Room** creates four connected walls with one drag.
- Select a wall to enter exact length, thickness, angle and endpoints. Shared corners move together, including when dragging a wall or changing an endpoint numerically. Joins use a simple rounded corner fill.
- Choose **Door** or **Window** and click an architectural wall. Edit width and distance from its start in Properties; flip a door's hinge or swing with the visible buttons.
- Openings retain a relative position on their host wall. Their physical width remains constant when the wall length changes, as long as it fits. When necessary they move/shrink into a free span in drawing order. Openings with less than 5 cm available are removed. Wall deletion also deletes its openings. Undo restores the complete edit.
- Place stairs and choose furniture from its tool dropdown: sofa, table, chair, bed, cabinet, kitchen counter, toilet or shower. Set position, size, rotation and stair step count in Properties. Symbols have resize and rotation handles.
- Use **Measure** for a point-to-point reading or **Dimension** for a persistent annotation. **Label** adds editable text. Dimensions have independent endpoints; they are not attached to walls.

## Existing SVG drawings

Use **Import SVG**. Each supported vector remains editable; curves stay curves, and path order, fills, strokes and white cover shapes are retained. A white page sits behind the imported drawing. The supplied `plantegning-venstre.svg` imports as all **2,658 individual paths** without unsupported-feature warnings.

Imported units are deliberately **uncalibrated**. The source's 1:100 paper marking is not treated as a real-world conversion. Click **Calibrate scale**, select two points with a known real distance, enter centimeters, and apply. Calibration rescales the **entire document**, including any objects already added. Import first, calibrate, then add architectural objects. Importing another SVG marks the document uncalibrated again.

For dense drawings, use Objects search (for example `path0009`), box selection, Shift-click, or the overlapping-object picker. Lock reference vectors from Objects. A selected straight path, line, polyline or polygon offers **Edit straight nodes**. Simple contiguous M/L/H/V/Z paths support endpoint dragging. Curves and compound subpaths support object transforms, but do not expose curve control points.

Select multiple vectors, furniture, stairs, labels or groups and use **Group** in Properties. **Ungroup** preserves transforms. Grouping walls, openings and dimensions is intentionally excluded to preserve their architectural relationships. Ungrouping a non-uniformly scaled group with rotated children is blocked with an explanation when it would require shear; restore uniform scaling first.

SVG is treated as untrusted input. The importer uses a tag/attribute/style allowlist, blocks scripts, event handlers, foreign content and external resources, prefixes IDs, and reports removed content. Reopened project geometry passes through the same sanitizer. Common shapes, group transforms, inline paint styles, local definitions, gradients, masks and clipping are retained. CSS style blocks, filters, images, patterns and other unsupported tags/attributes are removed and reported. Nested SVG viewport flattening and per-element group opacity are reported as fidelity limitations. Not every SVG authoring feature is supported.

## Navigation and editing

All core actions have visible controls. On narrow windows Properties and Objects live in the drawer opened by the sliders button; project files are in the top-right menu. The palette scrolls on short screens.

- Select and drag to move; use **Box select** or Shift-click for multiple objects. Use Properties for exact numbers.
- **Pan** makes navigation explicit. Scroll/trackpad gestures pan; Ctrl/Command + scroll zooms around the pointer. Zoom buttons and Fit are always visible. Touch uses one pointer for the active tool and two pointers for pinch/pan navigation. A pinch cancels an active edit before navigating.
- Snap toggles grid, endpoint and axis-alignment snapping. Grid spacing is adjustable in document Properties. Large/small zoom levels adapt the displayed grid density without changing the configured snap spacing.
- Copy/paste uses an editor-local clipboard. Duplicate, delete, group, lock, undo and redo are available in the interface. A drag is one history entry; cancelled gestures revert. History contains up to 60 edits and is not persisted.
- Shortcuts: V select, B box, H pan, W wall, D door, F furniture, M measure, T label, 0 fit, Escape cancel, Delete remove; Command/Ctrl Z undo, Shift Z or Y redo, C/V copy/paste, D duplicate, S save, O open, A select all. Text, number and select fields keep normal typing behavior.

## Editable project format

**Save project** downloads `.planform.json`; **Open** uses the standard browser file picker. The versioned JSON is self-contained: full-precision centimeter coordinates, ordered embedded sanitized SVG geometry/definitions, original vector coordinate bases, node transforms, groups, walls, opening host IDs, symbols, dimensions, text, page bounds, grid and calibration. It has no dependency on original local file paths. Future incompatible versions are rejected clearly.

Numbers are displayed to three decimals in Properties but are only replaced after an actual edit, avoiding precision drift from merely focusing a field. Camera transforms never change model coordinates.

Browser storage holds best-effort recovery of the latest document, restored on load. It can fail when storage is unavailable or full. Downloaded project files work independently of storage. Camera position, selection, tool, clipboard and undo history are session state, not project contents.

**Export** downloads SVG or PNG of the complete drawing on white, without editing controls, the snap grid or selection. PNG is limited to a 4096-pixel longest edge. SVG keeps its vectors. File imports are limited to 15 MB; projects to 50,000 objects and 15 nested group levels.

## Code layout

- `src/model.ts`: typed document, pure geometry, constraints, calibration, history and project validation.
- `src/coordinates.ts`: screen/world and pinch/zoom transforms.
- `src/svg.ts`: SVG sanitization/import, straight-node editing, file downloads and exports.
- `src/Drawing.tsx`: vector and architectural SVG rendering.
- `src/Canvas.tsx`: pointer gestures, snapping feedback and selection handles.
- `src/Properties.tsx`: numeric/object editors.
- `src/App.tsx`: editor shell, document lifecycle, history commands, menus and dialogs.

See `VERIFICATION.md` for tested workflows and remaining verification limits.
