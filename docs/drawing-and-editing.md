# Drawing and editing

Use the canvas tools to create and refine a single-floor plan.

## Draw and edit

- **Wall** creates connected corners; **Room** creates four walls with a drag. Room is a drawing tool, not a persistent room object. Shared corners use equal endpoint coordinates. Use **Wall junctions** in Properties to explicitly split a wall at a distance from its start or join a selected wall endpoint to another wall. A join inside a target wall splits it into two segments, creating a T-junction. The default join position projects the source endpoint onto the target wall. Splits through openings are rejected, and each operation is one undo step.
- Select walls to edit length, thickness, angle or endpoints. **Door** and **Window** attach to walls. Manual edits retain the existing fit-to-wall behavior: openings may move/shrink when space changes, and are removed when less than 5 cm remains. Deleting a wall removes its openings. Undo restores the edit. Strict agent imports/commands reject these conflicts instead.
- In the **Door** tool, choose a hinged or sliding door before clicking a wall. Change an existing door's type or flip its slide direction in **Properties**.
- Place stairs, furniture, labels and dimensions. Symbols have resize and rotation handles. Dimensions have independent endpoints and are not attached to walls. Joined walls share a rounded fill the width of the thickest connected wall at the corner or T-junction.
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

## Exterior wall lengths

In **Properties**, turn on **Show exterior wall lengths** for a calibrated drawing containing one convex loop of connected straight walls. Angled corners are supported. Each side is measured between the intersections of adjoining outside faces. A rectangular garage with 580 × 680 cm centerline spans and 20 cm walls shows two sides of 6.00 m and two sides of 7.00 m. Openings and rounded corner fills do not affect the measurement.

The setting is saved per drawing. Turning the labels on or off preserves the drawing's undo and redo history. The editor and SVG/PNG exports recalculate the marks from the current walls, including after undo and reopening. Properties explains when the drawing needs calibration, when the loop is open, and when the wall layout is unsupported. Unsupported layouts include inward corners, crossing walls, partitions, stubs and consecutive segments along the same straight line. Free-point dimensions remain editable with the **Dimension** tool and Properties.

### Layers

In the inspector's Layers tab, create and name layers, reorder them from back to front, and choose the active layer for new objects. Hide a layer to remove its objects from the canvas, selection, snapping and drawing exports. A locked layer stays visible. Unlock it to edit its objects. A connected edit that would move a hidden or locked object is blocked. Calibration rescales the entire floor plan, including hidden and locked objects.

Version 1 and earlier version 2 architectural drawings open with a single Default layer and unchanged geometry. Doors and windows inherit the host wall's layer, and grouped symbols share their group's layer. Move symbols onto the same layer before grouping them. Deleting a layer moves its objects to the Default layer. Layer edits are undoable and remain independent across proposals.

### Renovation views

Select walls and set their renovation status in Properties. Doors and windows inherit their host wall's status. Older walls count as Existing. Symbols and annotations remain available across phases, subject to layer visibility. New walls drawn in the Proposed view start with the New status.

- **All objects** shows every classification for editing.
- **Existing** shows the walls present before work and styles future demolition as existing work.
- **Demolition** shows the same walls with demolition work highlighted in dashed terracotta.
- **Proposed** shows retained walls and new work, with new work in blue.

Changing the view preserves geometry and does not consume an undo step. Classification edits are undoable. The current view and its legend are included in drawing exports.
