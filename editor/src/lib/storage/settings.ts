import type { ExtractionPromptId } from '../llm/shared';

export interface AppSettings {
  llm: {
    provider: 'ollama' | 'anthropic' | 'openai' | 'gemini';
    ollamaBaseUrl: string;
    ollamaModel: string;
    anthropicApiKey: string;
    anthropicModel: string;
    openaiApiKey: string;
    openaiModel: string;
    geminiApiKey: string;
    geminiModel: string;
    geminiImageModel: string;
  };
  extractionPromptId: ExtractionPromptId;
  maxTokens: number;
  supabaseEnabled: boolean;
}

const STORAGE_KEY = 'admorph_settings';

const DEFAULTS: AppSettings = {
  llm: {
    provider: 'openai',
    ollamaBaseUrl: 'http://localhost:11434',
    ollamaModel: 'llama3.2-vision',
    anthropicApiKey: '',
    anthropicModel: 'claude-opus-4-6',
    openaiApiKey: '',
    openaiModel: 'gpt-4o',
    geminiApiKey: '',
    geminiModel: 'gemini-3.1-flash-preview',
    geminiImageModel: 'gemini-3.1-flash-image-preview',
  },
  extractionPromptId: 'elements',
  maxTokens: 100000,
  supabaseEnabled: false,
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS, llm: { ...DEFAULTS.llm } };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULTS,
      ...parsed,
      llm: { ...DEFAULTS.llm, ...parsed.llm },
    };
  } catch {
    return { ...DEFAULTS, llm: { ...DEFAULTS.llm } };
  }
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}
