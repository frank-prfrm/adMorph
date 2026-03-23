import type { AdElement } from '../../../types';
import { AiRefineError } from '../../../utils/openai';
import { SYSTEM_PROMPT, EXTRACTION_SYSTEM_PROMPT, parseAdElements, parseExtractedElements } from '../shared';
import type { LLMProvider } from '../provider';

export class AnthropicProvider implements LLMProvider {
  constructor(private config: { apiKey: string; model: string }) {}

  async extractAd(screenshot: string, adWidth: number, adHeight: number): Promise<AdElement[]> {
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
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: screenshot },
              },
              {
                type: 'text',
                text: `The advertisement is ${adWidth}×${adHeight} pixels. Analyze it and return the element JSON as instructed.`,
              },
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
    const raw = data.content?.[0]?.text;
    if (!raw) throw new AiRefineError('Empty extraction response from Anthropic.');

    return parseExtractedElements(raw, 'Anthropic');
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
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Current ad JSON:\n${JSON.stringify(elements, null, 2)}\n\nUser request: ${userRequest}\n\nReturn the modified array wrapped in {"elements": [...]}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new AiRefineError(`Anthropic API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text;
    if (!raw) throw new AiRefineError('Empty response from Anthropic.');

    return parseAdElements(raw, elements, 'Anthropic');
  }

  async healthCheck(): Promise<boolean> {
    return !!this.config.apiKey;
  }
}
