# Draw editable floor plans for Planform

You are creating a single-floor, 2D architectural drawing. Return a downloadable `.planform.json` file, not SVG or an illustration. Use the attached schema and example if provided. Work in centimeters and preserve stable, meaningful object IDs across revisions.

## Workflow

1. Inspect the supplied PDF/image or description. Identify the relevant floor and readable dimensions. Use embedded text and vector geometry where available, and inspect a rendered page too. A PDF's printed scale alone is insufficient after arbitrary resizing. Ask for a known real dimension if no reliable measurement exists.
2. Use a consistent origin, X increasing right, Y increasing down. Rotation is in degrees, clockwise on the page. Wall endpoints lie on wall **centerlines**; clear internal room dimensions exclude half of each bounding wall's thickness. A 500 cm clear room between two 20 cm walls has wall centerlines 520 cm apart.
3. Build the main walls first, then partitions and attached doors/windows. Reuse exactly equal endpoint coordinates for connected corners. Use the `joinWalls` operation to split a target wall and connect a T-junction, preserving its openings. Use `splitWall` to divide a single wall without a new branch. Do not create duplicate walls between adjacent rooms. Walls have no persistent room identity.
4. Add labels, stairs and furniture only when supported by the source or requested. Keep all architectural elements top-level. Groups may contain furniture, stairs, text and other groups only.
5. Distinguish measured geometry from estimates using `evidence`. Record ambiguous symbols, scale assumptions, inconsistent dimension chains and omitted detail in `source.notes`. If absolute scale cannot be established, set `calibration.calibrated` to false, say dimensions are provisional, and request calibration. Schema validity is not proof that the building has been measured correctly.
6. Validate the file, render a preview, compare against the source, correct discrepancies, and return the project plus unresolved assumptions. In Codex with this repository: `npm run plan -- validate drawing.planform.json`; `npm run plan -- render drawing.planform.json --out preview.png`. Render uses Planform's own architectural renderer. If these tools aren't available, clearly state which checks were not performed.

## Project envelope

Required: `format: "planform"`, `version: 2`, `name`, `units: "cm"`, `items`.
Optional: `grid` (1–1000 cm; default 10), `calibration` (default `{ "calibrated": true, "imported": false, "factor": 1 }`), `showExteriorDimensions` (boolean; hidden when omitted), `building` (vertical dimensions and roof, described below), `source: { "file": "house.pdf", "page": 1, "notes": ["..."] }`, `$schema`.

`calibration.factor` is cumulative scaling history; changing this number does not scale geometry. All stored coordinates are already in centimeters. Set `imported: true` for reconstructed source drawings. Never claim unknown dimensions are measured.

Set `showExteriorDimensions` to true to annotate a calibrated, convex loop of connected straight walls. The editor and rendered exports label each exterior wall between the intersections of adjoining outside faces, including angled corners. For a 600 × 700 cm rectangular exterior with 20 cm walls, draw the centerlines 580 × 680 cm apart.

Every item requires `id`, `name`, `type`. Optional `locked` and `evidence: { "basis": "measured" | "estimated", "note": "Source dimension or explicit assumption" }`. IDs are unique across the entire document, including groups. Unknown properties and arbitrary SVG markup are rejected.

## Building dimensions

Use `building.defaultWallHeight` for the common wall height. Wall `height` overrides it. Omitted values resolve to a 240 cm common height. Opening `height` and `sill` set the vertical opening size and its elevation above the floor. A door defaults to a 210 cm height and a 0 cm sill. A window defaults to a 100 cm height and a 90 cm sill. `building.floorLevel` is the finished floor level relative to the project's height datum and defaults to zero. Vertical measurements use real centimeters and retain their values when plan calibration changes horizontal measurements.

Optional `building.roof` has `type: "flat" | "shed" | "gable"`, pitch in degrees, clockwise direction measured from plan +X, and thickness in centimeters normal to the slope. Gable direction is along the ridge and shed direction is uphill. Defaults for a pitched roof are 30°, direction 0°, and 24 cm thickness. Flat roofs use zero pitch. Roof geometry derives from a closed convex outer wall loop, including ordinary partitions and collinear wall segments of equal thickness. The roof sits on the highest exterior wall. A lower exterior override can leave a gap. Record unresolved dimensions and review the building view before relying on drawings that use them.

## Items

- Wall: `{ "id":"north", "name":"North wall", "type":"wall", "a":{"x":0,"y":0}, "b":{"x":600,"y":0}, "thickness":20 }`. Nonzero length, positive thickness. Endpoints specify direction, which affects openings. Optional `junctions: {a?, b?}` stores explicit junction IDs. Endpoints with the same ID must have exactly equal coordinates. Older walls still connect at coincident endpoints.
- Door/window: `{ "id":"entry", "name":"Entry", "type":"door", "hostId":"north", "t":0.25, "width":90, "hinge":1, "swing":1 }`. `t` is the opening **center** as a fraction of host length from a to b. For center 150 cm along a 600 cm wall, t = 0.25. Width is physical, not fractional. The entire opening must fit and must not overlap another opening. Hosts must be top-level walls at least 5 cm long; opening width is at least 1 cm.
- Door orientation: in local coordinates, +X points a→b and +Y is clockwise from it. For `hinge:1`, hinge is at the a-side edge; `hinge:-1` puts it at the b-side edge. `swing:1` opens toward local -Y; `swing:-1` toward +Y. Reversing wall endpoints reverses the local axes. Windows require hinge/swing too; use 1 for both.
- Sliding door: use `type:"door"` with `style:"sliding"`. `slideDirection:1` (default) points toward wall end b; `-1` points toward start a. The symbol shows two panels within the opening. Sliding doors still store `hinge` and `swing` for switching back to a hinged door; use 1 for both if unknown. An omitted `style` means hinged. The `opening` operation also accepts `style` and `slideDirection` for doors.
- Furniture: `{ "id":"sofa", "name":"Sofa", "type":"furniture", "x":50,"y":50,"w":210,"h":90,"rotation":0,"kind":"sofa" }`. Kinds: sofa, table, chair, bed, cabinet, counter, toilet, shower, `fireplace-rounded`, `fireplace-square`. At zero rotation the fireplace front faces positive Y.
- Stairs: same x/y/w/h/rotation fields, `type:"stairs"`, `steps:12` (integer 2–100). Stair arrow points from local +Y toward -Y before rotation.
- Text: same x/y/w/h/rotation fields, `type:"text"`, `text:"Kitchen"`, `fontSize:18`. Size fields define the selection box, not text wrapping. Allow sufficient width/height for the actual label; text renders at (0, fontSize) in local coordinates.
- Dimension: `type:"dimension"`, `a`, `b`, `offset` in cm. Free points measure their saved positions. Optional `anchors: {a?, b?}` makes either endpoint live; each reference contains `itemId` and `point` equal to `"a"` or `"b"` for a wall endpoint, or `"center"` for an opening, symbol, or group. Attached endpoints resolve from current geometry. The required saved `a` and `b` points are used for free endpoints.
- Group: same x/y/w/h/rotation fields, `type:"group"`, `sourceBox:{x,y,w,h}`, `children:[...]`. Children retain coordinates in the sourceBox coordinate system; group scales it into w/h, then rotates around x/y. Prefer flat items for generation. Walls, openings and dimensions cannot be grouped.

Rectangle x/y is the unrotated upper-left anchor, and rotation is around that anchor. All rectangle sizes and font sizes must be positive. Coordinates and sizes are bounded to 10,000,000 cm in magnitude. Projects allow 15 MB, 50,000 total objects and 15 group levels.

## Iterative edits

For file-based updates, return the complete project and keep existing IDs. Alternatively return a command batch (schema: `commands.schema.json`):

```json
{
  "format": "planform-commands",
  "version": 1,
  "operations": [
    {
      "op": "opening",
      "id": "entry",
      "name": "Entry",
      "type": "door",
      "hostId": "north",
      "offset": 150,
      "width": 90,
      "hinge": 1,
      "swing": 1
    },
    { "op": "update", "id": "sofa", "changes": { "x": 70, "rotation": 90 } }
  ]
}
```

Operations: `add` with `items`; `opening` with center `offset` in centimeters (not t); `corner` with `wallId`, `end:"a"|"b"`, `point`; `update` with `id` and `changes`; `delete` with `ids` and optional `cascade:true` for hosted openings and dimensions attached to deleted objects. Update cannot change IDs, types, endpoints or group structure. Use corner for shared endpoint edits. Object commands target top-level objects. Locked objects require a separate unlock operation (`update` with only `locked:false`) first. Connected locked walls block a corner edit.

Use `splitWall` with `wallId`, `offset` from its start (a), a fresh `segmentId` and a fresh `junctionId`. The wall segment containing the original start retains the original ID. Wall properties and opening positions and widths are preserved. Splits through openings fail.

Use `joinWalls` with `sourceWallId`, `sourceEnd:"a"|"b"`, `targetWallId`, `targetOffset` from its start, a fresh `segmentId` and a fresh `junctionId`. Target offsets at the wall endpoints join a corner and need no additional segment. Interior offsets split the target. The source and any walls already meeting there move to the target point together.

Use `{ "op": "setBuilding", "building": { "defaultWallHeight": 260, "roof": { "type": "gable", "pitch": 30 } } }` to replace the drawing's building settings. A null `building` removes them. The `opening` operation accepts `height` and `sill`. Update an object's `height` or an opening's `sill` to null to restore its inherited or default value. An opening that extends past its host wall's height is retained, and the 3D view identifies the unresolved dimensions.

Use `{ "op": "setExteriorDimensions", "show": true }` to show exterior wall labels for the drawing, or set `show` to false to hide them.

Batches are atomic, apply in order, and validate the final result. Invalid horizontal opening geometry is rejected without moving, shrinking or deleting openings. A wall resize retains opening t, so center distance changes proportionally; update t as part of the same batch if a fixed distance is needed. Dependent objects may be added later in the same batch. If shrinking a wall, fix its openings in that batch. Deleting an anchor object requires explicitly including its attached dimensions or `cascade:true`; deleting a wall also removes hosted openings, including any dimensions attached to those openings. Deleted IDs are reported.

Run: `npm run plan -- apply drawing.planform.json edits.json --out revised.planform.json`. Then render and inspect the revised drawing. In the browser, use **AI drawings → Edits to the current drawing → Validate & preview → Apply edits**. A complete drawing can be pasted or opened as a downloaded project. Each accepted import/batch is one undoable edit.

A multi-drawing project uses v4 (`project.schema.json`): an ordered `drawings` array of `{ id, name, role, plan }`, with exactly one `existing` drawing and up to ten `proposal` drawings. Each `plan` is a complete v2 drawing. IDs identify drawings independently of their editable names; `active` must reference a drawing ID. Keep drawing IDs and object IDs stable on updates; object IDs may repeat across drawings. The main **Open** button loads the complete project. **Manage proposals → Import new proposal** accepts a single v2 drawing. Legacy two-drawing v3 files (`comparison.schema.json`) migrate on opening. The CLI validates every drawing, renders the saved active drawing and applies batches to it while preserving all other drawings. Add `--plan <id>` to target another drawing without changing the saved active ID. In the browser, select the drawing you want to edit before opening **AI drawings**.

This is a file/command workflow. Live MCP control and automatic PDF conversion inside Planform are not included.
