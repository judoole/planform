# Building model and 3D implementation

Planform uses one drawing for editable floor-plan geometry and its 3D view. The initial model covers one storey, with walls, hosted doors and windows, and one flat, shed or gable roof over a convex closed outer shell. The garage permit is a documentation workflow built on that model.

## Implementation order

| Work                                                  | Depends on                                        | Owner and branch                                                       |
| ----------------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- |
| Shared building settings, file schema and 3D geometry | Current main and the architectural wall model     | Model worktree, `feat/building-model-contract`                         |
| Browser 3D viewport                                   | Shared geometry interface                         | Viewer worktree, `feat/building-3d-viewer`                             |
| Editor controls and integration                       | Shared geometry and viewer selection contract     | Integration worktree, `feat/building-model-3d`                         |
| Compact export and permit integration                 | Existing PR #39 and the shared geometry interface | Permit worktree, `refactor/permit-building-model`, integrated into #39 |

## Shared implementation brief

Start each track in a separate Git worktree. Read AGENTS.md, fetch the default branch and inspect overlapping PRs and their dependencies. Keep the browser and CLI on the same project schema and relationship validator. Preserve existing projects, proposal histories and local recovery data. Work from the same saved model in the preview and exports. Report unsupported geometry where it affects the requested view.

Use normal editor controls for wall heights and roofs. Verify the full edit, undo, save and reopen path in Chrome. Run the repo tests, production build, required formatting check and CLI example validation and rendering. Record the tested scenarios in the review notes. The standalone 3D pull request targets main. The permit draft uses the 3D branch as its base while the model is under review.

## Acceptance

- A saved house plan with interior partitions opens in 3D. The user can orbit, pan, zoom and hide the roof. An open footprint still shows its walls and explains why a roof is unavailable.
- The floor default updates all inheriting walls in one undo step. Newly drawn walls also inherit it. An explicit wall override survives a change of default. A group of selected unlocked walls can receive a height together and return to the default.
- Flat, shed and gable roofs respond to the building settings. Door and window openings respond to their host wall, position, height and sill. Older files without vertical settings remain editable.
- The 6 × 7 m garage uses the same model as the house. Changing its wall heights and roof settings updates the 3D view and the next section and elevation exports. Existing permit draft data reopens with its geometry and terrain. Export opens a compact output chooser.
- The permit package still includes the 1:100 floor plan and section/elevations, the 1:500 site plan, the area report, editable draft and attachment checklist. Verify both scales using actual PDF coordinates.
