import type { AdElement, ElementType } from '../../../types';
import { AiRefineError } from '../../../utils/openai';
import { SYSTEM_PROMPT, parseAdElements } from '../shared';
import type { LLMProvider } from '../provider';
import { recordTokenUsage } from '../../storage/tokenUsage';

const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MAX_DEEP_DIVES = 5;

// ── Prompts ───────────────────────────────────────────────────────────────────

const GEMINI_EXTRACTION_PROMPT = `Analyze this image and provide a comprehensive structural breakdown in raw JSON format. Detect all key objects, text, and UI elements.

Return exactly this JSON structure:
{
  "scene_metadata": {
    "style": "string",
    "lighting": "string",
    "color_palette": ["list"],
    "composition": "string"
  },
  "elements": [
    {
      "label": "string",
      "description": "highly detailed visual description",
      "box_2d": [ymin, xmin, ymax, xmax],
      "attributes": {"color": "string", "texture": "string", "pose": "string"},
      "text_content": "exact visible text verbatim, or empty string if none",
      "requires_deep_dive": false
    }
  ]
}

Rules:
1. Coordinates in box_2d must be normalized (0-1000).
2. Descriptions must be technical enough to reconstruct the object via Nano Banana 2.
3. Do not include any text outside the JSON block.
4. Set requires_deep_dive to true ONLY for elements that contain fine detail that cannot be resolved at full-image scale: sub-images, small or dense text blocks, logos with embedded iconography, or any element whose bounding box covers less than 10% of the image area AND contains text or iconography.
5. text_content must be the exact verbatim character sequence visible in the element. Leave as empty string for purely graphical elements.`;

const GEMINI_DEEP_DIVE_PROMPT = `You are examining a cropped region of an advertisement.

Extract every detail you can see. Return exactly this JSON structure:
{
  "text_content": "every character of text exactly as it appears, preserving line breaks with \\n",
  "description": "complete visual description: font style, font weight, letter-spacing, colors of each word/glyph, any nested icons, badges, borders, shadows, or decorative elements",
  "attributes": {
    "font_family": "inferred font family name or generic (serif/sans-serif/monospace)",
    "font_size_estimate": "relative size: small/medium/large/display",
    "primary_color": "#hexcode",
    "secondary_color": "#hexcode or empty string",
    "has_nested_icon": false
  }
}

Rules:
1. text_content must be verbatim — do not paraphrase, summarize, or omit characters.
2. If no text is present, text_content must be an empty string.
3. Do not include any text outside the JSON block.`;

// ── Internal types ────────────────────────────────────────────────────────────

interface GeminiRawElement {
  label: string;
  description: string;
  box_2d: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
  attributes?: { color?: string; texture?: string; pose?: string };
  text_content?: string;
  requires_deep_dive?: boolean;
}

interface GeminiDeepDiveResult {
  text_content: string;
  description: string;
  attributes?: {
    primary_color?: string;
    secondary_color?: string;
    has_nested_icon?: boolean;
  };
  tokens: number;
}

// ── Label → ElementType mapping ───────────────────────────────────────────────

function labelToType(label: string, description: string): ElementType {
  const t = `${label} ${description}`.toLowerCase();
  if (/button|cta|call.to.action|click/.test(t)) return 'button';
  if (/\btext\b|headline|title|body copy|caption|paragraph|typography|font|copy/.test(t)) return 'text';
  if (/photo|portrait|picture|thumbnail|icon|logo|graphic|illustration|\bimage\b/.test(t)) return 'image';
  return 'container';
}

// Fallback content extractor — pulls quoted text from description when
// text_content is absent. Used for non-Gemini providers and as a safety net.
function extractContent(type: ElementType, label: string, description: string): string {
  if (type === 'container' || type === 'image') return '';
  const match = description.match(/["""']([^"""']{1,200})["""']/);
  return match ? match[1] : label;
}

// ── Image utilities ───────────────────────────────────────────────────────────

function measureImage(base64: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = `data:image/jpeg;base64,${base64}`;
  });
}

async function cropScreenshot(
  base64: string,
  box2d: [number, number, number, number],
  imgW: number,
  imgH: number,
): Promise<string> {
  const [ymin, xmin, ymax, xmax] = box2d;
  // Mirror the Python get_crop_coordinates math exactly, with clamping
  const left   = Math.floor((Math.max(0, xmin)    / 1000) * imgW);
  const top    = Math.floor((Math.max(0, ymin)    / 1000) * imgH);
  const right  = Math.floor((Math.min(1000, xmax) / 1000) * imgW);
  const bottom = Math.floor((Math.min(1000, ymax) / 1000) * imgH);
  const cropW  = Math.max(1, right - left);
  const cropH  = Math.max(1, bottom - top);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = `data:image/jpeg;base64,${base64}`;
  });

  const canvas = document.createElement('canvas');
  canvas.width  = cropW;
  canvas.height = cropH;
  canvas.getContext('2d')!.drawImage(img, left, top, cropW, cropH, 0, 0, cropW, cropH);
  return canvas.toDataURL('image/jpeg', 0.92).replace(/^data:image\/jpeg;base64,/, '');
}

// ── Phase 1 response parser ───────────────────────────────────────────────────

function parseGeminiRaw(raw: string): { items: GeminiRawElement[]; bgColor: string } {
  const cleaned = raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new AiRefineError('Gemini returned invalid JSON during extraction.');
  }

  const items = parsed.elements as GeminiRawElement[];
  if (!Array.isArray(items) || items.length === 0) {
    throw new AiRefineError('Gemini returned no elements.');
  }

  const meta = parsed.scene_metadata as { color_palette?: string[] } | undefined;
  const candidate = meta?.color_palette?.[0] ?? '#000000';
  const bgColor = /^#[0-9a-fA-F]{3,8}$/.test(candidate) ? candidate : '#000000';

  return { items, bgColor };
}

// ── AdElement builder ─────────────────────────────────────────────────────────

function buildAdElements(
  items: GeminiRawElement[],
  adW: number,
  adH: number,
  bgColor: string,
): AdElement[] {
  const result: AdElement[] = [{
    id: 'el-0',
    type: 'container',
    content: '',
    styles: {
      top: 0, left: 0, width: adW, height: adH,
      backgroundColor: bgColor,
      color: '#ffffff',
      fontSize: '16px',
      fontWeight: '400',
      borderRadius: '0px',
      backgroundImage: '',
    },
    zIndex: 0,
  }];

  items.forEach((el, i) => {
    const [ymin, xmin, ymax, xmax] = el.box_2d ?? [0, 0, 1000, 1000];
    const top    = (ymin / 1000) * adH;
    const left   = (xmin / 1000) * adW;
    const height = Math.max(1, ((ymax - ymin) / 1000) * adH);
    const width  = Math.max(1, ((xmax - xmin) / 1000) * adW);

    const type = labelToType(el.label ?? '', el.description ?? '');

    // Prefer explicit text_content from Phase 1 (or deep-dive merge);
    // fall back to the quoted-text heuristic on description.
    const content =
      el.text_content && el.text_content.trim().length > 0
        ? el.text_content.trim()
        : extractContent(type, el.label ?? '', el.description ?? '');

    result.push({
      id: `el-${i + 1}`,
      type,
      content,
      styles: {
        top, left, width, height,
        backgroundColor: 'transparent',
        color: '#ffffff',
        fontSize: '16px',
        fontWeight: '400',
        borderRadius: '0px',
        backgroundImage: '',
      },
      zIndex: i + 1,
    });
  });

  return result;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class GeminiProvider implements LLMProvider {
  constructor(private config: { apiKey: string; model: string; imageModel: string }) {}

  async extractAd(screenshot: string, adWidth: number, adHeight: number): Promise<AdElement[]> {
    // ── Phase 1: Full-image structural extraction ─────────────────────────────
    const p1Response = await fetch(
      `${BASE}/${this.config.imageModel}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType: 'image/jpeg', data: screenshot } },
              { text: GEMINI_EXTRACTION_PROMPT },
            ],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 4096,
            temperature: 0.2,
          },
        }),
      },
    );

    if (!p1Response.ok) {
      const err = await p1Response.text();
      throw new AiRefineError(`Gemini extraction error ${p1Response.status}: ${err}`);
    }

    const p1Data = await p1Response.json();
    const p1Raw: string = p1Data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!p1Raw) throw new AiRefineError('Empty extraction response from Gemini.');

    const p1Tokens = p1Data.usageMetadata?.totalTokenCount ?? 0;
    console.log(`[adMorph] Gemini Phase 1 tokens: ${p1Tokens}`);
    recordTokenUsage({ timestamp: Date.now(), provider: 'gemini', model: this.config.imageModel, operation: 'extraction', tokens: p1Tokens });

    // ── Parse Phase 1 ────────────────────────────────────────────────────────
    const { items, bgColor } = parseGeminiRaw(p1Raw);

    // ── Phase 2: Deep dives for flagged elements (parallel) ───────────────────
    const imgDims = await measureImage(screenshot);

    const flaggedIndices = items
      .map((el, i) => (el.requires_deep_dive ? i : -1))
      .filter((i) => i !== -1)
      .slice(0, MAX_DEEP_DIVES);

    console.log(`[adMorph] Gemini deep dives requested: ${flaggedIndices.length}`);

    let totalDeepDiveTokens = 0;

    const diveResults = await Promise.all(
      flaggedIndices.map(async (idx) => {
        try {
          const crop = await cropScreenshot(screenshot, items[idx].box_2d, imgDims.width, imgDims.height);
          const result = await this.runDeepDive(crop);
          return { idx, result };
        } catch {
          return { idx, result: null };
        }
      }),
    );

    // ── Phase 3: Merge deep-dive results into items ───────────────────────────
    for (const { idx, result } of diveResults) {
      if (!result) continue;
      totalDeepDiveTokens += result.tokens;

      if (result.text_content?.trim()) {
        items[idx].text_content = result.text_content.trim();
      }
      if (result.description?.trim()) {
        items[idx].description = `${items[idx].description} [deep-dive: ${result.description.trim()}]`;
      }
    }

    if (totalDeepDiveTokens > 0) {
      recordTokenUsage({ timestamp: Date.now(), provider: 'gemini', model: this.config.imageModel, operation: 'deep-dive', tokens: totalDeepDiveTokens });
    }
    console.log(`[adMorph] Gemini deep-dive tokens: ${totalDeepDiveTokens}`);
    console.log(`[adMorph] Gemini grand total tokens: ${p1Tokens + totalDeepDiveTokens}`);

    return buildAdElements(items, adWidth, adHeight, bgColor);
  }

  private async runDeepDive(croppedBase64: string): Promise<GeminiDeepDiveResult | null> {
    try {
      const res = await fetch(
        `${BASE}/${this.config.imageModel}:generateContent?key=${this.config.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { inlineData: { mimeType: 'image/jpeg', data: croppedBase64 } },
                { text: GEMINI_DEEP_DIVE_PROMPT },
              ],
            }],
            generationConfig: {
              responseMimeType: 'application/json',
              maxOutputTokens: 1024,
              temperature: 0.1,
            },
          }),
        },
      );

      if (!res.ok) return null;

      const data = await res.json();
      const raw: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) return null;

      const tokens: number = data.usageMetadata?.totalTokenCount ?? 0;
      const parsed = JSON.parse(
        raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim(),
      );
      return { ...parsed, tokens };
    } catch {
      return null;
    }
  }

  async refineAd(elements: AdElement[], userRequest: string): Promise<AdElement[]> {
    const response = await fetch(
      `${BASE}/${this.config.model}:generateContent?key=${this.config.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{
            parts: [{
              text: `Current ad JSON:\n${JSON.stringify(elements, null, 2)}\n\nUser request: ${userRequest}\n\nReturn the modified array wrapped in {"elements": [...]}`,
            }],
          }],
          generationConfig: {
            responseMimeType: 'application/json',
            maxOutputTokens: 4096,
            temperature: 0.7,
          },
        }),
      },
    );

    if (!response.ok) {
      const err = await response.text();
      throw new AiRefineError(`Gemini API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const raw: string | undefined = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new AiRefineError('Empty response from Gemini.');

    const refineTokens = data.usageMetadata?.totalTokenCount ?? 0;
    recordTokenUsage({ timestamp: Date.now(), provider: 'gemini', model: this.config.model, operation: 'refine', tokens: refineTokens });

    return parseAdElements(raw, elements, 'Gemini');
  }

  async healthCheck(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      const res = await fetch(
        `${BASE}/${this.config.model}:generateContent?key=${this.config.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: 'ping' }] }],
            generationConfig: { maxOutputTokens: 1 },
          }),
        },
      );
      return res.ok || res.status === 400;
    } catch {
      return false;
    }
  }
}
