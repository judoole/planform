# File format and limitations

Reference for Planform project structure, compatibility, and supported drawing constraints.

Planform v2 is architectural JSON in centimeters, with X right and Y down. Wall endpoints describe **centerlines**; openings refer to a host wall by ID and store center position as a fraction of its length. Rectangles rotate clockwise about their x/y anchor. The drawing guide specifies full conventions, door orientation and all supported objects.

The optional v2 drawing field `showExteriorDimensions` is a boolean and defaults to hidden when omitted. Exterior wall lengths are derived from the current walls when drawn or exported. Saved free-point dimension objects retain their own geometry.

The browser and CLI share the drawing schema and the [project schema v4](../public/agent/project.schema.json). Single drawings use v2. Multi-drawing projects use v4: `drawings` is an ordered list of `{ id, name, role, plan }`, where `role` is `existing` or `proposal` and `plan` is a complete v2 drawing. There must be exactly one Existing drawing and at most ten proposals. Drawing IDs must be unique, and `active` references a drawing ID. Object IDs are unique within each drawing and may be repeated across drawings. Legacy [comparison projects v3](../public/agent/comparison.schema.json) migrate on opening, retaining `existing` and `proposed` as drawing IDs, the original plans and the active ID. Relationship checks reject duplicate IDs within a drawing, zero-length walls, orphaned openings, out-of-wall openings and overlaps. Errors identify JSON paths and, for relationship failures, affected object IDs. Imports fill documented metadata defaults but never repair geometry. Schema validity alone does not establish measurement accuracy or building feasibility.

Architectural v1 files with no SVG references migrate to v2 on opening. Legacy files containing vectors, definitions or reference pages are rejected with an explanation rather than partially loaded. SVG import, arbitrary embedded markup and vector-node editing have been removed. SVG remains the internal drawing renderer and an export format. The editor writes recovery to `planform-recovery-v4` and can still read the original v1, v2 and v3 keys without overwriting them.

Projects are limited to 15 MB per file, 50,000 objects per drawing and 15 group levels. Browser recovery is best effort and does not replace downloaded project files. Camera, overlay visibility, selection, active tool, clipboard and each drawing's 60-entry undo history and the last ten deleted proposals are session state.

See [VERIFICATION.md](../VERIFICATION.md) for verification history and remaining implementation limitations.
