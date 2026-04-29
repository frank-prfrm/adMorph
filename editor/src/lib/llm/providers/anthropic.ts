import type { AdElement } from '../../../types';
import { AiRefineError } from '../../../utils/openai';
import { SYSTEM_PROMPT, EXTRACTION_SYSTEM_PROMPT, SCENE_EXTRACTION_PROMPT, parseAdElements, parseExtractedElements, parseSceneElements, pctToPixels } from '../shared';
import type { ExtractionPromptId } from '../shared';
import type { LLMProvider, ExtractionResult } from '../provider';

export class AnthropicProvider implements LLMProvider {
  constructor(private config: { apiKey: string; model: string; promptId?: ExtractionPromptId }) {}

  async extractAd(screenshot: string, adWidth: number, adHeight: number): Promise<ExtractionResult> {
    const useScene = this.config.promptId === 'scene';
    const systemPrompt = useScene ? SCENE_EXTRACTION_PROMPT : EXTRACTION_SYSTEM_PROMPT;
    const userText = useScene
      ? 'Analyze this advertisement image and return the exhaustive scene JSON as instructed. Output ONLY the JSON object — no prose, no markdown fences.'
      : `The advertisement is ${adWidth}×${adHeight} pixels. Analyze it and return the element JSON as instructed. Output ONLY the JSON object — no prose, no markdown fences.`;

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
        max_tokens: useScene ? 32768 : 4096,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: screenshot },
              },
              { type: 'text', text: userText },
            ],
          },
          // Prefill the assistant turn with `{` so Claude is forced to start its
          // response inside a JSON object — eliminates prefatory chatter and
          // markdown fences. We re-add the `{` before parsing.
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

    console.group(`[Anthropic extractAd] response (mode=${useScene ? 'scene' : 'elements'})`);
    console.log('stop_reason:', data.stop_reason);
    console.log('usage:', data.usage);
    console.log('completion length (chars):', rawCompletion?.length ?? 0);
    console.log('completion (first 800):', rawCompletion?.slice(0, 800));
    console.log('completion (last 400):', rawCompletion?.slice(-400));
    console.groupEnd();

    if (!rawCompletion) throw new AiRefineError('Empty extraction response from Anthropic.');

    // Re-attach the prefilled `{` so the parser sees a complete JSON object.
    const raw = '{' + rawCompletion;

    if (data.stop_reason === 'max_tokens') {
      throw new AiRefineError(
        `Anthropic response truncated (max_tokens=${useScene ? 32768 : 4096} reached). The scene schema is very large — try Element Extractor instead, or raise max_tokens.`
      );
    }

    try {
      const elements = useScene
        ? parseSceneElements(raw, 'Anthropic')
        : parseExtractedElements(raw, 'Anthropic');
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
