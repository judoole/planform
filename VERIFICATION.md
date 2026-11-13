# Verification - 13 November 2026

## Sketch-first export

Chrome verified that an uncalibrated house exports a fit-to-page PDF directly from **Export**, with the sketch’s scale status on the page. Verified that selecting a fixed scale still requires calibration. The 6 × 7 m example still measures 60 × 70 mm at 1:100 and 12 × 14 mm at 1:500. The site sheet can be saved without a property reference. Chrome also checked the optional floor elevation and the Layers explanation. All 128 tests, the production build and formatting checks passed.

The checklist and application ZIP in the earlier verification describe the previous draft. The current editor focuses on individual drawings and measurements and opens saved drawings from that draft.

## Garage permit after the 3D pivot

The permit draft reads roof, wall and opening geometry from the same model as 3D. Old permit-only height fields are retained in the source metadata and copied into the shared model when opening an older draft. Terrain and property details stay with the permit workflow.

- Chrome verified the compact Export dialog for PDF, SVG and PNG and the separate Garage permit workflow. Created wall and roof settings in Building, edited door and window heights in Properties, then rendered 3D and generated the matching section and elevations.
- PyMuPDF measured 60 × 70 mm on the 1:100 plan and 12 × 14 mm on the 1:500 site plan. A 1:50 A3 plan measured 120 × 140 mm. Inspected rendered section and elevation sheets.
- A changed roof pitch, opening position and wall thickness regenerated the ten-file ZIP. Areas changed from 36.96/42.00 to 36.30/42.70 m², and the west boundary distance changed from 12.50 to 12.45 m. The project reopened with the site map offline.
- The stacked branch passed 127 tests. Production build, required Prettier and CLI checks passed.

## General building model and 3D

The integration started at `origin/main` commit `80792e43`. The separate permit draft builds on this branch and remains available for review.

| Change                | Worktree branch and integrated commit              | Evidence                                                                                                                                                                                                              |
| --------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared building model | `feat/building-model-contract`, `f84a688`          | Tests cover inherited and explicit wall heights, hosted opening dimensions, one outer shell with interior partitions, flat, shed and gable roofs, validation and the CLI building operation.                          |
| Interactive 3D        | `feat/building-3d-viewer`, `81cf788`               | Chrome rendered a house, its roof-off interior, and a detached garage. Viewer checks covered pointer and keyboard orbit, zoom and reset, selection and the WebGL fallback. Mesh tests check the actual opening holes. |
| Editor controls       | `feat/building-model-3d`, `d3e5302` and follow-ups | Chrome checked a floor-wide height change, undo and redo, retained overrides, a multi-wall edit, reset to the floor default, and new walls inheriting the default. Roof and window edits survived Save and Open.      |

`npm test` passed 101 tests. The production build, required Prettier check, CLI example validation and PNG rendering passed. The synthetic house has interior rooms and an exterior window. The synthetic garage measures 6 × 7 m. These fixtures verify editing and geometry.

## Garage permit integration

The integration branch starts at `origin/main` commit `80792e43`. The only additional open PR at intake was #32 for browser assistant Help. PR #38 had already delivered exterior dimensions, and PR #31 had delivered named proposals. The outstanding dependency chains were wall junctions → attached dimensions, layers → phase views, and local save recovery plus layers → reference import. The fixed-scale sheet engine and area calculation could start immediately. The site plan consumes the same roof and footprint as the section, and the application ZIP consumes the same sheet builders as standalone export.

| Issue                                                | Branch, PR or integrated commit                                                           | Verification                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#1](https://github.com/judoole/planform/issues/1)   | `feat/1-local-save-history`, `ea41f66`                                                    | Chrome restored a dated older revision and retained the most recent one. Simulated storage quota failure reported unavailable recovery and allowed a real JSON download. Cancel and download-and-continue were checked for both New and Open.                                                                                                                                                                        |
| [#5](https://github.com/judoole/planform/issues/5)   | `feat/5-layers`, `e461289`                                                                | Chrome moved a wall to a new layer, verified lock and visibility in the inspector, canvas and SVG export, then checked undo, redo and reload with its hosted door. Tests also cover layer order, legacy Default membership and invalid layer references.                                                                                                                                                             |
| [#6](https://github.com/judoole/planform/issues/6)   | `feat/6-wall-junctions`, `a783157` and `4875af1`                                          | Chrome rejected a split through a door, split away from openings while retaining a window position, joined a mixed-thickness T and moved the junction. Tests cover strict shared coordinates, valid hosts and retained exterior dimensions on a straight garage side.                                                                                                                                                |
| [#7](https://github.com/judoole/planform/issues/7)   | `feat/6-wall-junctions`, `4bf69cc`                                                        | Chrome checked the attached measure changing from 180 to 280 cm with a fixed offset, the confirmed cascade on deletion, undo and reopening. Tests cover split remapping, duplication and legacy free points.                                                                                                                                                                                                         |
| [#9](https://github.com/judoole/planform/issues/9)   | [PR #31](https://github.com/judoole/planform/pull/31) and layered regression in `e461289` | Create, name, copy, switch and restore were already present on main. Added a layered proposal round-trip covering independent edits and shared relationships within each copy.                                                                                                                                                                                                                                       |
| [#10](https://github.com/judoole/planform/issues/10) | `feat/10-renovation-phases`, `87e64cb`                                                    | Chrome checked phase switches, opening inheritance, undo and redo, SVG legend, and exclusion of hidden geometry. PDF coverage includes the selected phase and the visible layers.                                                                                                                                                                                                                                    |
| [#13](https://github.com/judoole/planform/issues/13) | `feat/13-local-reference-import`, `3a5205c` and `a06438b`                                 | In Chrome, rejected SVG input, selected page 2 from a PDF, set opacity and position, locked and calibrated the tracing reference, and reopened the saved file offline after moving the source PDF.                                                                                                                                                                                                                   |
| [#15](https://github.com/judoole/planform/issues/15) | `feat/garage-permit-documentation`, `3061b74`                                             | Exported A4 landscape at 1:100, A3 portrait at 1:50 and A4 portrait at 1:50. Parsed the exported PDF vector coordinates to measure the 6 × 7 m exterior and the separate 500 cm test span. Preview blocks uncalibrated or oversized sheets.                                                                                                                                                                          |
| [#33](https://github.com/judoole/planform/issues/33) | [PR #38](https://github.com/judoole/planform/pull/38) and shared contour in `3061b74`     | Existing coverage verifies editing, undo, free dimensions and reopening. The browser garage still shows four live 6.00/7.00 m exterior labels, also printed on its 1:100 PDF.                                                                                                                                                                                                                                        |
| [#34](https://github.com/judoole/planform/issues/34) | `feat/garage-permit-documentation`, `3061b74`                                             | Confirmed unrounded 36.96 m² BRA and 42.00 m² BYA for 20 cm walls. Chrome showed a loft as provisional. Increasing the right wall to 40 cm updated the report to 36.30 m² and 42.70 m².                                                                                                                                                                                                                              |
| [#35](https://github.com/judoole/planform/issues/35) | `feat/35-garage-site-plan`, `1bf61c8` and `a06438b`                                       | Calibrated a 20 m bar independently of the floor plan, placed and rotated the garage and marked three measured features plus access. The boundary distance changed from 12.50 m to 12.00 m at 90° and to 14.50 m after a 2 m move. Map, calibration and annotations survived an offline reopen. The 1:500 PDF included north, property ID, ridge, and feature labels, and measured 12 × 14 mm at the garage outline. |
| [#36](https://github.com/judoole/planform/issues/36) | `feat/garage-permit-documentation`, `e503435`                                             | Exported a dimensioned A–A section and four elevations using sloped existing and proposed terrain, a garage door and a window. Missing inputs prevented export. Verified in regenerated PDF geometry that changing pitch to 32° and moving the window refreshed the affected views.                                                                                                                                  |
| [#37](https://github.com/judoole/planform/issues/37) | `feat/37-garage-attachment-package`, `1c204ca` and `a06438b`                              | Chrome downloaded a partial package with unmet entries and a complete ten-file ZIP with an editable draft, seven scaled PDFs, the calculation and checklist. Inspected every rendered PDF and both ZIP checklists. The regenerated ZIP used the revised roof, window, 36.30/42.70 m² areas and 12.45 m boundary distance.                                                                                            |

The map and garage used synthetic test data. PDF dimensions were checked independently of Planform with PyMuPDF. The [workflow guide](docs/garage-permit.md) documents supported inputs, drawing assumptions and the static build.

## Earlier verification - 7 November 2026

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
