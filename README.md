# Ad-Morph

A two-part tool for capturing, inspecting, and AI-restyling live web ads.

## Overview

**Chrome Extension** → hover over any ad on any page → click to capture its full DOM tree as structured JSON → **React Editor** opens automatically with the ad rendered as an editable canvas.

Multiple captures accumulate in the editor. Each ad can be restyled independently via direct property editing or with a natural-language AI prompt.

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
        ├── types.ts                   # AdElement + CapturedAd interfaces
        ├── store.ts                   # Zustand store — ads[], selection, undo, extractingAdIds
        ├── loader.ts                  # Reads ?data= URL param + localStorage + postMessage listener
        ├── App.tsx                    # Vision extraction pipeline, postMessage handlers
        └── components/
            ├── Canvas.tsx             # Scrollable list of ad canvases, per-ad spinner overlay
            ├── CanvasElement.tsx      # Single rendered element — inline edit, image swap
            ├── Sidebar.tsx            # Click-to-edit properties + layers panel
            ├── AiRefiner.tsx          # NL prompt → multi-provider LLM → patched JSON
            └── SettingsPanel/         # Provider selection (Ollama/Anthropic/OpenAI) + API keys
        └── lib/
            └── llm/
                ├── provider.ts        # LLMProvider interface (extractAd, refineAd, healthCheck)
                ├── factory.ts         # getProvider(settings) factory
                ├── shared.ts          # Shared prompts + JSON parse/validate helpers
                └── providers/
                    ├── ollama.ts      # Ollama — vision multimodal (images[]) + text fallback
                    ├── openai.ts      # OpenAI — image_url content type for vision
                    └── anthropic.ts   # Anthropic — base64 image source for vision
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
2. Hover over any ad on a webpage — a blue overlay highlights the detected container
3. Click the ad to capture it — the editor opens (or reloads) at `localhost:5173`
4. **Multiple captures accumulate** — each new capture appends below previous ones
5. Click any element on the canvas to edit its properties in the sidebar
6. Use the **AI Refiner** to restyle the selected ad with a natural-language prompt
7. Click the **trash icon** beside any ad to remove it

---

## How It Works

### Capture (`content.js`)
- Injects a `position: fixed` overlay that tracks `mousemove`
- `findBestContainer()` walks up the DOM from the hovered element to find a meaningful container (≥2 children, ≥80px bounds) — prevents capturing bare `<img>` elements
- On click: intercepts `mousedown` + `click` in capture phase with `stopImmediatePropagation` to block the ad's own navigation handlers
- Walks the full subtree with `querySelectorAll('*')`, records computed styles and coordinates **relative to the root element**
- Resolves `blob:` image URLs to base64 data URIs so they survive the tab change

### Data Handoff (`background.js` → `loader.ts`)
- `background.js` calls `chrome.tabs.captureVisibleTab` before navigating, then crops the screenshot to the ad's viewport rect via `OffscreenCanvas`
- **Existing editor tab**: injects via `chrome.scripting.executeScript` → `window.postMessage({ action: 'adMorphData', elements, screenshot })`
- **New tab**: encodes DOM data as `?data=` URL param; screenshot sent as a separate `adMorphScreenshot` postMessage after the page loads
- `loader.ts` treats a `?data=` param as a fresh session (resets localStorage to just the new ad, no bleed-in from previous session)
- `loader.ts` exposes `registerPostMessageListener` — called in `App.tsx` to receive live captures without a page reload

### Vision Extraction (`App.tsx` + `lib/llm/`)
- When a screenshot arrives with a new ad, `runExtraction()` sends it to the configured vision model (`extractAd()`)
- The model returns `AdElement[]` with pixel-accurate bounding boxes, replacing the DOM-derived preview elements
- An animated spinner overlay is shown per-ad while extraction is in progress (`extractingAdIds` in store)
- Extraction failure is non-fatal — DOM elements remain as fallback

### Editor Canvas (`Canvas.tsx`)
- Each ad renders at its **actual captured dimensions** (from `elements[0].styles.width/height`), not a hardcoded 1080×1080
- Scaled to fit the panel width via CSS `transform: scale()`
- Outer clip-box has `overflow: hidden` so the scaled div never bleeds outside its display bounds
- Negative-coordinate elements (captured above/left of root) are shifted into view via an offset wrapper

### AI Refiner (`AiRefiner.tsx` + `lib/llm/`)
- Multi-provider: **Ollama** (local, vision-capable), **Anthropic**, **OpenAI** — selected in Settings panel
- Ollama path captures an `html2canvas` screenshot of the rendered ad and passes it as a base64 image alongside the JSON
- System prompt forbids changing `id`, `top`, `left`, `width`, `height`, or `zIndex` — only content and visual styles are modified
- Validates that the returned array has the same length and identical IDs before applying
- Undo restores the previous full `ads[]` snapshot

### Direct Manipulation
- Click any element to select it → floating color toolbar appears (background color + text color for text/button elements)
- Double-click text/button → `contentEditable` inline edit mode; press Enter or click away to commit
- Click an image element → "Swap image" file picker → swaps with a local file as a base64 data URI

---

## AdElement Schema

```ts
interface AdElement {
  id: string;
  type: 'text' | 'image' | 'button' | 'container';
  content: string;        // text content or image src
  styles: {
    top: number;          // relative to root element (px)
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
| Persistence | `localStorage` (`adMorphAds`) |
