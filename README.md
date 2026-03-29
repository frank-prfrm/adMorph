# Ad-Morph

A two-part tool for capturing, inspecting, and AI-restyling live web ads.

## Overview

**Chrome Extension** → hover over any ad on any page → click to capture its full DOM tree as structured JSON → **React Editor** opens automatically with the ad rendered as an editable canvas.

Multiple captures accumulate in the editor. Each ad can be restyled independently via direct property editing or with a natural-language AI prompt. A vision model runs automatically on each capture to produce a clean semantic element tree. Gemini uses a two-phase recursive pipeline for higher accuracy on complex ads.

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
        ├── App.tsx                    # Vision extraction pipeline, coordinate scaling, re-extract on demand
        └── components/
            ├── Canvas.tsx             # Scrollable ad list, detection view toggle, bounding boxes, trash overlay
            ├── CanvasElement.tsx      # Single rendered element — inline edit, image swap, ghost-free rendering
            ├── Sidebar.tsx            # Properties panel, background layer, layers list, re-analyze button, JSON viewer
            ├── AiRefiner.tsx          # NL prompt → multi-provider LLM → patched JSON
            └── SettingsPanel/         # Provider selector, per-provider token usage, max tokens, health check
        └── lib/
            └── llm/
                ├── provider.ts        # LLMProvider interface (extractAd, refineAd, healthCheck)
                ├── factory.ts         # getProvider(settings) factory
                ├── shared.ts          # Shared prompts (pct-based coords), pctToPixels, JSON parse helpers
                └── providers/
                    ├── ollama.ts      # Ollama — vision multimodal, num_predict:4096, format:json
                    ├── openai.ts      # OpenAI — image_url content type for vision
                    ├── anthropic.ts   # Anthropic — base64 image source for vision
                    └── gemini.ts      # Gemini — recursive deep-dive pipeline, box_2d coords, token tracking
        └── lib/storage/
            ├── settings.ts            # AppSettings (provider, models, maxTokens) — localStorage
            └── tokenUsage.ts          # Per-operation token records + totals — localStorage (future: Supabase)
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
2. Hover over any ad — a blue overlay highlights the detected container
3. Click to capture — the editor opens (or updates) at `localhost:5173`
4. The vision model runs automatically; a blue spinner shows while it processes
5. After extraction the canvas switches to **detection view** — screenshot with colored bounding boxes showing what the AI found
6. Click the **Layers** icon (top-right of ad) to toggle between detection view and rendered elements
7. Click any element (or bounding box) to edit its properties in the sidebar
8. Use the **AI Refiner** to restyle the selected ad with a natural-language prompt
9. **Re-analyze with AI** button (sidebar, when nothing selected) reruns vision extraction
10. **Re-analyze** (↺ in Layers header) also reruns using the stored original screenshot
11. **Revert** restores the ad to its original DOM-captured elements
12. **View JSON** (⌥{} in Layers header) opens the full element JSON with copy button
13. Trash icon (above top-right of ad) removes the ad and its stored screenshot

---

## How It Works

### Capture (`content.js`)
- Injects a `position: fixed` overlay that tracks `mousemove`
- `findBestContainer()` walks up from the hovered element and returns the **innermost** qualifying container (≥2 children, ≥80×80px, <90% viewport)
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
- All providers return **percentage-based coordinates** (0–100) which are converted to CSS pixels via `pctToPixels()` — robust to any image resizing the API does internally
- Only applied if the model returns >1 element — single-element results are rejected and original DOM elements kept
- `setAdElements()` always preserves `originalElements[0]` as the background layer — survives every re-extraction
- During extraction the sidebar shows a centered spinner; a smaller blue banner appears at the top

### Gemini: Recursive Deep-Dive Pipeline (`providers/gemini.ts`)
- **Phase 1** — full screenshot sent to `geminiImageModel`; returns elements with `box_2d [ymin,xmin,ymax,xmax]` (0–1000 normalized) plus a `requires_deep_dive` flag for complex regions
- **Phase 2** — elements flagged for deep dive (capped at 5) are cropped from the original screenshot using the browser Canvas API and sent back to Gemini individually in parallel
- **Phase 3** — deep-dive results (verbatim text, font details) are merged back into the Phase 1 elements before building `AdElement[]`
- Coordinate conversion: `top = (ymin/1000) * adH`, `left = (xmin/1000) * adW` (matches Python PIL math exactly)
- Text refinement uses `geminiModel`; image extraction uses `geminiImageModel` (separate models configurable in Settings)
- Token usage recorded after every API call (extraction, deep-dive, refine) to `localStorage`

### Detection View (`Canvas.tsx`)
- After extraction completes, the canvas automatically switches to detection view
- Shows the original screenshot with colored bounding boxes overlaid on each extracted element
- Box colors by type: **blue** = text · **amber** = image · **green** = button · **purple** = container
- Each box has a type label badge; selected boxes are highlighted
- **Layers toggle** (top-right of each ad) switches between detection view and rendered elements

### Background Layer
- Every ad always has a background layer (`elements[0]`) — the root container at z-index 0
- Labeled "Background" in the Layers panel with a color swatch
- Selecting it shows Background Color + Background Image (file upload or URL) in Properties
- Text-specific fields (font size/weight/color) are hidden for container types

### Settings Panel
- Provider selector: **Ollama** · **Anthropic** · **OpenAI** · **Gemini**
- Gemini has separate **text model** and **image model** fields (free-text with datalist suggestions)
- Per-provider token usage shown at the top of each provider's section
- Global **token usage progress bar** + **Max tokens** field (plan-level limit, editable)
- Ollama: URL field with live reachability dot; model dropdown from `/api/tags`
- Cloud providers: periodic health check dot

### Token Usage (`lib/storage/tokenUsage.ts`)
- Every API call records `{ timestamp, provider, model, operation, tokens }` to `localStorage`
- Operations tracked: `extraction`, `deep-dive`, `refine`
- `getTokenUsage()` returns all records + running total
- `getTokensForProvider(provider)` returns total for a specific provider
- Designed for Supabase migration: schema maps directly to a database table

### Editor Canvas (`Canvas.tsx`)
- Each ad renders at its captured CSS pixel dimensions (`rootW × rootH` from `elements[0]`)
- Canvas clipped to that size via `overflow: hidden` — prevents ghost backgrounds
- While vision model is running, shows raw screenshot (no blank flash)
- Scales down only if narrower than the ad; otherwise renders at 1:1

### AI Refiner (`AiRefiner.tsx` + `lib/llm/`)
- Multi-provider: **Ollama** (local, vision) · **Anthropic** · **OpenAI** · **Gemini**
- Validates returned array has same length and identical IDs before applying
- Undo restores the previous full `ads[]` snapshot

### Direct Manipulation
- Click any element → floating color toolbar (background + text color swatches)
- Double-click text/button → `contentEditable` inline edit; click away to commit
- Click image → "Swap image" file picker → replaces with local file as base64 data URI
- Click background layer → edit background color or upload/set background image

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
| AI | Ollama · Anthropic · OpenAI · Gemini (multi-provider, direct fetch) |
| Persistence | `localStorage` (`adMorphAds`, `adMorphScreenshots`, `admorph_settings`, `admorph_token_usage`) |
