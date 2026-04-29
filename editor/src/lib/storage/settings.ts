import type { ExtractionPromptId } from '../llm/shared';

export type ExtractionMode = 'bbox' | 'html';

export interface AppSettings {
  llm: {
    provider: 'anthropic' | 'openai' | 'gemini';
    anthropicApiKey: string;
    anthropicModel: string;
    openaiApiKey: string;
    openaiModel: string;
    geminiApiKey: string;
    geminiModel: string;
    geminiImageModel: string;
  };
  extractionPromptId: ExtractionPromptId;
  /**
   * Determines how the LLM analyzes the ad screenshot:
   *   'bbox' — return AdElement[] with bounding-box coordinates (legacy)
   *   'html' — return a self-contained HTML/CSS recreation; bounding boxes
   *            are then computed from the rendered DOM via getBoundingClientRect.
   */
  extractionMode: ExtractionMode;
  maxTokens: number;
  supabaseEnabled: boolean;
}

const STORAGE_KEY = 'admorph_settings';

const DEFAULTS: AppSettings = {
  llm: {
    provider: 'anthropic',
    anthropicApiKey: '',
    anthropicModel: 'claude-opus-4-6',
    openaiApiKey: '',
    openaiModel: 'gpt-4o',
    geminiApiKey: '',
    geminiModel: 'gemini-3.1-flash-preview',
    geminiImageModel: 'gemini-3.1-flash-image-preview',
  },
  extractionPromptId: 'elements',
  extractionMode: 'bbox',
  maxTokens: 100000,
  supabaseEnabled: false,
};

const VALID_PROVIDERS: AppSettings['llm']['provider'][] = ['anthropic', 'openai', 'gemini'];

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS, llm: { ...DEFAULTS.llm } };
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const merged: AppSettings = {
      ...DEFAULTS,
      ...parsed,
      llm: { ...DEFAULTS.llm, ...parsed.llm },
    };
    if (!VALID_PROVIDERS.includes(merged.llm.provider)) {
      merged.llm.provider = DEFAULTS.llm.provider;
    }
    return merged;
  } catch {
    return { ...DEFAULTS, llm: { ...DEFAULTS.llm } };
  }
}

export function saveSettings(s: AppSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}
