import { useCallback, useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { useAdStore } from './store';
import { loadAndMergeAds, registerPostMessageListener } from './loader';
import { Canvas } from './components/Canvas';
import { Sidebar } from './components/Sidebar';
import { AiRefiner } from './components/AiRefiner';
import { SettingsPanel } from './components/SettingsPanel/SettingsPanel';
import { useSettings } from './hooks/useSettings';
import { getProvider } from './lib/llm/factory';
import { AiRefineError } from './utils/openai';
import type { CapturedAd } from './types';


export default function App() {
  const setAds = useAdStore((s) => s.setAds);
  const addAd = useAdStore((s) => s.addAd);
  const setAdElements = useAdStore((s) => s.setAdElements);
  const setAdRawJson = useAdStore((s) => s.setAdRawJson);
  const setAdExtracting = useAdStore((s) => s.setAdExtracting);
  const setAdExtractionError = useAdStore((s) => s.setAdExtractionError);
  const setAdScreenshot = useAdStore((s) => s.setAdScreenshot);
  const reExtractRequestId = useAdStore((s) => s.reExtractRequestId);
  const clearReExtractRequest = useAdStore((s) => s.clearReExtractRequest);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { settings, updateSettings } = useSettings();

  // ── Vision extraction ──────────────────────────────────────────────────────
  // When a screenshot is available for a newly captured ad, run the vision
  // model to produce a semantically accurate AdElement[] with real bounding
  // boxes — replacing the DOM-derived quick-preview elements.

  const runExtraction = useCallback(async (ad: CapturedAd, screenshot: string) => {
    const adW = ad.elements[0]?.styles.width ?? 300;
    const adH = ad.elements[0]?.styles.height ?? 250;
    setAdExtracting(ad.id, true);
    try {
      const provider = getProvider(settings);
      const { elements: extracted, rawJson } = await provider.extractAd(screenshot, adW, adH);
      setAdRawJson(ad.id, rawJson);
      // Only apply if the model returned more than just the root container —
      // a single-element result means extraction didn't really work; keep the DOM capture.
      if (extracted.length > 1) {
        setAdElements(ad.id, extracted);
      } else {
        setAdExtractionError(ad.id, 'Extraction returned only the root container — keeping original elements.');
      }
    } catch (err) {
      const msg = err instanceof AiRefineError ? err.message : String(err);
      console.warn('[adMorph] Vision extraction failed:', msg);
      setAdExtractionError(ad.id, msg);
    } finally {
      setAdExtracting(ad.id, false);
    }
  }, [settings, setAdElements, setAdRawJson, setAdExtracting, setAdExtractionError]);

  // ── Initial load ───────────────────────────────────────────────────────────
  useEffect(() => {
    const ads = loadAndMergeAds();
    if (ads.length > 0) setAds(ads);
  }, [setAds]);

  // ── postMessage: full payload (existing tab) ───────────────────────────────
  useEffect(() => {
    return registerPostMessageListener((ad, screenshot) => {
      addAd(ad);
      if (screenshot) {
        setAdScreenshot(ad.id, screenshot);
        runExtraction(ad, screenshot);
      }
    });
  }, [addAd, runExtraction, setAdScreenshot]);

  // ── postMessage: screenshot-only (new tab, arrives after page load) ────────
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.action !== 'adMorphScreenshot') return;
      const screenshot = event.data.screenshot as string | null;
      if (!screenshot) return;
      // Associate with the most recently added ad (the one loaded from URL param)
      const ads = useAdStore.getState().ads;
      const lastAd = ads[ads.length - 1];
      if (lastAd) {
        setAdScreenshot(lastAd.id, screenshot);
        runExtraction(lastAd, screenshot);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [runExtraction]);

  // ── Re-extract on demand ───────────────────────────────────────────────────
  useEffect(() => {
    if (!reExtractRequestId) return;
    clearReExtractRequest();
    const state = useAdStore.getState();
    const ad = state.ads.find((a) => a.id === reExtractRequestId);
    const screenshot = state.adScreenshots[reExtractRequestId];
    if (ad && screenshot) runExtraction(ad, screenshot);
  }, [reExtractRequestId, clearReExtractRequest, runExtraction]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-950">
      <header className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white tracking-tight">
            Ad<span className="text-blue-400">-Morph</span>
          </span>
          <span className="text-xs text-slate-500">Editor</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-500 hidden sm:block">
            Capture ads with the Chrome extension · Click an element to edit · Use AI Refiner to restyle
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-slate-400 hover:text-slate-200 transition-colors"
            title="AI Provider Settings"
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-hidden">
          <Canvas />
        </main>
        <div className="flex flex-col w-72 shrink-0 border-l border-slate-700 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <Sidebar />
          </div>
          <AiRefiner settings={settings} />
        </div>
      </div>

      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          onSave={updateSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
