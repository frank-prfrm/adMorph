import type { AdElement } from '../../../types';
import { AiRefineError } from '../../../utils/openai';
import { SYSTEM_PROMPT, EXTRACTION_SYSTEM_PROMPT, parseAdElements, parseExtractedElements, pctToPixels } from '../shared';
import type { LLMProvider } from '../provider';

export class OpenAIProvider implements LLMProvider {
  constructor(private config: { apiKey: string; model: string }) {}

  async extractAd(screenshot: string, adWidth: number, adHeight: number): Promise<AdElement[]> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        response_format: { type: 'json_object' },
        temperature: 0.2,
        messages: [
          { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${screenshot}`, detail: 'high' },
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
      throw new AiRefineError(`OpenAI extraction error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) throw new AiRefineError('Empty extraction response from OpenAI.');

    return pctToPixels(parseExtractedElements(raw, 'OpenAI'), adWidth, adHeight);
  }

  async refineAd(elements: AdElement[], userRequest: string, _screenshotBase64?: string): Promise<AdElement[]> {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        response_format: { type: 'json_object' },
        temperature: 0.7,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `Current ad JSON:\n${JSON.stringify(elements, null, 2)}\n\nUser request: ${userRequest}\n\nReturn the modified array wrapped in {"elements": [...]}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new AiRefineError(`OpenAI API error ${response.status}: ${err}`);
    }

    const data = await response.json();
    const raw = data.choices?.[0]?.message?.content;
    if (!raw) throw new AiRefineError('Empty response from OpenAI.');

    return parseAdElements(raw, elements, 'OpenAI');
  }

  async healthCheck(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
