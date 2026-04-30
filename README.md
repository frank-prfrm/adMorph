# Ad-Morph

Chrome extension + React editor for capturing live web ads and lifting subjects out of them, locally.

> **Status (Apr 29, 2026):** Mid-rebuild. All external AI/Replicate calls were stripped. The editor now uses an in-browser segmentation model (SlimSAM via `@huggingface/transformers`) for a press-and-hold "lift subject" gesture. The wiring compiles and boots cleanly, but end-to-end behavior on captured ads is **not yet working in practice** — needs debugging from the browser side. See [`rethink-html-approach.md`](./rethink-html-approach.md) for older HTML-mode notes that no longer apply.

## Overview

**Chrome Extension** → hover over any ad on any page → click to capture its viewport rectangle as a screenshot → **React Editor** opens with the screenshot displayed → press and hold on a subject in the screenshot → segmentation model produces a mask of that subject and renders it as a glowing overlay.

No external API calls (no Anthropic, no OpenAI, no Gemini, no Replicate). The only network traffic is a one-time download of the SlimSAM weights (~30 MB) from the HuggingFace CDN, cached in IndexedDB by the transformers.js runtime after the first run.

## Structure

```
adMorph/
├── manifest.json         # Chrome Extension MV3 manifest
├── content.js            # Hover highlight + capture trigger
├── background.js         # Screenshot crop, postMessage IPC, tab reuse
├── popup.html / popup.js # Extension popup
├── highlighter.css
├── icon.png
└── editor/               # React editor (Vite + TS + Tailwind v4 + Zustand)
    └── src/
        ├── types.ts                       # CapturedAd { id, capturedAt, width, height }
        ├── store.ts                       # Zustand: ads, adScreenshots
        ├── loader.ts                      # postMessage listener + localStorage + legacy-shape migration
        ├── App.tsx                        # Header + ResizeObserver + capture wiring
        └── components/
            ├── Canvas.tsx                 # Empty state + scrollable per-ad blocks
            └── LiftSubject.tsx            # SlimSAM model load, image encoding, press-and-hold mask render
```

Everything else from the previous build (LLM providers, settings panel, sidebar, AI refiner, bbox/HTML extraction modes, Replicate SAM integration) was deleted. See git history on the `anthropic` branch for the prior architecture.

## Setup

### Chrome Extension

1. `chrome://extensions` → enable Developer mode → Load unpacked → select repo root.

### Editor

```bash
cd editor
npm install
npm run dev   # http://localhost:5173 (or 5174/5175 if port is taken)
```

## Usage

1. Click the Ad-Morph Inspector icon and press **Inspect Ad**.
2. Hover an ad on any page; click to capture.
3. The editor displays the screenshot. Status banner walks: *Loading lift-subject model…* → *Encoding image…* → *Press and hold a subject to lift it.*
4. Press and hold over a subject; a cyan mask should appear hugging it (this is the part that isn't reliably working yet).

## Tech Stack

| Layer | Tech |
|---|---|
| Extension | Chrome MV3, Vanilla JS |
| Editor | React 19, Vite 8, TypeScript |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) |
| State | Zustand |
| Icons | Lucide React |
| Segmentation | `@huggingface/transformers` v4.2.0 + `Xenova/slimsam-77-uniform` (in-browser, ~30 MB) |
| Persistence | `localStorage` (`adMorphAds`, `adMorphScreenshots`); model weights cached in IndexedDB |

## Known Issues

- **Lift-subject doesn't visibly do anything in practice yet.** The model loads, the image encodes, the status banner reaches "Press and hold a subject to lift it", but pressing on the screenshot does not produce the cyan mask overlay reliably. Possible causes to check next session: pointer-event capture on the wrapper div, coordinate transformation between display-space and reshaped model-input space, the tensor dtype/shape passed to `model.forward()`, or a silent error in the mask post-processing path.
- localStorage migration from the previous build is best-effort. Hard-reload after pulling this branch; if old ads don't survive, re-capture from the extension.
