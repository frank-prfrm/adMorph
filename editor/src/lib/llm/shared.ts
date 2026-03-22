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

export const EXTRACTION_SYSTEM_PROMPT = `You are a visual ad layout extractor. Analyze the advertisement image and extract every visible layer.

Return ONLY valid JSON in this exact format:
{
  "elements": [
    {
      "id": "el-0",
      "type": "container",
      "content": "",
      "styles": {
        "top": 0, "left": 0, "width": 300, "height": 250,
        "backgroundColor": "#ffffff", "color": "#000000",
        "fontSize": "16px", "fontWeight": "400",
        "borderRadius": "0px", "backgroundImage": ""
      },
      "zIndex": 0
    }
  ]
}

Rules:
1. el-0 MUST be the root container: top=0, left=0, width=full ad width, height=full ad height
2. Coordinates are pixels measured from the ad image's top-left corner
3. zIndex = layer order, 0 = bottom; increment per layer
4. type: "container" for backgrounds/wrappers, "text" for readable copy, "image" for photos/graphics, "button" for CTAs
5. content = exact visible text for text/button; empty string for everything else
6. backgroundColor and color = hex (e.g. "#1a2b3c") or "transparent"
7. fontSize includes unit (e.g. "24px")
8. Return NO markdown, NO explanation — only the JSON object.`;

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
