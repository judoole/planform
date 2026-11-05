# Verification — 5 November 2026

## Automated checks

- `npm test`: **20 tests passed** in three files.
- `npm run build`: TypeScript and production build passed; approximately 299 kB JavaScript / 94 kB gzip, 19 kB CSS / 5 kB gzip.
- `npm audit`: **0 vulnerabilities** at verification time.
- Focused coverage: angled geometry/projection, shared corners, wall-opening movement/resizing/removal, non-overlapping openings, duplication and nested IDs, snapping, calibration, invalid-file rejection, round trips, undo/redo, SVG sanitation/order/white covers/curves, straight node parsing, unchanged-object identity in a 2,658-vector document, zoom/pinch coordinate math, complete door-swing bounds, and avoiding numeric rounding on unedited blur.

## Browser checks

Executed through Chrome on this computer, using actual controls, pointer gestures, standard native file pickers and browser downloads.

| Workflow              | Observed result                                                                                                                                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty plan and room   | Dragging Room created four connected walls. Properties showed an exact 500 cm wall. Set length 600 cm and thickness 20 cm.                                                                                                                                                       |
| Wall attachments      | Added a 90 cm door and 140 cm window. Extended host wall from 600 to 800 cm and moved it by 50 cm in each axis. Their widths remained constant and centers followed the host's relative positions. Shared corners updated.                                                       |
| Stairs/furniture      | Placed stairs; set 110 × 280 cm, 14 steps and 90° rotation. Placed a sofa, changed width to 230 cm, position and rotation to 15°. Duplicate/delete/undo/redo worked. Additional bed/stairs were included in mixed-file checks.                                                   |
| Supplied SVG          | Imported all 2,658 paths, including 741 white cover paths. Compared canvas and exported PNG with the supplied reference image. Curved door swings, stairs, masks from white geometry and drawing order were retained. No unsupported-feature warnings on the final import.       |
| Individual vectors    | Found `path0009` using Objects, entered node editing, dragged an endpoint and checked the resulting vector path. Undo restored it. Multi-selected imported paths, grouped, rotated, resized, duplicated and ungrouped them.                                                      |
| Calibration           | Chose two points 118.13 drawing units apart and applied a **synthetic test distance** of 500 cm. Verified the persisted factor and centimeter status. This was a software test, not a validated real dimension of the building.                                                  |
| Zoom/pan/measure      | Zoomed and measured a wall with known model length 500 cm; the reading remained **500.00 cm**. Panning changed camera coordinates without creating objects. Coordinate conversion and moving-midpoint pinch math have separate tests.                                            |
| History               | Browser checks covered drawing, property changes, movement, node edits, duplication and deletion with undo/redo. Unit tests also cover state restoration and redo invalidation.                                                                                                  |
| Mixed file round trip | Downloaded a document with 2,658 imported vectors, a wall, door, window, stairs, furniture and calibration. Started empty, opened the downloaded file, saved again, and compared parsed JSON: **identical**. All 2,663 objects and host IDs were preserved.                      |
| SVG/PNG export        | Downloaded and inspected both formats. Exported PNG was 4096 × 3062; all geometry and symbols were visible on white, without editor overlays. Source path data, order and paint attributes exactly matched the first 2,658 exported paths.                                       |
| Responsive layout     | Checked desktop (1488 px wide), tablet 820 × 1180, phone 390 × 844 and narrow phone 320 × 740. Tools, file menus, zoom and the Properties/Objects drawer remained accessible. Edited a bed rotation to 30° through the phone drawer.                                             |
| Touch emulation       | Used Chrome DevTools' iPad Mini preset. Native pointer gestures were confirmed as **`pointerType: touch`** in the rendered canvas state. A room was drawn and touch panning changed the camera without adding geometry. The drag completion path was tightened after this check. |
| Production            | Served `dist/` with Vite preview, reloaded Chrome, confirmed the hashed production bundle was used and the 2,658-vector reference recovered correctly.                                                                                                                           |

## Verification limits and retained state

- Physical tablets/phones were **not** tested. Two-finger pinch is implemented and its geometry is unit tested, but a complete two-touch browser gesture could not be driven by the available native input API. Actual pinch behavior still needs a physical-device pass.
- Some automation actions timed out after Chrome had already applied the edit; subsequent UI and file checks confirmed the result. A development hot-reload/cache restart required a full reload. The final production reload succeeded.
- The actual building scale remains **unknown** until the user supplies a known real measurement. No centimeter scale was inferred from the 1:100 marking.
- The final browser recovery document was reset to the untouched supplied SVG, clearly marked **uncalibrated**, with all 2,658 paths and no synthetic architectural objects.
- Unsupported SVG authoring features, simple rounded wall joins, non-associative dimensions, grouping restrictions and curve-node limits are described in README. The supplied file does not use the unsupported features reported there.
- No push, remote publication or deployment was performed. Temporary drawings, exports and browser test files are excluded from Git.
