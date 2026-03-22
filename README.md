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
├── background.js         # Service worker — encodes captured data, opens/reuses editor tab
├── popup.html / popup.js # Extension popup — "Inspect Ad" toggle button
├── highlighter.css       # Tag label style for the hover overlay
├── icon.png              # Extension icon (128×128)
└── editor/               # React web editor (Vite + TS + Tailwind v4 + Zustand)
    └── src/
        ├── types.ts                   # AdElement + CapturedAd interfaces
        ├── store.ts                   # Zustand store — ads[], selection, undo
        ├── loader.ts                  # Reads ?data= URL param + localStorage
        └── components/
            ├── Canvas.tsx             # Scrollable list of ad canvases
            ├── CanvasElement.tsx      # Single rendered element (text/image/button/container)
            ├── Sidebar.tsx            # Click-to-edit properties + layers panel
            └── AiRefiner.tsx         # NL prompt → OpenAI gpt-4o → patched JSON
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
- Captured JSON is base64-encoded and passed as a `?data=` URL parameter
- `background.js` reuses an existing editor tab (reloads it) rather than opening a new one
- `loader.ts` reads the URL param, appends the new ad to `localStorage`, clears the param, then returns all accumulated ads

### Editor Canvas (`Canvas.tsx`)
- Each ad renders at its **actual captured dimensions** (from `elements[0].styles.width/height`), not a hardcoded 1080×1080
- Scaled to fit the panel width via CSS `transform: scale()`
- `overflow: hidden` clips any elements captured outside the root bounds

### AI Refiner (`AiRefiner.tsx` + `utils/openai.ts`)
- Calls `gpt-4o` directly from the browser with `response_format: { type: "json_object" }`
- System prompt explicitly forbids changing `id`, `top`, `left`, `width`, `height`, or `zIndex` — only content and visual styles are modified
- Validates that the returned array has the same length and identical IDs before applying
- Undo restores the previous full `ads[]` snapshot

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
| AI | OpenAI `gpt-4o` (direct fetch, browser-side) |
| Persistence | `localStorage` (`adMorphAds`) |
