# Planform

A browser-based, one-floor renovation sketch editor. Private, local files; no account or backend.

## Run

Requires Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Open the printed localhost URL. `npm test` runs focused model/import tests. `npm run build` creates the static `dist/` folder; `npm run preview` serves that build. Any ordinary static web host can serve `dist/`.

## Project format

`.planform.json` is a versioned, self-contained JSON document using centimeters, full-precision numeric coordinates, ordered vector objects, embedded sanitized SVG definitions, architectural objects and host-wall IDs. Import calibration is stored with the document. Download/open works independently of browser storage. Local recovery is best-effort and may be unavailable in private browsing or when storage is full.
