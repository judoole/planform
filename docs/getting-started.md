# Getting started

Planform is a browser-based 2D editor for single-floor renovation planning. It runs without a backend, account, remote fonts, model API key or runtime service. Serve the built `dist/` directory from any static host.

## Run locally

Use Node.js **22.12+, 24+, or 26+** (a supported even-numbered release).

```sh
npm ci
npm run dev
```

Open the printed localhost URL, normally `http://127.0.0.1:5173`. A local server is required; opening `index.html` directly is not supported. `npm run build` creates the production site and `npm run preview` serves it locally.
