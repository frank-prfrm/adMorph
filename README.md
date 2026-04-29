# Ad-Morph

A two-part tool for capturing, inspecting, and AI-restyling live web ads.

## Overview

**Chrome Extension** → hover over any ad on any page → click to capture its full DOM tree as structured JSON → **React Editor** opens automatically with the ad rendered as an editable canvas.

Multiple captures accumulate in the editor. Each ad can be restyled independently via direct property editing or with a natural-language AI prompt. A vision model runs automatically on each capture.

Two extraction modes live behind a settings toggle:
- **Bounding boxes** (legacy): the model returns `AdElement[]` with absolute coords. Editable layers list. Box accuracy depends entirely on the model's spatial reasoning — found to be unreliable on small banner ads.
- **HTML recreation** (experimental, PR A): the model rebuilds the ad as a self-contained HTML/CSS fragment. Mounted in a shadow DOM at native ad size; bounding boxes are derived from the rendered layout via `getBoundingClientRect()` so detection-overlay boxes are pixel-accurate by construction.

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
        ├── types.ts                   # AdElement + CapturedAd (with optional html / originalHtml for HTML mode)
        ├── store.ts                   # Zustand store — ads, selection, undo, extraction state, screenshots, setAdHtml
        ├── loader.ts                  # URL param + localStorage + postMessage listener + screenshot persistence
        ├── App.tsx                    # runExtraction branches on extractionMode; bbox or html path
        └── components/
            ├── Canvas.tsx             # Scrollable ad list, detection view, bbox or shadow-DOM render
            ├── CanvasElement.tsx      # Single rendered element (bbox mode) — inline edit, image swap
            ├── ShadowAdMount.tsx      # HTML mode: mount LLM HTML in shadow DOM, fill data-image-source="preserve" boxes from screenshot crop, report measured [data-role] rects
            ├── Sidebar.tsx            # Properties panel, layers list, re-analyze button, JSON viewer (bbox mode)
            ├── AiRefiner.tsx          # NL prompt → provider.refineAd → patched JSON (bbox mode)
            └── SettingsPanel/         # Extraction mode toggle, provider selector, prompt picker, token usage
        └── lib/
            └── llm/
                ├── provider.ts        # LLMProvider interface (extractAd, optional extractAdAsHtml, refineAd, healthCheck)
                ├── factory.ts         # getProvider(settings) factory
                ├── shared.ts          # EXTRACTION/SCENE/HTML_RECREATION prompts, pctToPixels, JSON parse helpers
                └── providers/
                    ├── openai.ts      # OpenAI — image_url content type for vision
                    ├── anthropic.ts   # Anthropic — tool-use elements path, prefill scene path, extractAdAsHtml via submit_ad_html tool
                    └── gemini.ts      # Gemini — recursive deep-dive pipeline, box_2d coords, token tracking
        └── lib/storage/
            ├── settings.ts            # AppSettings (provider, models, extractionMode, maxTokens) — localStorage
            └── tokenUsage.ts          # Per-operation token records + totals — localStorage (future: Supabase)
        └── hooks/
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
- `runExtraction()` reads `settings.extractionMode` and dispatches to either `provider.extractAd()` (bbox) or `provider.extractAdAsHtml()` (HTML)
- **Bbox path**: providers return percentage-based coords (0–100) converted to CSS pixels via `pctToPixels()`. Only applied if the model returns >1 element. `setAdElements()` always preserves `originalElements[0]` as the background layer.
- **HTML path**: provider returns one self-contained `<div class="ad-root">` fragment with absolute-positioned descendants and `data-role` attributes. `setAdHtml()` stores it on the ad. `Canvas.tsx` mounts it via `ShadowAdMount` in a shadow DOM at native ad size; detection view derives boxes from `getBoundingClientRect()` on `[data-role]` elements.
- Anthropic uses **tool-use** for both element-mode (`submit_ad_elements`) and HTML-mode (`submit_ad_html`) — schema-validated input, no JSON parsing, no prefill hacks.
- Scene mode (Anthropic) still uses the prefill `{` approach with the verbose scene-descriptor schema; tool-use migration deferred while the HTML approach is being validated.
- During extraction the sidebar shows a spinner; the canvas shows the raw screenshot.

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
- **Extraction Mode** toggle: bounding boxes (legacy) vs. HTML recreation (experimental)
- **Extraction Prompt** picker (bbox mode only): Element Extractor vs. Scene Descriptor
- Provider selector: **Anthropic** · **OpenAI** · **Gemini**
- Anthropic is the default; Ollama support was removed when the Claude tool-use path landed
- Gemini has separate **text model** and **image model** fields
- Per-provider token usage; global token-usage progress bar; editable **Max tokens** field
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
- Providers: **Anthropic** · **OpenAI** · **Gemini**
- Bbox mode only — refine on HTML recreations is not yet wired up
- Validates the returned array has same length and identical IDs before applying
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
  html?: string;          // HTML mode: LLM-generated <div class="ad-root">…</div> fragment
  originalHtml?: string;  // HTML mode: snapshot at extraction time, used for revert
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
| AI | Anthropic (default, with tool-use) · OpenAI · Gemini |
| Persistence | `localStorage` (`adMorphAds`, `adMorphScreenshots`, `admorph_settings`, `admorph_token_usage`) |
