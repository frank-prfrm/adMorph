import type { AdElement } from '../../../types';
import { AiRefineError } from '../../../utils/openai';
import { SYSTEM_PROMPT, parseAdElements } from '../shared';
import type { LLMProvider } from '../provider';

const MAX_RETRIES = 2;

export class OllamaProvider implements LLMProvider {
  constructor(private config: { baseUrl: string; model: string }) {}

  async refineAd(elements: AdElement[], userRequest: string): Promise<AdElement[]> {
    const userContent = `Current ad JSON:\n${JSON.stringify(elements, null, 2)}\n\nUser request: ${userRequest}\n\nReturn the modified array wrapped in {"elements": [...]}`;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.config.model,
          format: 'json',
          stream: false,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userContent },
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
        // retry on parse failure
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
