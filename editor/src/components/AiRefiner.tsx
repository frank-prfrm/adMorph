import { useState } from 'react';
import { Sparkles, Undo2, AlertCircle, Loader2 } from 'lucide-react';
import { useAdStore } from '../store';
import { refineAdWithAI, AiRefineError } from '../utils/openai';

export function AiRefiner() {
  const elements = useAdStore((s) => s.elements);
  const previousElements = useAdStore((s) => s.previousElements);
  const setElements = useAdStore((s) => s.setElements);
  const undo = useAdStore((s) => s.undo);

  const [prompt, setPrompt] = useState('');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('admorph_openai_key') ?? '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('admorph_openai_key', key);
  };

  const handleRefine = async () => {
    if (!prompt.trim() || !apiKey.trim() || elements.length === 0) return;
    setLoading(true);
    setError(null);
    try {
      const refined = await refineAdWithAI(elements, prompt, apiKey);
      setElements(refined);
      setPrompt('');
    } catch (err) {
      setError(err instanceof AiRefineError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="border-t border-slate-700 bg-slate-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Sparkles size={14} className="text-purple-400" />
          AI Refiner
        </div>
        {previousElements && (
          <button
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
            onClick={undo}
          >
            <Undo2 size={12} /> Undo
          </button>
        )}
      </div>

      {/* API Key */}
      <div>
        <label className="field-label">OpenAI API Key</label>
        <input
          type="password"
          className="input text-xs"
          placeholder="sk-..."
          value={apiKey}
          onChange={(e) => saveKey(e.target.value)}
        />
        <p className="text-xs text-slate-600 mt-1">Stored in localStorage. Never sent anywhere except OpenAI.</p>
      </div>

      {/* Prompt */}
      <div>
        <label className="field-label">Request</label>
        <textarea
          className="input resize-none h-20 text-sm"
          placeholder='e.g. "Make this feel like a luxury brand" or "Change colors to a dark theme"'
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleRefine();
          }}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-400 bg-red-950/40 rounded p-2">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <button
        className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold py-2 rounded-lg transition-colors"
        onClick={handleRefine}
        disabled={loading || !prompt.trim() || !apiKey.trim() || elements.length === 0}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {loading ? 'Refining…' : 'Refine Ad'}
      </button>
    </section>
  );
}
