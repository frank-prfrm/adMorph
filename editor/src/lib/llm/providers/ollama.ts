import type { AdElement } from '../../../types';
import { AiRefineError } from '../../../utils/openai';
import { SYSTEM_PROMPT, VISION_SYSTEM_PROMPT, EXTRACTION_SYSTEM_PROMPT, SCENE_EXTRACTION_PROMPT, parseAdElements, parseExtractedElements, parseSceneElements, pctToPixels } from '../shared';
import type { ExtractionPromptId } from '../shared';
import type { LLMProvider } from '../provider';

const MAX_RETRIES = 2;

export class OllamaProvider implements LLMProvider {
  constructor(private config: { baseUrl: string; model: string; promptId?: ExtractionPromptId }) {}

  async extractAd(screenshot: string, adWidth: number, adHeight: number): Promise<AdElement[]> {
    const useScene = this.config.promptId === 'scene';
    const systemPrompt = useScene ? SCENE_EXTRACTION_PROMPT : EXTRACTION_SYSTEM_PROMPT;
    const userMsg = {
      role: 'user',
      content: useScene
        ? 'Analyze this advertisement image and return the exhaustive scene JSON as instructed.'
        : `The advertisement is ${adWidth}×${adHeight} pixels. Analyze it and return the element JSON as instructed.`,
      images: [screenshot],
    };

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const requestBody = {
        model: this.config.model,
        format: 'json',
        stream: false,
        options: { num_predict: 4096 },
        messages: [
          { role: 'system', content: systemPrompt },
          userMsg,
        ],
      };
      console.group(`[Ollama extractAd] attempt ${attempt + 1}`);
      console.log('REQUEST →', JSON.stringify({ ...requestBody, messages: requestBody.messages.map(m => ({ ...m, images: (m as Record<string,unknown>).images ? ['<base64 truncated>'] : undefined })) }, null, 2));

      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('RESPONSE ERROR →', err);
        console.groupEnd();
        throw new AiRefineError(`Ollama extraction error ${response.status}: ${err}`);
      }

      const data = await response.json();
      const raw = data.message?.content;
      console.log('RESPONSE RAW →', raw);
      console.groupEnd();
      if (!raw) throw new AiRefineError('Empty extraction response from Ollama.');

      try {
        const elements = useScene
          ? parseSceneElements(raw, 'Ollama')
          : parseExtractedElements(raw, 'Ollama');
        const parsed = pctToPixels(elements, adWidth, adHeight);
        console.log('[Ollama extractAd] PARSED ELEMENTS →', JSON.parse(JSON.stringify(parsed)));
        return parsed;
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
      const requestBody = {
        model: this.config.model,
        format: 'json',
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          userMsg,
        ],
      };
      console.group(`[Ollama refineAd] attempt ${attempt + 1}`);
      console.log('REQUEST →', JSON.stringify({ ...requestBody, messages: requestBody.messages.map(m => ({ ...m, images: (m as Record<string,unknown>).images ? ['<base64 truncated>'] : undefined })) }, null, 2));

      const response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const err = await response.text();
        console.error('RESPONSE ERROR →', err);
        console.groupEnd();
        throw new AiRefineError(`Ollama API error ${response.status}: ${err}`);
      }

      const data = await response.json();
      const raw = data.message?.content;
      console.log('RESPONSE RAW →', raw);
      console.groupEnd();
      if (!raw) throw new AiRefineError('Empty response from Ollama.');

      try {
        const parsed = parseAdElements(raw, elements, 'Ollama');
        console.log('[Ollama refineAd] PARSED ELEMENTS →', JSON.parse(JSON.stringify(parsed)));
        return parsed;
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
