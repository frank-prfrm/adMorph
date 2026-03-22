import { useState } from 'react';
import { Sparkles, Undo2, AlertCircle, Loader2 } from 'lucide-react';
import { useAdStore } from '../store';
import { AiRefineError } from '../utils/openai';
import { getProvider } from '../lib/llm/factory';
import type { AppSettings } from '../lib/storage/settings';

interface Props {
  settings: AppSettings;
}

export function AiRefiner({ settings }: Props) {
  const ads = useAdStore((s) => s.ads);
  const previousAds = useAdStore((s) => s.previousAds);
  const selectedAdId = useAdStore((s) => s.selectedAdId);
  const setAdElements = useAdStore((s) => s.setAdElements);
  const undo = useAdStore((s) => s.undo);

  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedAd = ads.find((a) => a.id === selectedAdId) ?? null;
  const providerName = settings.llm.provider.charAt(0).toUpperCase() + settings.llm.provider.slice(1);

  const isReady = () => {
    const { llm } = settings;
    if (llm.provider === 'ollama') return !!llm.ollamaBaseUrl;
    if (llm.provider === 'anthropic') return !!llm.anthropicApiKey;
    return !!llm.openaiApiKey;
  };

  const handleRefine = async () => {
    if (!prompt.trim() || !selectedAd || !isReady()) return;
    setLoading(true);
    setError(null);
    try {
      const provider = getProvider(settings);
      const refined = await provider.refineAd(selectedAd.elements, prompt);
      setAdElements(selectedAd.id, refined);
      setPrompt('');
    } catch (err) {
      setError(err instanceof AiRefineError ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const canRefine = !loading && !!prompt.trim() && !!selectedAd && isReady();

  return (
    <section className="border-t border-slate-700 bg-slate-900 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
          <Sparkles size={14} className="text-purple-400" />
          AI Refiner
        </div>
        {previousAds && (
          <button
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200"
            onClick={undo}
          >
            <Undo2 size={12} /> Undo
          </button>
        )}
      </div>

      {!selectedAd && ads.length > 0 && (
        <p className="text-xs text-slate-500">Click any element on an ad to select it first.</p>
      )}

      <p className="text-xs text-slate-500">
        Provider: <span className="text-slate-300">{providerName}</span>
        {!isReady() && <span className="text-yellow-500 ml-1">— configure in Settings</span>}
      </p>

      <div>
        <label className="field-label">Request</label>
        <textarea
          className="input resize-none h-16 text-sm"
          placeholder='"Make this feel like a luxury brand"'
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
        disabled={!canRefine}
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        {loading ? `Refining with ${providerName}…` : 'Refine Ad'}
      </button>
    </section>
  );
}
