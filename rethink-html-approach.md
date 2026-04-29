# Rethink: HTML/CSS Recreation Instead of Bounding-Box Extraction

## Context

Current state: vision-LLMs (Claude, GPT-4, Gemini) produce inaccurate bounding boxes for ad elements. Both `Element Extractor` and `Scene Descriptor` modes have the same fundamental issue — the LLM does the spatial reasoning, and it isn't precise enough. Box convention prompts (top-left, normalized 0–1, two decimals) help but don't fix it. We've tightened the prompt, the parser, and the error handling, and the boxes still drift. This isn't a prompt-tuning problem; it's the wrong job for the model.

The user's proposal: have the LLM recreate the ad as HTML/CSS instead of extracting bounding boxes.

## The Core Insight

The current pipeline asks the LLM to be a *spatial reasoner*: "look at this image and tell me each element's coordinates." Vision LLMs are bad at this — they hallucinate boxes, miss elements, treat `x,y` inconsistently across objects.

The HTML/CSS approach asks the LLM to be a *recreator*: "build markup that looks like this image." Vision LLMs are **excellent** at this (v0.dev, screenshot-to-code, GPT-4V's documented strengths).

Critically, once we have rendered HTML, **the browser computes bounding boxes for free** via `getBoundingClientRect()`. We get accurate boxes without ever asking the LLM for one.

## Pros of HTML/CSS Recreation

1. **Plays to LLM strengths.** Image-to-code is well-trodden; image-to-bbox is not.
2. **Accurate boxes by construction.** Browser layout > LLM spatial reasoning. Detection-overlay boxes derived from the rendered DOM will match the ad pixel-for-pixel.
3. **Higher fidelity for typography and spacing.** Real fonts, real line-height, real padding — not approximated by a box that gets a font slapped into it.
4. **Editing is semantic.** A real `<button>` is a button. A `<h1>` is a headline. Refinement can target tags and attributes, not array indices.
5. **No coordinate-convention ambiguity.** No "is x the center or top-left" debates.
6. **Existing canvas already does absolute positioning at native scale, then `transform: scale()`** (`Canvas.tsx:167-180`). HTML/CSS that uses absolute positioning slots in cleanly.

## Cons / Real Risks

1. **Major rewrite of the data model.** `AdElement[]` and the properties panel built around `AdElementStyles` (`Sidebar.tsx:136-252`) are deeply load-bearing. Layers list, undo/refine, raw-JSON viewer, Objects tab — all assume the array shape.
2. **Image content (photos, logos) can't be HTML.** A photo of a person in the ad has to come from somewhere — original screenshot crop as `background-image`, AI-generated replacement, or placeholder. This is an unsolved sub-problem.
3. **Refine identity becomes harder.** Today refine enforces same-length, same-IDs (`shared.ts:433-445`). With HTML, "same element across edits" needs `data-role` or stable selectors instead of array index.
4. **Sandbox required.** Injecting LLM-generated CSS into the editor risks Tailwind class collisions and global-style leaks. Needs **shadow DOM** or an iframe.
5. **Higher token cost per extraction.** Verbose HTML + CSS uses more tokens than a tight JSON elements array.
6. **Brand fonts may not render.** Ads use custom fonts; LLM falls back to generic. Visual fidelity drops unless we ship a font-detection step.
7. **Background-layer guarantee dies in its current form.** `setAdElements()` always prepending `originalElements[0]` (`store.ts:106-110`) doesn't translate. Need a different "the ad's frame is sacred" mechanism.

## Recommended Approach: Hybrid HTML/CSS + Post-Render Measurement

Not pure HTML/CSS. Not the current bbox approach. The hybrid:

**Extraction (LLM):**
- Prompt: "Recreate this ad as a single self-contained `<div class='ad-root' style='position:relative; width:Wpx; height:Hpx'>` with inline `<style>` for everything inside. Use absolute positioning. Tag every meaningful element with `data-role` (e.g., `headline`, `subhead`, `cta-button`, `logo`, `hero-image`, `engagement-badge`). For photographic content, use `<div data-role='hero-image' data-image-source='preserve'>` — the editor will fill it from the original screenshot crop."
- LLM returns one HTML string. No bounding boxes anywhere.

**Rendering:**
- Mount HTML inside a **shadow DOM** attached to the `AdBlock` native-space div. Shadow DOM isolates styles from Tailwind/editor.
- For elements marked `data-image-source='preserve'`, the renderer reads their `getBoundingClientRect()` AFTER initial layout, crops the corresponding region from the original screenshot, and sets it as `background-image`. This solves the "photo content" problem.

**Layers panel:**
- Query shadow root for `[data-role]` elements at render time. Build a layers list from real DOM, not from a stored array. List entries reference DOM nodes, not array indices.
- Click a layer → highlight via shadow DOM (outline overlay). Same for selection.

**Detection view:**
- Iterate `[data-role]` elements, `getBoundingClientRect()` each, draw overlay boxes on the screenshot. **These boxes are exact** because they come from layout, not the LLM.

**Refine flow:**
- Send full HTML + CSS string + user request to Claude. Receive new HTML/CSS. Diff `data-role` set to detect added/removed elements. Re-mount in shadow DOM.
- Identity is `data-role` value (e.g., `cta-button`), not array index. Drift is bounded — refine prompts insist roles persist unless explicitly added/removed.

**Storage:**
- `ad.html: string` replaces `ad.elements: AdElement[]`.
- `ad.originalHtml: string` replaces `ad.originalElements`.
- Undo/redo snapshots HTML strings — simpler than the current array-snapshot dance.

**Backwards-compat:**
- The extension's DOM capture (content.js) already produces a *kind of* AdElement[] from real DOM. We can convert that to HTML at the editor's loader and treat it as a first-pass "skeleton" before the LLM recreates it. Or just discard the DOM capture once HTML mode lands — the screenshot is the only thing that matters for recreation.

## Why This Is The Right Call

- We stop fighting LLM spatial reasoning.
- Detection overlays become *correct* (browser-computed) instead of *approximate*.
- Editing model becomes semantic (`role=headline`) instead of positional (`elements[3]`).
- The hybrid keeps the canvas's existing `transform: scale()` rendering and just changes what's inside the AdBlock.

## Critical Files (touch list, no changes yet)

- `editor/src/types.ts` — add HTML-mode types (`AdHtml`, etc.) alongside legacy `AdElement` for migration.
- `editor/src/store.ts` — `ads[].html`, `ads[].originalHtml`. Replace `setAdElements` with `setAdHtml`. Adapt re-extract / detection signals.
- `editor/src/lib/llm/shared.ts` — new `HTML_RECREATION_PROMPT`. Drop scene/element parsers in time, but keep them while migrating.
- `editor/src/lib/llm/provider.ts` — `extractAd` returns `{ html, rawText }` instead of `{ elements, rawJson }`.
- `editor/src/lib/llm/providers/anthropic.ts` (and `openai.ts`, `gemini.ts`) — return HTML, not arrays.
- `editor/src/components/Canvas.tsx` + `CanvasElement.tsx` — replace per-element rendering with shadow-DOM mount of `ad.html`. Add post-render `data-image-source='preserve'` resolver.
- `editor/src/components/Sidebar.tsx` — Layers list reads from shadow DOM `[data-role]`. Properties panel becomes a generic "edit attributes / inline styles of selected node" instead of a hardcoded `AdElementStyles` form.
- `editor/src/components/AiRefiner.tsx` — refine sends/receives HTML.

## Reuse Where Possible

- The screenshot pipeline (extension → `adScreenshots` localStorage → `App.tsx` postMessage handler) is unchanged.
- `transform: scale()` and `AdBlock` overflow clipping (`Canvas.tsx:163`) work as-is.
- Token-usage accounting (`tokenUsage.ts`) works as-is — just records `operation: 'html-extract'`.
- Health checks, settings panel, provider radio — unchanged.
- Background.js / content.js untouched.

## Verification Plan (when implemented)

1. Capture an ad from a real page with the extension.
2. Run extraction. Observe rendered shadow DOM in dev tools (`#document-fragment`).
3. Open Layers panel — confirm one entry per `data-role`.
4. Toggle detection view. Boxes should align with the screenshot pixel-for-pixel (because they're now browser-computed).
5. Click a layer (e.g., `cta-button`) — confirm shadow-DOM outline appears on the right element.
6. AI Refine: "make the headline red". Confirm the `[data-role='headline']` text turns red and other elements are untouched.
7. Undo. Confirm prior HTML restored.
8. Re-extract. Confirm `ad.html` replaced cleanly without losing original screenshot.

## Migration Strategy

Land in two PRs:

1. **PR A (foundation):** introduce HTML mode behind a settings flag (`extractionMode: 'bbox' | 'html'`). Both modes coexist. Anthropic provider gains an `extractAdAsHtml()` method. Canvas branches on mode. Layers panel branches on mode.
2. **PR B (cleanup):** once HTML mode is proven, remove `AdElement[]` path, `parseSceneElements`, `parseExtractedElements`, scene/element prompts, Objects tab, properties panel's hardcoded fields. Net deletion >> net addition.

## What I'd Want To Confirm Before Coding

- Is fidelity-to-original-pixels the goal, or is "looks like the same ad, semantically editable" enough? The hybrid can do either, but the prompt and post-render image step differ.
- For the photo content (faces, products): is "crop and reuse the original screenshot region" acceptable, or do you want to eventually swap in AI-generated replacements? Current proposal does the former.
- Are you OK with shadow DOM as the rendering host? It's the right tool but adds one layer of indirection when debugging styles in dev tools.

---

## Status — PR A landed (commit `1026209` on `anthropic` branch)

### What's in
- `extractionMode: 'bbox' | 'html'` settings flag with radio toggle in Settings panel.
- `HTML_RECREATION_PROMPT` instructing Claude to output one `<div class="ad-root">` with absolute positioning, inline styles, `data-role` attributes, and `data-image-source="preserve"` markers for photo content.
- `AnthropicProvider.extractAdAsHtml()` via tool-use (`submit_ad_html` with a single `html` string parameter); 16k max_tokens.
- `CapturedAd` gains optional `html` / `originalHtml`. New `setAdHtml` store action.
- `App.tsx` `runExtraction` branches on mode; HTML path stores `ad.html`.
- `ShadowAdMount` component mounts the LLM HTML in a shadow DOM at native ad size, fills `data-image-source="preserve"` boxes by cropping the original screenshot via CSS background positioning, and reports measured `[data-role]` rects up.
- `Canvas.tsx` renders `ShadowAdMount` when `ad.html` exists. Detection view in HTML mode overlays the browser-measured role boxes on the screenshot.

### What was validated
On a real Policygenius capture: the role boxes derived from `getBoundingClientRect()` on Claude's HTML lined up pixel-for-pixel with the actual ad elements (logo over logo, button over button, family-photo box over the family photo, disclaimer over disclaimer). The core thesis — "let the browser compute boxes from a faithful HTML recreation" — works.

### What's NOT in PR A (deferred)
- **Layers panel** still reads from `ad.elements` — empty in HTML mode. Needs to enumerate `[data-role]` from the shadow root.
- **Properties panel** — no editing UI for HTML-mode selections yet.
- **Click-to-select** in the shadow DOM with outline highlight — not wired.
- **AI Refine** — still operates on `AdElement[]`; HTML refine (send HTML + request, receive new HTML, diff `data-role`s) is unbuilt.
- **Undo/redo** — current `previousAds` snapshot does include HTML, but the undo path was only tested on bbox mode.
- **OpenAI / Gemini** — no `extractAdAsHtml` implementation; selecting HTML mode with them throws a clear error.
- **Refresh / persistence edge cases** — `saveStoredAds` serializes the HTML string into localStorage. Quota is finite; large recreations could push toward the 5–10 MB limit.

### Open risks observed
- The fidelity of Claude's rendered HTML *without* the screenshot overlay hasn't been carefully evaluated yet — when detection view is off, do you see a faithful recreation or a Claude-style approximation? Need to confirm before building UI on top.
- `data-image-source="preserve"` cropping depends on Claude positioning the preserve element where the photo actually is. If Claude's positioning drifts even with browser layout, the crop drifts with it.
- Brand fonts: Claude falls back to generic families. Visual fidelity drops on typography-heavy ads.

### Next concrete steps
1. Confirm rendered-HTML fidelity (toggle detection off, inspect what shadow DOM produced).
2. Layers panel reads `[data-role]` from shadow root; click → outline overlay on the matching node.
3. Inline-style editor for selected shadow node (replace the hardcoded `AdElementStyles` form).
4. Refine flow: send `ad.html` + user request to Claude via a tool with one `html` output; accept `data-role` continuity.
5. Once HTML mode is the default, PR B deletes the bbox path: `parseSceneElements`, `parseExtractedElements`, the scene/element prompts, the Objects tab, and the per-element rendering in Canvas.

### Friction
The user's frustration at end of session was not with the architecture — the architecture works — but with the iteration cost of getting here. Lots of dead-end attempts (image upscaling, prompt tightening, schema constraints) before pivoting to HTML. The HTML pivot itself was the right call; it just took too long to commit to.
