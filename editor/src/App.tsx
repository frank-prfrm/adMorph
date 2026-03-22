import { useEffect, useState } from 'react';
import { Settings } from 'lucide-react';
import { useAdStore } from './store';
import { loadAndMergeAds } from './loader';
import { Canvas } from './components/Canvas';
import { Sidebar } from './components/Sidebar';
import { AiRefiner } from './components/AiRefiner';
import { SettingsPanel } from './components/SettingsPanel/SettingsPanel';
import { useSettings } from './hooks/useSettings';

export default function App() {
  const setAds = useAdStore((s) => s.setAds);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { settings, updateSettings } = useSettings();

  useEffect(() => {
    const ads = loadAndMergeAds();
    if (ads.length > 0) setAds(ads);
  }, [setAds]);

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
