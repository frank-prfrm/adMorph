const STORAGE_KEY = 'admorph_token_usage';

export interface TokenUsageRecord {
  timestamp: number;
  provider: string;
  model: string;
  operation: 'extraction' | 'deep-dive' | 'refine';
  tokens: number;
}

export interface TokenUsageStore {
  records: TokenUsageRecord[];
  totalTokens: number;
}

function load(): TokenUsageStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { records: [], totalTokens: 0 };
    return JSON.parse(raw) as TokenUsageStore;
  } catch {
    return { records: [], totalTokens: 0 };
  }
}

export function recordTokenUsage(record: TokenUsageRecord): void {
  const store = load();
  store.records.push(record);
  store.totalTokens += record.tokens;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getTokenUsage(): TokenUsageStore {
  return load();
}

export function getTokensForProvider(provider: string): number {
  return load().records
    .filter((r) => r.provider === provider)
    .reduce((sum, r) => sum + r.tokens, 0);
}

export function clearTokenUsage(): void {
  localStorage.removeItem(STORAGE_KEY);
}
