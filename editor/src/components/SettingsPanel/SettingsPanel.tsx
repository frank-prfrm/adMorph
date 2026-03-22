import { useState } from 'react';
import { X } from 'lucide-react';
import type { AppSettings } from '../../lib/storage/settings';
import { getProvider } from '../../lib/llm/factory';
import { useProviderHealth } from '../../hooks/useProviderHealth';

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

  const setLlm = (patch: Partial<AppSettings['llm']>) =>
    setDraft((d) => ({ ...d, llm: { ...d.llm, ...patch } }));

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
              {(['ollama', 'anthropic', 'openai'] as const).map((p) => (
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
              <div>
                <label className="field-label">Base URL</label>
                <input
                  className="input"
                  value={llm.ollamaBaseUrl}
                  onChange={(e) => setLlm({ ollamaBaseUrl: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Model</label>
                <input
                  className="input"
                  value={llm.ollamaModel}
                  onChange={(e) => setLlm({ ollamaModel: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Anthropic fields */}
          {llm.provider === 'anthropic' && (
            <div className="space-y-3">
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

          {/* Health status */}
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <HealthIndicator settings={draft} />
            <span>Provider health</span>
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
