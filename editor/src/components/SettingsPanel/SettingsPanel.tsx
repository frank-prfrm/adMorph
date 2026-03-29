import { useState } from 'react';
import { X } from 'lucide-react';
import type { AppSettings } from '../../lib/storage/settings';
import { getProvider } from '../../lib/llm/factory';
import { useProviderHealth } from '../../hooks/useProviderHealth';
import { useOllamaModels } from '../../hooks/useOllamaModels';
import { getTokensForProvider, getTokenUsage } from '../../lib/storage/tokenUsage';

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toString();
}

function TokenUsageRow({ provider }: { provider: string }) {
  const tokens = getTokensForProvider(provider);
  if (tokens === 0) return null;
  return (
    <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
      <span>Tokens used</span>
      <span className="font-mono text-slate-400">{fmt(tokens)}</span>
    </div>
  );
}

interface Props {
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
  onClose: () => void;
}

function HealthDot({ status }: { status: 'ok' | 'error' | 'checking' }) {
  const base = 'w-2.5 h-2.5 rounded-full shrink-0';
  if (status === 'ok') return <span className={`${base} bg-green-400`} title="Connected" />;
  if (status === 'error') return <span className={`${base} bg-red-500`} title="Unreachable" />;
  return <span className={`${base} bg-yellow-400 animate-pulse`} title="Checking…" />;
}

function HealthIndicator({ settings }: { settings: AppSettings }) {
  const provider = getProvider(settings);
  const status = useProviderHealth(provider);
  return <HealthDot status={status} />;
}

export function SettingsPanel({ settings, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const llm = draft.llm;
  const { totalTokens } = getTokenUsage();
  const usedPct = Math.min(100, draft.maxTokens > 0 ? (totalTokens / draft.maxTokens) * 100 : 0);

  const setLlm = (patch: Partial<AppSettings['llm']>) =>
    setDraft((d) => ({ ...d, llm: { ...d.llm, ...patch } }));

  const { models: ollamaModels, status: ollamaStatus } = useOllamaModels(
    llm.provider === 'ollama' ? llm.ollamaBaseUrl : ''
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
          <h2 className="text-sm font-bold text-slate-100">AI Provider Settings</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          {/* Provider selector */}
          <div>
            <label className="field-label mb-2 block">Provider</label>
            <div className="flex gap-3">
              {(['ollama', 'anthropic', 'openai', 'gemini'] as const).map((p) => (
                <label key={p} className="flex items-center gap-1.5 cursor-pointer text-sm text-slate-300">
                  <input
                    type="radio"
                    name="provider"
                    value={p}
                    checked={llm.provider === p}
                    onChange={() => setLlm({ provider: p })}
                    className="accent-purple-500"
                  />
                  <span className="capitalize">{p}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Ollama fields */}
          {llm.provider === 'ollama' && (
            <div className="space-y-3">
              <TokenUsageRow provider="ollama" />
              <div>
                <label className="field-label">Base URL</label>
                <div className="flex items-center gap-2">
                  <input
                    className="input flex-1"
                    value={llm.ollamaBaseUrl}
                    onChange={(e) => setLlm({ ollamaBaseUrl: e.target.value })}
                  />
                  {ollamaStatus === 'checking' && (
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-pulse shrink-0" title="Checking…" />
                  )}
                  {ollamaStatus === 'ok' && (
                    <span className="w-2.5 h-2.5 rounded-full bg-green-400 shrink-0" title="Reachable" />
                  )}
                  {ollamaStatus === 'error' && (
                    <span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" title="Unreachable" />
                  )}
                </div>
              </div>
              <div>
                <label className="field-label">Model</label>
                {ollamaModels.length > 0 ? (
                  <select
                    className="input"
                    value={llm.ollamaModel}
                    onChange={(e) => setLlm({ ollamaModel: e.target.value })}
                  >
                    {!ollamaModels.includes(llm.ollamaModel) && llm.ollamaModel && (
                      <option value={llm.ollamaModel}>{llm.ollamaModel}</option>
                    )}
                    {ollamaModels.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    className="input"
                    value={llm.ollamaModel}
                    placeholder={ollamaStatus === 'error' ? 'Ollama unreachable — enter model name manually' : 'e.g. llama3.2-vision'}
                    onChange={(e) => setLlm({ ollamaModel: e.target.value })}
                  />
                )}
              </div>
            </div>
          )}

          {/* Anthropic fields */}
          {llm.provider === 'anthropic' && (
            <div className="space-y-3">
              <TokenUsageRow provider="anthropic" />
              <div>
                <label className="field-label">API Key</label>
                <input
                  type="password"
                  className="input"
                  placeholder="sk-ant-..."
                  value={llm.anthropicApiKey}
                  onChange={(e) => setLlm({ anthropicApiKey: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Model</label>
                <input
                  className="input"
                  value={llm.anthropicModel}
                  onChange={(e) => setLlm({ anthropicModel: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* OpenAI fields */}
          {llm.provider === 'openai' && (
            <div className="space-y-3">
              <TokenUsageRow provider="openai" />
              <div>
                <label className="field-label">API Key</label>
                <input
                  type="password"
                  className="input"
                  placeholder="sk-..."
                  value={llm.openaiApiKey}
                  onChange={(e) => setLlm({ openaiApiKey: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Model</label>
                <input
                  className="input"
                  value={llm.openaiModel}
                  onChange={(e) => setLlm({ openaiModel: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Gemini fields */}
          {llm.provider === 'gemini' && (
            <div className="space-y-3">
              <TokenUsageRow provider="gemini" />
              <div>
                <label className="field-label">API Key</label>
                <input
                  type="password"
                  className="input"
                  placeholder="AIza..."
                  value={llm.geminiApiKey}
                  onChange={(e) => setLlm({ geminiApiKey: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Text model</label>
                <input
                  className="input"
                  list="gemini-models"
                  value={llm.geminiModel}
                  onChange={(e) => setLlm({ geminiModel: e.target.value })}
                  placeholder="e.g. gemini-3.1-flash"
                />
              </div>
              <div>
                <label className="field-label">Image model</label>
                <input
                  className="input"
                  list="gemini-models"
                  value={llm.geminiImageModel}
                  onChange={(e) => setLlm({ geminiImageModel: e.target.value })}
                  placeholder="e.g. gemini-3.1-flash-image"
                />
                <datalist id="gemini-models">
                  <option value="gemini-3.1-flash-preview" />
                  <option value="gemini-3.1-flash-image-preview" />
                  <option value="gemini-2.0-flash" />
                  <option value="gemini-2.5-pro-preview-03-25" />
                  <option value="gemini-1.5-pro" />
                  <option value="gemini-1.5-flash" />
                </datalist>
              </div>
            </div>
          )}

          {/* Health status — only shown for cloud providers; Ollama uses the inline URL indicator */}
          {llm.provider !== 'ollama' && (
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <HealthIndicator settings={draft} />
              <span>Provider health</span>
            </div>
          )}
        </div>

        {/* Token usage + max tokens */}
        <div className="px-5 py-4 border-t border-slate-700 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Total tokens used</span>
            <span className="font-mono">
              {fmt(totalTokens)}
              {draft.maxTokens > 0 && (
                <span className="text-slate-600"> / {fmt(draft.maxTokens)}</span>
              )}
            </span>
          </div>
          {draft.maxTokens > 0 && (
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${usedPct >= 90 ? 'bg-red-500' : usedPct >= 70 ? 'bg-amber-400' : 'bg-blue-500'}`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
          )}
          <div className="flex items-center gap-2 pt-1">
            <label className="text-xs text-slate-500 shrink-0">Max tokens</label>
            <input
              className="input flex-1 text-xs"
              type="number"
              min={0}
              value={draft.maxTokens}
              onChange={(e) => setDraft((d) => ({ ...d, maxTokens: parseInt(e.target.value) || 0 }))}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-slate-700">
          <button
            className="text-sm text-slate-400 hover:text-slate-200 px-3 py-1.5"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="text-sm font-semibold bg-purple-600 hover:bg-purple-500 text-white px-4 py-1.5 rounded-lg transition-colors"
            onClick={() => { onSave(draft); onClose(); }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
