import type { AppSettings } from '../storage/settings';
import type { LLMProvider } from './provider';
import { OpenAIProvider } from './providers/openai';
import { AnthropicProvider } from './providers/anthropic';
import { OllamaProvider } from './providers/ollama';
import { GeminiProvider } from './providers/gemini';

export function getProvider(settings: AppSettings): LLMProvider {
  const { llm } = settings;
  switch (llm.provider) {
    case 'anthropic':
      return new AnthropicProvider({ apiKey: llm.anthropicApiKey, model: llm.anthropicModel });
    case 'ollama':
      return new OllamaProvider({ baseUrl: llm.ollamaBaseUrl, model: llm.ollamaModel });
    case 'gemini':
      return new GeminiProvider({ apiKey: llm.geminiApiKey, model: llm.geminiModel, imageModel: llm.geminiImageModel });
    case 'openai':
    default:
      return new OpenAIProvider({ apiKey: llm.openaiApiKey, model: llm.openaiModel });
  }
}
