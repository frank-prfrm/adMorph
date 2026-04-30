# Ad-Morph Editor

React editor for the Ad-Morph project. See the [root README](../README.md) for the full picture and current status.

## Dev

```bash
npm install
npm run dev    # http://localhost:5173
npm run build
```

## What's here

- `src/components/LiftSubject.tsx` — in-browser SlimSAM (`Xenova/slimsam-77-uniform` via `@huggingface/transformers`). Module-level singleton load; per-ad image encoding; pointer-down → run mask decoder → render mask via CSS `mask-image`.
- `src/components/Canvas.tsx` — renders captured ad screenshots in a scrollable column with a delete button and the `LiftSubject` overlay.
- `src/App.tsx` — postMessage capture wiring (`adMorphData` + `adMorphScreenshot`), URL-param ad bootstrap, ResizeObserver.
- `src/loader.ts` — localStorage helpers + legacy-shape migration so old `elements`-shaped ads still load.
- `src/store.ts` — Zustand store: `ads`, `adScreenshots`, plus their CRUD.

No external API calls. Only network traffic is a one-time SlimSAM weights fetch from HuggingFace CDN, cached in IndexedDB.

## Status

Lift-subject is wired and typechecks cleanly, but pressing on a captured ad doesn't reliably produce the mask overlay. See "Known Issues" in the root README.
