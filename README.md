# Ad-Morph

A two-part tool for capturing, inspecting, and AI-restyling live web ads.

## Overview

**Chrome Extension** → hover over any ad on any page → click to capture its full DOM tree as structured JSON → **React Editor** opens automatically with the ad rendered as an editable canvas.

Multiple captures accumulate in the editor. Each ad can be restyled independently via direct property editing or with a natural-language AI prompt. A vision model runs automatically on each capture to produce a clean semantic element tree.

---

## Structure

```
adMorph/
├── manifest.json         # Chrome Extension MV3 manifest
├── content.js            # Injected into every page/iframe — hover highlight + DOM capture
├── background.js         # Service worker — screenshot crop, postMessage IPC, tab reuse
├── popup.html / popup.js # Extension popup — "Inspect Ad" toggle button
├── highlighter.css       # Tag label style for the hover overlay
├── icon.png              # Extension icon (128×128)
└── editor/               # React web editor (Vite + TS + Tailwind v4 + Zustand)
    └── src/
        ├── types.ts                   # AdElement + CapturedAd interfaces (incl. originalElements)
        ├── store.ts                   # Zustand store — ads, selection, undo, extraction state, screenshots
        ├── loader.ts                  # URL param + localStorage + postMessage listener + screenshot persistence
        ├── App.tsx                    # Vision extraction pipeline, re-extract on demand
        └── components/
            ├── Canvas.tsx             # Scrollable ad list, per-ad spinner, trash overlay
            ├── CanvasElement.tsx      # Single rendered element — inline edit, image swap, ghost-free rendering
            ├── Sidebar.tsx            # Properties panel, layers list, extraction banner, JSON viewer, revert
            ├── AiRefiner.tsx          # NL prompt → multi-provider LLM → patched JSON
            └── SettingsPanel/         # Provider selection (Ollama/Anthropic/OpenAI), live model dropdown
        └── lib/
            └── llm/
                ├── provider.ts        # LLMProvider interface (extractAd, refineAd, healthCheck)
                ├── factory.ts         # getProvider(settings) factory
                ├── shared.ts          # Shared prompts + JSON parse/validate helpers
                └── providers/
                    ├── ollama.ts      # Ollama — vision multimodal, num_predict:4096, format:json
                    ├── openai.ts      # OpenAI — image_url content type for vision
                    └── anthropic.ts   # Anthropic — base64 image source for vision
        └── hooks/
            ├── useOllamaModels.ts     # Debounced /api/tags fetch — reachability + model list
            ├── useProviderHealth.ts   # Periodic health check for cloud providers
            └── useSettings.ts        # Load/save settings to localStorage
```

---

## Setup

### Chrome Extension

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `adMorph/` root folder
4. Pin the **Ad-Morph Inspector** extension

### React Editor

```bash
cd editor
npm install
npm run dev      # starts at http://localhost:5173
```

---

## Usage

1. Click the **Ad-Morph Inspector** icon in Chrome and press **Inspect Ad**
2. Hover over any ad — a blue overlay highlights the detected container (innermost qualifying element)
3. Click to capture — the editor opens (or updates) at `localhost:5173`
4. The vision model runs automatically; a blue spinner shows in the sidebar while it processes
5. Click any element on the canvas to edit its properties in the sidebar
6. Use the **AI Refiner** to restyle the selected ad with a natural-language prompt
7. **Re-analyze** (↺ in Layers header) reruns vision extraction using the stored original screenshot
8. **Revert** restores the ad to its original DOM-captured elements
9. **View JSON** (⌥{} in Layers header) opens the full element JSON with copy button
10. Trash icon (above top-right of ad) removes the ad and its stored screenshot

---

## How It Works

### Capture (`content.js`)
- Injects a `position: fixed` overlay that tracks `mousemove`
- `findBestContainer()` walks up from the hovered element and returns the **innermost** qualifying container (≥2 children, ≥80×80px, <90% viewport) — prevents grabbing page wrappers
- On click: intercepts `mousedown` + `click` in capture phase to block the ad's own handlers
- Walks the full subtree, records computed styles and coordinates relative to the root element
- Resolves `blob:` URLs to base64 data URIs so they survive the tab change
- Skips `backgroundImage` on containers that have `<img>` children — prevents ghost-double rendering

### Data Handoff (`background.js` → `loader.ts`)
- `background.js` crops a `captureVisibleTab` screenshot to the ad's viewport rect via `OffscreenCanvas`
- **Existing editor tab**: injects via `chrome.scripting.executeScript` → `window.postMessage({ action: 'adMorphData', elements, screenshot })`
- **New tab**: encodes DOM data as `?data=` URL param; screenshot sent as a separate `adMorphScreenshot` postMessage after page load
- Screenshots persisted to `localStorage` (`adMorphScreenshots`) — available for re-analysis after page refresh; deleted when the ad is trashed

### Vision Extraction (`App.tsx` + `lib/llm/`)
- `runExtraction()` sends the cropped screenshot to the configured vision model (`extractAd()`)
- Only applied if the model returns >1 element — single-element results (just the root container) are rejected and original DOM elements kept
- During extraction the sidebar shows a centered spinner ("Analyzing image / Breaking the ad into editable components…"); a smaller blue banner also appears at the top for when a sidebar element is selected
- Extraction errors surface in a red banner in the sidebar showing the actual error message
- Re-extraction available any time via the ↺ button (uses the stored original screenshot)
- `originalElements` is frozen at capture time — never overwritten by extraction or AI refine

### Settings Panel
- Ollama: URL field with live reachability dot; model field becomes a dropdown populated from `/api/tags`
- OpenAI/Anthropic: API key + model text inputs with periodic health check dot

### Editor Canvas (`Canvas.tsx`)
- Each ad renders at its captured CSS pixel dimensions (`rootW × rootH` from `elements[0]`) — exact match to the extension's `viewRect`
- Canvas is clipped to that size via `overflow: hidden`; elements with negative coordinates are clipped, just like the browser does — prevents ghost backgrounds from out-of-bounds containers
- While the vision model is running, the canvas shows the raw cropped screenshot instead of the DOM elements (no more white/blank flash during extraction)
- Scales down only if the canvas is narrower than the ad; otherwise renders at 1:1
- Trash button is absolutely positioned above the ad — not in the layout flow, invisible to html2canvas
- `image` type elements render via `<img>` tag only — `backgroundImage` is suppressed to prevent ghosting

### AI Refiner (`AiRefiner.tsx` + `lib/llm/`)
- Multi-provider: **Ollama** (local, vision), **Anthropic**, **OpenAI**
- Ollama path captures an `html2canvas` screenshot of the rendered ad alongside the JSON
- Validates returned array has same length and identical IDs before applying
- Undo restores the previous full `ads[]` snapshot

### Direct Manipulation
- Click any element → floating color toolbar (background + text color)
- Double-click text/button → `contentEditable` inline edit; click away to commit
- Click image → "Swap image" file picker → replaces with local file as base64 data URI

---

## AdElement Schema

```ts
interface AdElement {
  id: string;
  type: 'text' | 'image' | 'button' | 'container';
  content: string;        // text content, image src, or empty for containers
  styles: {
    top: number;          // px, relative to root element
    left: number;
    width: number;
    height: number;
    backgroundColor: string;
    color: string;
    fontSize: string;
    fontFamily?: string;
    fontWeight?: string;
    borderRadius: string;
    backgroundImage?: string;
    opacity?: string;
    zIndex?: string;
  };
  zIndex: number;
}

interface CapturedAd {
  id: string;
  elements: AdElement[];
  originalElements: AdElement[];  // frozen at capture, never overwritten
  capturedAt: number;
}
```

---

## Tech Stack

| Layer | Tech |
|---|---|
| Extension | Chrome MV3, Vanilla JS |
| Editor | React 19, Vite 8, TypeScript |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) |
| State | Zustand |
| Icons | Lucide React |
| AI | Ollama · Anthropic · OpenAI (multi-provider, direct fetch) |
| Persistence | `localStorage` (`adMorphAds`, `adMorphScreenshots`) |
