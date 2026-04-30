import { useEffect, useRef, useState } from 'react';
import { useAdStore } from './store';
import { loadAndMergeAds, registerPostMessageListener } from './loader';
import { Canvas } from './components/Canvas';

export default function App() {
  const setAds = useAdStore((s) => s.setAds);
  const addAd = useAdStore((s) => s.addAd);
  const setAdScreenshot = useAdStore((s) => s.setAdScreenshot);

  // Container width for fitting captured ads.
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(800);
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setAvailableWidth(entry.contentRect.width - 64);
    });
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  // Initial load: pull any ads passed via URL ?data= or restored from localStorage.
  useEffect(() => {
    const ads = loadAndMergeAds();
    if (ads.length > 0) setAds(ads);
  }, [setAds]);

  // Listen for postMessages from the Chrome extension.
  useEffect(() => {
    return registerPostMessageListener((ad, screenshot) => {
      addAd(ad);
      if (screenshot) setAdScreenshot(ad.id, screenshot);
    });
  }, [addAd, setAdScreenshot]);

  // Catch screenshot-only messages that arrive after the ad payload (new tab flow).
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.action !== 'adMorphScreenshot') return;
      const screenshot = event.data.screenshot as string | null;
      if (!screenshot) return;
      const ads = useAdStore.getState().ads;
      const lastAd = ads[ads.length - 1];
      if (lastAd) setAdScreenshot(lastAd.id, screenshot);
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [setAdScreenshot]);

  return (
    <div ref={wrapperRef} className="flex flex-col h-screen overflow-hidden bg-slate-950">
      <header className="flex items-center px-4 py-2 bg-slate-900 border-b border-slate-700 shrink-0">
        <span className="text-sm font-bold text-white tracking-tight">
          Ad<span className="text-blue-400">-Morph</span>
        </span>
        <span className="ml-2 text-xs text-slate-500">Editor — press and hold a subject to lift it</span>
      </header>

      <main className="flex-1 overflow-hidden">
        <Canvas availableWidth={availableWidth} />
      </main>
    </div>
  );
}
