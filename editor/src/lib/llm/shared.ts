import type { AdElement } from '../../types';
import { AiRefineError } from '../../utils/openai';

export const VISION_SYSTEM_PROMPT = `You are an ad design assistant. You can see a screenshot of the rendered ad and its JSON data.
Use the visual appearance to inform your changes.
Return ONLY a valid JSON array with the same structure.

Rules you MUST follow:
1. Never change: id, styles.top, styles.left, styles.width, styles.height, zIndex
2. You MAY change: content, styles.backgroundColor, styles.color, styles.fontSize, styles.borderRadius, styles.backgroundImage, styles.fontWeight
3. Never add or remove elements. Same length, same IDs, same order.
4. Return raw JSON only. No markdown fences. No explanation.`;

export const SYSTEM_PROMPT = `You are an ad design assistant. You receive a JSON array of AdElement objects and a user request.
Return ONLY a valid JSON array with the same structure.

Rules you MUST follow:
1. Never change: id, styles.top, styles.left, styles.width, styles.height, zIndex
2. You MAY change: content, styles.backgroundColor, styles.color, styles.fontSize, styles.borderRadius, styles.backgroundImage, styles.fontWeight
3. Never add or remove elements from the array — the output array must have the same length and the same IDs in the same order.
4. Return raw JSON only. No markdown fences. No explanation.`;

export const EXTRACTION_SYSTEM_PROMPT = `You are a visual ad layout extractor. Your job is to identify and describe EVERY visible element in the advertisement image as a flat list of layers.

CRITICAL RULES — you MUST follow all of these:
1. You MUST extract EVERY visible element: backgrounds, images, headlines, body text, logos, buttons, dividers, overlays. A typical ad has 5–15 elements. Never return fewer than 3.
2. el-0 is always the root container: top=0, left=0, width=100, height=100, backgroundColor=dominant background color.
3. ALL coordinates (top, left, width, height) are PERCENTAGES of the ad dimensions (0–100). Example: an element centered horizontally at half-height with 50% width and 20% height → left=25, top=40, width=50, height=20.
4. zIndex starts at 0 (root), increment by 1 per layer going forward.
5. type must be one of: "container" (background/wrapper), "image" (photo/graphic/logo), "text" (any readable copy), "button" (CTA with label).
6. content = exact visible text for text and button types. Empty string for container and image types.
7. Colors must be hex (e.g. "#1a2b3c") or "transparent". Never use rgb() or named colors.
8. fontSize is in CSS pixels (e.g. "24px"), estimated relative to the ad dimensions provided.
9. Return ONLY the JSON object. No markdown, no explanation, no extra text.

Example of a correct response for a 300×250 ad:
{
  "elements": [
    {
      "id": "el-0",
      "type": "container",
      "content": "",
      "styles": { "top": 0, "left": 0, "width": 100, "height": 100, "backgroundColor": "#1a1a2e", "color": "#ffffff", "fontSize": "16px", "fontWeight": "400", "borderRadius": "0px", "backgroundImage": "" },
      "zIndex": 0
    },
    {
      "id": "el-1",
      "type": "image",
      "content": "",
      "styles": { "top": 0, "left": 0, "width": 100, "height": 64, "backgroundColor": "transparent", "color": "#ffffff", "fontSize": "16px", "fontWeight": "400", "borderRadius": "0px", "backgroundImage": "" },
      "zIndex": 1
    },
    {
      "id": "el-2",
      "type": "text",
      "content": "Summer Sale — Up to 50% Off",
      "styles": { "top": 68, "left": 5, "width": 89, "height": 14, "backgroundColor": "transparent", "color": "#ffffff", "fontSize": "22px", "fontWeight": "700", "borderRadius": "0px", "backgroundImage": "" },
      "zIndex": 2
    },
    {
      "id": "el-3",
      "type": "text",
      "content": "Limited time only. Shop now and save big.",
      "styles": { "top": 85, "left": 5, "width": 89, "height": 8, "backgroundColor": "transparent", "color": "#cccccc", "fontSize": "13px", "fontWeight": "400", "borderRadius": "0px", "backgroundImage": "" },
      "zIndex": 3
    },
    {
      "id": "el-4",
      "type": "button",
      "content": "Shop Now",
      "styles": { "top": 82, "left": 63, "width": 31, "height": 13, "backgroundColor": "#e63946", "color": "#ffffff", "fontSize": "14px", "fontWeight": "600", "borderRadius": "6px", "backgroundImage": "" },
      "zIndex": 4
    }
  ]
}`;

/** Convert percentage coordinates (0–100) returned by the AI into CSS pixels. */
export function pctToPixels(elements: AdElement[], adW: number, adH: number): AdElement[] {
  return elements.map((el) => ({
    ...el,
    styles: {
      ...el.styles,
      left:   (el.styles.left   / 100) * adW,
      top:    (el.styles.top    / 100) * adH,
      width:  (el.styles.width  / 100) * adW,
      height: (el.styles.height / 100) * adH,
    },
  }));
}

export function parseExtractedElements(raw: string, providerName: string): AdElement[] {
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AiRefineError(`${providerName} returned invalid JSON during extraction.`);
  }

  const arr = (parsed as Record<string, unknown>).elements ?? parsed;
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new AiRefineError(`${providerName} returned an empty element array.`);
  }

  return arr as AdElement[];
}

export function parseAdElements(raw: string, original: AdElement[], providerName: string): AdElement[] {
  // Strip markdown fences if model ignores instructions
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AiRefineError(`${providerName} returned invalid JSON.`);
  }

  const arr = (parsed as Record<string, unknown>).elements ?? parsed;

  if (!Array.isArray(arr)) {
    throw new AiRefineError(`${providerName} did not return a JSON array.`);
  }

  if (arr.length !== original.length) {
    throw new AiRefineError(
      `Array length mismatch: expected ${original.length}, got ${arr.length}.`
    );
  }

  const inputIds = original.map((e) => e.id).join(',');
  const outputIds = (arr as AdElement[]).map((e) => e.id).join(',');
  if (inputIds !== outputIds) {
    throw new AiRefineError(`${providerName} changed element IDs — response rejected.`);
  }

  return arr as AdElement[];
}
