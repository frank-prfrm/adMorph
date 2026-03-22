import type { AdElement } from '../../../types';
import { AiRefineError } from '../../../utils/openai';
import { SYSTEM_PROMPT, VISION_SYSTEM_PROMPT, EXTRACTION_SYSTEM_PROMPT, parseAdElements, parseExtractedElements } from '../shared';
import type { LLMProvider } from '../provider';

const MAX_RETRIES = 2;

export class OllamaProvider implements LLMProvider {
  constructor(private config: { baseUrl: string; model: string }) {}

  async extractAd(screenshot: string, adWidth: number, adHeight: number): Promise<AdElement[]> {
    const userMsg = {
      role: 'user',
      content: `The advertisement is ${adWidth}×${adHeight} pixels. Analyze it and return the element JSON as instructed.`,
      images: [screenshot],
    };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          format: 'json',
          stream: false,
          messages: [
            { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
            userMsg,
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new AiRefineError(`Ollama extraction error ${response.status}: ${err}`);
      }

      const data = await response.json();
      const raw = data.message?.content;
      if (!raw) throw new AiRefineError('Empty extraction response from Ollama.');

      try {
        return parseExtractedElements(raw, 'Ollama');
      } catch (err) {
        if (attempt === MAX_RETRIES) throw err;
      }
    }

    throw new AiRefineError('Ollama extraction failed after retries.');
  }

  async refineAd(elements: AdElement[], userRequest: string, screenshotBase64?: string): Promise<AdElement[]> {
    const systemPrompt = screenshotBase64 ? VISION_SYSTEM_PROMPT : SYSTEM_PROMPT;
    const userMsg: Record<string, unknown> = {
      role: 'user',
      content: `Current ad JSON:\n${JSON.stringify(elements, null, 2)}\n\nUser request: ${userRequest}\n\nReturn the modified array wrapped in {"elements": [...]}`,
    };
    if (screenshotBase64) userMsg.images = [screenshotBase64];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          format: 'json',
          stream: false,
          messages: [
            { role: 'system', content: systemPrompt },
            userMsg,
          ],
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        throw new AiRefineError(`Ollama API error ${response.status}: ${err}`);
      }

      const data = await response.json();
      const raw = data.message?.content;
      if (!raw) throw new AiRefineError('Empty response from Ollama.');

      try {
        return parseAdElements(raw, elements, 'Ollama');
      } catch (err) {
        if (attempt === MAX_RETRIES) throw err;
      }
    }

    throw new AiRefineError('Ollama failed after retries.');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
