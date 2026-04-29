import type { AdElement } from '../../../types';
import { AiRefineError } from '../../../utils/openai';
import { SYSTEM_PROMPT, EXTRACTION_SYSTEM_PROMPT, SCENE_EXTRACTION_PROMPT, parseAdElements, parseSceneElements, pctToPixels } from '../shared';
import type { ExtractionPromptId } from '../shared';
import type { LLMProvider, ExtractionResult } from '../provider';

const MIN_LONG_SIDE = 1500;

/**
 * Anthropic's vision docs recommend ≥1568px on the long side for best spatial
 * accuracy. Banner ads captured by the extension are typically 300×250 or
 * 728×90, far below that. Upscale via canvas before sending. No-op if the
 * image is already large enough.
 */
async function ensureMinLongSide(base64Jpeg: string, minLongSide: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const longSide = Math.max(img.width, img.height);
      if (longSide >= minLongSide) {
        resolve(base64Jpeg);
        return;
      }
      const scale = minLongSide / longSide;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(base64Jpeg); return; }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      resolve(dataUrl.split(',')[1]);
    };
    img.onerror = () => reject(new Error('Failed to decode screenshot for upscale.'));
    img.src = `data:image/jpeg;base64,${base64Jpeg}`;
  });
}

/**
 * JSON Schema describing the tool input Claude must produce in elements mode.
 * Mirrors AdElement / AdElementStyles in types.ts. Anthropic's tool-use
 * mechanism guarantees the response conforms to this schema, eliminating the
 * prefill-and-parse-text path.
 */
const SUBMIT_ELEMENTS_TOOL = {
  name: 'submit_ad_elements',
  description: 'Submit the extracted ad elements with bounding boxes and styles. Coordinates are percentages of ad dimensions (0–100).',
  input_schema: {
    type: 'object' as const,
    properties: {
      elements: {
        type: 'array',
        minItems: 3,
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'Element identifier such as "el-1".' },
            type: { type: 'string', enum: ['text', 'image', 'button', 'container'] },
            content: { type: 'string', description: 'Visible text for text/button types; empty for container/image.' },
            styles: {
              type: 'object',
              properties: {
                top: { type: 'number', minimum: 0, maximum: 100 },
                left: { type: 'number', minimum: 0, maximum: 100 },
                width: { type: 'number', minimum: 0, maximum: 100 },
                height: { type: 'number', minimum: 0, maximum: 100 },
                backgroundColor: { type: 'string', description: 'Hex color or "transparent".' },
                color: { type: 'string', description: 'Hex color.' },
                fontSize: { type: 'string', description: 'CSS pixel string e.g. "24px".' },
                fontFamily: { type: 'string', description: 'CSS font-family inferred from the rendered glyphs (e.g. "Inter, sans-serif"). Empty string if unknown.' },
                fontWeight: { type: 'string', description: 'CSS font-weight as a numeric string e.g. "400" or "700".' },
                borderRadius: { type: 'string', description: 'CSS border-radius e.g. "0px" or "6px".' },
                backgroundImage: { type: 'string', description: 'CSS background-image value or empty string.' },
              },
              required: ['top', 'left', 'width', 'height', 'backgroundColor', 'color', 'fontSize', 'fontWeight', 'borderRadius'],
            },
            zIndex: { type: 'integer', minimum: 0 },
          },
          required: ['id', 'type', 'content', 'styles', 'zIndex'],
        },
      },
    },
    required: ['elements'],
  },
};

interface ToolUseBlock { type: 'tool_use'; name: string; input: { elements?: AdElement[] } }
interface TextBlock { type: 'text'; text: string }
type ContentBlock = ToolUseBlock | TextBlock;

export class AnthropicProvider implements LLMProvider {
  constructor(private config: { apiKey: string; model: string; promptId?: ExtractionPromptId }) {}

  async extractAd(screenshot: string, adWidth: number, adHeight: number): Promise<ExtractionResult> {
    const useScene = this.config.promptId === 'scene';
    const upscaled = await ensureMinLongSide(screenshot, MIN_LONG_SIDE);

    return useScene
      ? this.extractScene(upscaled, adWidth, adHeight)
      : this.extractElements(upscaled, adWidth, adHeight);
  }

  // ── Element mode: tool-use, schema-enforced JSON ────────────────────────────
  private async extractElements(screenshot: string, adWidth: number, adHeight: number): Promise<ExtractionResult> {
    const userText = `The advertisement is ${adWidth}×${adHeight} pixels. Analyze it and call submit_ad_elements with every visible element you see.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 4096,
        system: EXTRACTION_SYSTEM_PROMPT,
        tools: [SUBMIT_ELEMENTS_TOOL],
        tool_choice: { type: 'tool', name: SUBMIT_ELEMENTS_TOOL.name },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: screenshot } },
              { type: 'text', text: userText },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new AiRefineError(`Anthropic extraction error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const blocks: ContentBlock[] = data.content ?? [];
    const toolUse = blocks.find((b): b is ToolUseBlock => b.type === 'tool_use' && b.name === SUBMIT_ELEMENTS_TOOL.name);

    console.group('[Anthropic extractAd] response (mode=elements, tool-use)');
    console.log('stop_reason:', data.stop_reason);
    console.log('usage:', data.usage);
    console.log('tool input:', toolUse?.input);
    console.groupEnd();

    if (!toolUse) {
      const textBlock = blocks.find((b): b is TextBlock => b.type === 'text');
      throw new AiRefineError(
        `Anthropic did not call submit_ad_elements. ${textBlock?.text?.slice(0, 300) ?? 'no text response'}`
      );
    }

    const elements = toolUse.input.elements;
    if (!Array.isArray(elements) || elements.length === 0) {
      throw new AiRefineError('Anthropic submit_ad_elements returned no elements.');
    }

    return {
      elements: pctToPixels(elements, adWidth, adHeight),
      rawJson: JSON.stringify(toolUse.input, null, 2),
    };
  }

  // ── Scene mode: kept on prefill path until a tool schema is designed ────────
  private async extractScene(screenshot: string, adWidth: number, adHeight: number): Promise<ExtractionResult> {
    const userText = 'Analyze this advertisement image and return the exhaustive scene JSON as instructed. Output ONLY the JSON object — no prose, no markdown fences.';

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 32768,
        system: SCENE_EXTRACTION_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: screenshot } },
              { type: 'text', text: userText },
            ],
          },
          { role: 'assistant', content: '{' },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new AiRefineError(`Anthropic extraction error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const rawCompletion = data.content?.[0]?.text;

    console.group('[Anthropic extractAd] response (mode=scene)');
    console.log('stop_reason:', data.stop_reason);
    console.log('usage:', data.usage);
    console.log('completion length (chars):', rawCompletion?.length ?? 0);
    console.log('completion (first 800):', rawCompletion?.slice(0, 800));
    console.log('completion (last 400):', rawCompletion?.slice(-400));
    console.groupEnd();

    if (!rawCompletion) throw new AiRefineError('Empty extraction response from Anthropic.');

    const raw = '{' + rawCompletion;

    if (data.stop_reason === 'max_tokens') {
      throw new AiRefineError(
        'Anthropic response truncated (max_tokens=32768 reached). The scene schema is very large — try Element Extractor instead.'
      );
    }

    try {
      const elements = parseSceneElements(raw, 'Anthropic');
      return { elements: pctToPixels(elements, adWidth, adHeight), rawJson: raw };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const head = raw.slice(0, 300).replace(/\s+/g, ' ');
      const tail = raw.slice(-300).replace(/\s+/g, ' ');
      throw new AiRefineError(`${msg} | head: ${head} | tail: ${tail}`);
    }
  }

  async refineAd(elements: AdElement[], userRequest: string, _screenshotBase64?: string): Promise<AdElement[]> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: 8192,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Current ad JSON:\n${JSON.stringify(elements, null, 2)}\n\nUser request: ${userRequest}\n\nReturn the modified array wrapped in {"elements": [...]}. Output ONLY the JSON — no prose, no markdown fences.`,
          },
          { role: 'assistant', content: '{' },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new AiRefineError(`Anthropic API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const rawCompletion = data.content?.[0]?.text;
    if (!rawCompletion) throw new AiRefineError('Empty response from Anthropic.');

    if (data.stop_reason === 'max_tokens') {
      throw new AiRefineError('Anthropic response was truncated (max_tokens reached) during refine.');
    }

    const raw = '{' + rawCompletion;
    return parseAdElements(raw, elements, 'Anthropic');
  }

  async healthCheck(): Promise<boolean> {
    return !!this.config.apiKey;
  }
}
