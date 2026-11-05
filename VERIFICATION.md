# Verification - 5 November 2026

## Current implementation

Planform now uses architectural project schema v2. SVG import, raw SVG content, reference pages and vector-node editing are removed. SVG is retained for internal rendering and export. Agent interaction is through files and atomic command batches; no live MCP endpoint or in-app model is included.

## Automated checks

- `npm test`: **31 tests passed** in four files.
- `npm run build`: TypeScript (including the CLI) and production build passed. Approximately 443 kB JavaScript / 138 kB gzip, 20 kB CSS / 5 kB gzip.
- Shared contract coverage: metadata defaults without input mutation; full-precision round trips; example project; source/evidence persistence; invalid units/types/fields; non-finite numbers; zero-length walls; duplicate nested IDs; unsupported group contents; group-depth limits; architectural v1 migration; explicit rejection of legacy SVG projects.
- Relationship/command coverage: orphaned, out-of-wall and overlapping openings; physical opening offsets; atomic failure; shared corners; corrections within one transaction; explicit cascading deletion; locks on openings and connected walls; missing targets; forbidden structural updates.
- CLI integration: validate JSON, render a PNG, apply the example batch, reopen the result, and verify invalid input produces machine-readable errors with no output file.
- Preview checks: deterministic SVG, valid XML, escaped text, complete object count, no scripts, editing hit targets, selection or grid.
- Retained editor checks: geometry/projection, shared corners, manual opening normalization, snapping, duplication, groups, calibration, undo/redo, unchanged-object identity, door swing bounds, zoom/pinch math and numeric precision.

## Browser verification

Tested in Chrome against the local Vite development build using actual controls.

1. Opened **AI drawings**, pasted a synthetic eight-object project, validated it and inspected the generated preview and estimate/source notices.
2. Opened the project. The editor displayed eight architectural objects and its source notes.
3. Submitted a batch making a door wider than its host wall. Validation identified `/items/4/width` and object `entry`; Apply remained disabled and the current drawing stayed unchanged.
4. Applied a valid two-operation batch moving the sofa and adding a window. The editor showed nine objects. One Undo restored eight objects; Redo restored nine.
5. Used **Try the example drawing**, validated all 29 objects and saw its source/estimate notices.
6. Opened the bundled example JSON using the native file chooser, validated it and loaded all 29 objects. The browser extension's automated upload helper required an unavailable permission, so the native macOS picker was used successfully without changing extension settings.
7. Inspected the AI dialog layout and captured `work/ai-drawings-browser.jpg` showing the loaded example and the AI drawings control. The sample is explicitly illustrative.

Earlier browser verification in repository history covered manual drawing, numeric editing, export, responsive layouts and touch emulation. Those observations are historical; they are not claimed as new full regression passes. Physical touch devices and every responsive breakpoint were not re-tested for this change.

## Local PDF reconstruction trial

Used the original local reference PDF from `~/Desktop/Plantegning-venstre/`. Rendered its single page using Poppler and inspected it alongside extracted text. The private source PDF and derived house layout are not included in the public example or shipped production assets.

- Produced `work/house-reconstruction.planform.json`: **65 editable objects** (32 walls, 10 doors, 11 windows, 3 simplified stairs, 9 labels).
- Strict validation and PNG generation passed. Compared the rendered draft with the source; corrected door orientation and an annotation placement after visual inspection.
- The trace preserves the main room/corridor arrangement and opening layout approximately. It is not a measured reconstruction or a quantified accuracy benchmark.
- No reliable real-world dimension was established. The file is **uncalibrated** and every object is marked estimated. A nominal mapping of 1 pixel in the 1800-pixel source rendering to 1 provisional centimeter preserves proportions only. The printed A3/1:100 label was not treated as proof of scale.
- Stairs are simplified. Terrace boundaries/railings, small columns, fine construction details and some entry recess detail are omitted and listed in `source.notes`. Room names A-D are inferred navigation labels.
- `work/house-reconstruction.png` is the inspected latest preview. A real dimension is needed before calibration or dimensional use. Correct stair/column/terrace representation would require additional model support or further manual reconstruction.

## Persistence and remaining limits

- Architectural v1 files without SVG references migrate to v2; legacy SVG-bearing files are rejected clearly, never partially loaded. The old browser recovery key is not overwritten; new recovery uses `planform-recovery-v2`.
- Strict validation covers structure and supported geometry relationships, not building feasibility or construction accuracy.
- Shared corners still use equal coordinates. T-junction splitting is documented but not automated. Rooms have no persistent identity; dimensions remain independent annotations.
- Manual wall edits retain the existing opening-fit behavior; strict agent imports and batches reject conflicts instead of repairing geometry.
- No hosted deployment, Git push or external model call was performed. The PDF trial stayed local.
