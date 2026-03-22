import { useEffect } from 'react';
import { useAdStore } from './store';
import { loadAdPayload } from './loader';
import { Canvas } from './components/Canvas';
import { Sidebar } from './components/Sidebar';
import { AiRefiner } from './components/AiRefiner';

export default function App() {
  const setElements = useAdStore((s) => s.setElements);

  useEffect(() => {
    const payload = loadAdPayload();
    if (payload) setElements(payload);
  }, [setElements]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-950">
      {/* Topbar */}
      <header className="flex items-center justify-between px-4 py-2 bg-slate-900 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white tracking-tight">
            Ad<span className="text-blue-400">-Morph</span>
          </span>
          <span className="text-xs text-slate-500">Editor</span>
        </div>
        <div className="text-xs text-slate-500 hidden sm:block">
          Use the Chrome extension to capture an ad, or load JSON from localStorage.
        </div>
      </header>

      {/* Main area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Canvas takes remaining space */}
        <main className="flex-1 overflow-hidden">
          <Canvas />
        </main>

        {/* Right panel: sidebar + AI refiner */}
        <div className="flex flex-col w-72 shrink-0 border-l border-slate-700 overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <Sidebar />
          </div>
          <AiRefiner />
        </div>
      </div>
    </div>
  );
}
