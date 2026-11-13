# Getting started

Planform is a browser-based 2D editor and 3D preview for single-storey building and renovation planning. It runs without a backend, account, remote fonts, model API key or runtime service. Serve the built `dist/` directory from any static host.

## Run locally

Use Node.js **22.12+, 24+, or 26+** (a supported even-numbered release).

```sh
npm ci
npm run dev
```

Open the printed localhost URL, normally `http://127.0.0.1:5173`. A local server is required; opening `index.html` directly is not supported. `npm run build` creates the production site and `npm run preview` serves it locally.

## View a building in 3D

1. Draw the exterior walls and any partitions, doors and windows in 2D. Calibrate a known distance if the drawing is unscaled.
2. Open **Building** in the inspector and set **Default wall height**. Leave **Floor elevation** at 0 for a sketch, or set it relative to a chosen reference if you need to show the floor above or below ground. Select a wall to override its height. Select several walls to apply one height to the selection, then use **Use floor default** when they should follow the drawing again.
3. Choose a flat, shed or gable roof. Set its thickness and, for a sloped roof, its pitch and direction. A shed angle points uphill. A gable angle follows the ridge. The roof uses the closed outer shell and rests at its highest exterior wall top.
4. Select **3D** to inspect the model. You can orbit, zoom, hide the roof to see inside, or select a wall and edit it in Properties. The preview also reads a hosted door or window's opening height and sill.

Older drawings use a default wall height of 240 cm, and a roof can be added when needed. A roof requires one closed convex exterior shell. Interior partitions can remain in that shell. For an open footprint or a shape outside that roof model, the preview still shows the walls and explains the missing roof.
