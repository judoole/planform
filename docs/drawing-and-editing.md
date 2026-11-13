# Drawing and editing

Use the canvas tools to create and refine a single-floor plan.

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

## Overall exterior dimensions

In **Properties**, turn on **Show overall exterior dimensions** for a calibrated drawing containing one rectangular loop of four walls. The marks show the distances between opposite outside wall faces, using half of each wall’s thickness. A garage with 580 × 680 cm centerline spans and 20 cm walls measures 6.00 × 7.00 m outside. Openings and rounded corner fills do not affect the measurement.

The setting is saved per drawing. The editor and SVG/PNG exports recalculate the marks from the current walls, including after undo and reopening. Properties explains when the drawing needs calibration, when the loop is open, and when the wall layout is unsupported. Free-point dimensions remain editable with the **Dimension** tool and Properties.
