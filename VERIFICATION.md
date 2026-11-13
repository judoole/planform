# Verification - 7 November 2026

## Current implementation

Planform now uses architectural project schema v2. SVG import, raw SVG content, reference pages and vector-node editing are removed. SVG is retained for internal rendering and export. Agent interaction is through files and atomic command batches; no live MCP endpoint or in-app model is included.

## Garage exterior dimensions

- Chrome verified a garage drawn with 580 × 680 cm centerline spans and 20 cm walls. Turning on **Show exterior wall lengths** in Properties labeled all four sides, with two at 6.00 m and two at 7.00 m. Changing one wall to 40 cm updated both adjoining side labels to 7.10 m, and dragging the right wall 50 cm outward updated the top and bottom labels to 6.50 m during and after the drag. Undo restored the original readings.
- Dragged a corner on port 5173 to make a trapezoid. All four labels remained visible during the drag and read 6.10 m, 8.75 m, 0.85 m and 7.00 m. The browser SVG paths measured 610, 875, 85 and 700 cm in model coordinates. The PNG, CLI previews and reopened file showed the same labels, and undo restored the rectangular dimensions.
- Verified that open, concave and uncalibrated drawings explain the missing dimensions in Properties. Closing the loop through undo or applying calibration restored the marks with the setting still enabled. A downloaded project reopened in a fresh browser context with the setting and an independent 200.0 cm free-point dimension, which remained editable.
- Inspected all four labels in the browser and CLI PNGs. Checked the four exported browser SVG dimension paths independently against its 580 × 680 cm wall centerlines and 20 cm wall thickness. The bundled 29-object example passed CLI validation and rendered to PNG. Physical-scale PDF sheets are tracked in issue #15.
- Review verification covered near-tied contour ordering, reversed winding, nearly coincident endpoints, and rejection of duplicate walls, partitions and stubs. Chrome verified that toggling labels preserves wall-edit undo and redo, that the partition message appears in Properties, and that label bounds fall inside the downloaded SVG. The shared command engine and CLI applied `setExteriorDimensions` to a saved drawing.

## Multiple proposals

- Project schema v4 holds exactly one Existing drawing and up to ten named proposals, with stable drawing IDs and an active ID. Every nested drawing uses schema v2. The shared validator checks drawing IDs, the active reference, roles and all inactive geometry. Validated v3 files and historical share links migrate without changing their drawing data; single v1/v2 architectural files remain supported.
- The editor supports copying the active drawing or Existing, importing a new proposal, renaming, replacing, deleting and restoring proposals. Histories are created per drawing ID; replacements are undoable within the target proposal. The last ten deleted drawings and their histories can be restored within the current session. They are not serialized. Recovery uses `planform-recovery-v4` and preserves older keys.
- In-app browser checks covered creating ten proposals, disabled creation at the limit, Unicode names, importing the bundled 29-object example as a new proposal, deleting/restoring it, selecting another proposal for overlay, and reopening all drawings with the saved active ID. An Entire project share link opened a separate editable copy with all ten proposals, the active selection and source notes. Narrow and desktop layouts were inspected; physical touch devices were not tested.
- `npm test`: **77 tests passed** in nine files. Coverage includes 0/1/5/10 proposals, rejection of an eleventh, invalid inactive geometry, duplicate/missing drawing references, independent geometry/source/calibration, v3 migration, historical links, v2/v3 recovery preservation, separate undo/redo, deletion restoration, replacement failures and targeted CLI operations. A targeted CLI edit keeps all other drawings and the saved active ID unchanged; unknown IDs produce no output file.
- `npm run build` and the required Prettier check passed. The example passed CLI validation, PNG rendering, command application and reopening (29 objects before, 30 after). Project and share size limits remain 15 MB and 64 KiB/8,000 URL characters. New v4 saves require a current Planform client. No deployment or Git push was performed.

## Plan comparison

- Chrome verified duplicating the example as Proposed, moving a wall, switching without changing pan or zoom, canceling a drag by switching, and undoing and redoing the move in Proposed alone. Overlay geometry was visible and could not be selected.
- The browser applied an AI command only to Proposed. The downloaded project and browser recovery restored both drawings and the active version. SVG and PNG exports contained the active drawing, and the share link decoded to its editable snapshot. Existing v2 recovery data remained intact.
- Toolbar controls fit at viewport widths from 320 to 1320 px. The version buttons also worked with keyboard activation at 320 px.
- Chrome opened two separate files as Existing and Proposed, preserved the camera when loading Proposed, and verified that replacing Proposed is undoable. A two-plan project selected as Proposed was rejected without changing either drawing.
- The test suite covers v1 and v2 compatibility, repeated IDs across versions, separate geometry, validation of inactive openings, and active version targeting in the CLI. The bundled example also passed CLI validation, PNG rendering, command application and reopening.

## Automatic room areas update

- `npm test`: **48 tests passed** in five files, including 17 room geometry/presentation tests. New coverage includes inner wall faces, varying thickness, open/degenerate walls, shared and crossing dividers, disconnected rooms, triangles, concave rooms, nested enclosures and wall islands, duplicate/overlapping walls, arbitrary rotations/translations, calibration, history, reopening, uncalibrated display and export labels.
- Browser check before updating the base, on the narrow layout: drawing a 400 × 400 cm room with 20 cm walls displayed **14.44 m²** on the canvas and in the Properties room/total rows. Changing one wall to 40 cm updated both rows to **14.06 m²**; Undo restored **14.44 m²**. The Properties drawer and in-room label remained readable.
- Reapplied the room-area changes on `origin/main` commit `4337fbb`, preserving schema v2, the AI drawing workflow and legacy recovery. Browser verification on this base showed the recovered 400 × 400 cm room with its **14.44 m²** canvas/Properties area.
- Room boundaries use architectural wall footprints. Round corner fills use 64-segment circles; areas are displayed to two decimals in m² after calibration.
- Room geometry is derived and is not added to the saved project schema. Browser exports and agent CLI SVG/PNG previews include the same room labels. The CLI example validated and rendered successfully; its three room labels were visually inspected in the PNG preview. Geometry analysis failures leave the editor usable and show a message in Room areas.

## Automated checks

- `npm test`: **48 tests passed** in five files.
- `npm run build`: TypeScript (including the CLI) and production build passed. Approximately 476 kB JavaScript / 150 kB gzip, 20 kB CSS / 5 kB gzip.
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

## Share link verification

- All 52 tests pass, including snapshot round trips with source notes and Unicode, relationship validation, truncated and unsupported links, and size limits. The production build and formatting checks pass.
- In the in-app browser, shared the bundled 29-object example, copied the URL and pasted it back to confirm it matched. The URL opened the full example and its source notes in another tab. Edited the shared copy, then returned to the local editor and confirmed its separate draft was intact.
- Navigated to a truncated link in the same tab. Planform showed an error and offered to return to the local editor, which still had its draft.

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
