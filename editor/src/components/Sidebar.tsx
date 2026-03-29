import { useState, useEffect, useRef } from 'react';
import { Copy, Check, X, Braces, RefreshCw, ImagePlus } from 'lucide-react';
import { useAdStore } from '../store';
import type { AdElementStyles, CapturedAd } from '../types';

export function Sidebar() {
  const ads = useAdStore((s) => s.ads);
  const selectedAdId = useAdStore((s) => s.selectedAdId);
  const selectedElementId = useAdStore((s) => s.selectedElementId);
  const updateElement = useAdStore((s) => s.updateElement);
  const selectElement = useAdStore((s) => s.selectElement);
  const extractingAdIds = useAdStore((s) => s.extractingAdIds);
  const extractionErrors = useAdStore((s) => s.extractionErrors);
  const clearAdExtractionError = useAdStore((s) => s.clearAdExtractionError);
  const revertAd = useAdStore((s) => s.revertAd);
  const requestReExtract = useAdStore((s) => s.requestReExtract);
  const adScreenshots = useAdStore((s) => s.adScreenshots);

  const selectedAd = ads.find((a) => a.id === selectedAdId) ?? null;
  const selected = selectedAd?.elements.find((el) => el.id === selectedElementId) ?? null;
  // For layers/banner: use selected ad if available, otherwise fall back to most recent ad
  const activeAd = selectedAd ?? ads[ads.length - 1] ?? null;
  const isExtracting = !!activeAd && extractingAdIds.includes(activeAd.id);
  const extractionError = activeAd ? (extractionErrors[activeAd.id] ?? null) : null;

  const [jsonOpen, setJsonOpen] = useState(false);

  const updateStyle = (key: keyof AdElementStyles, value: string | number) => {
    if (!selected || !selectedAdId) return;
    updateElement(selectedAdId, selected.id, { styles: { ...selected.styles, [key]: value } });
  };

  const updateContent = (value: string) => {
    if (!selected || !selectedAdId) return;
    updateElement(selectedAdId, selected.id, { content: value });
  };

  const bgImageInputRef = useRef<HTMLInputElement>(null);

  const handleBgImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected || !selectedAdId) return;
    const reader = new FileReader();
    reader.onload = () => {
      updateStyle('backgroundImage', `url("${reader.result as string}")`);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const isBackground = !!activeAd && selected?.id === activeAd.elements[0]?.id;

  return (
    <aside className="w-72 bg-slate-900 border-l border-slate-700 flex flex-col overflow-hidden">
      <header className="px-4 py-3 border-b border-slate-700">
        <h2 className="text-sm font-semibold text-slate-200 uppercase tracking-wider">
          Properties
        </h2>
      </header>

      {/* Extraction status banner */}
      {activeAd && (
        <ExtractionBanner
          adId={activeAd.id}
          isExtracting={isExtracting}
          error={extractionError}
          onDismissError={() => clearAdExtractionError(activeAd.id)}
        />
      )}

      {!selected ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center gap-4">
          {isExtracting ? (
            <>
              <div
                className="w-9 h-9 rounded-full border-2 border-blue-400 border-t-transparent animate-spin"
                style={{ animationDuration: '0.9s' }}
              />
              <div>
                <p className="text-blue-300 font-medium text-sm">Analyzing image</p>
                <p className="text-slate-500 text-xs mt-1 leading-relaxed">
                  Breaking the ad into editable components…
                </p>
              </div>
            </>
          ) : ads.length === 0 ? (
            <p className="text-slate-600 text-xs leading-relaxed">
              Capture an ad with the extension to get started.
            </p>
          ) : (
            <div className="flex flex-col items-center gap-4">
              <p className="text-slate-500 text-sm">
                Click an element on the canvas to edit its properties.
              </p>
              {activeAd && adScreenshots[activeAd.id] && (
                <button
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-blue-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-colors"
                  onClick={() => requestReExtract(activeAd.id)}
                >
                  <RefreshCw size={12} />
                  Re-analyze with AI
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className={`flex-1 overflow-y-auto p-4 space-y-5 ${isExtracting ? 'opacity-40 pointer-events-none' : ''}`}>
          <div>
            <label className="field-label">Element</label>
            <div className="flex items-center gap-2">
              <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono">
                {isBackground ? 'background' : selected.type}
              </span>
            </div>
          </div>

          {(selected.type === 'text' || selected.type === 'button') && (
            <Field label="Content">
              <textarea
                className="input resize-none h-20"
                value={selected.content}
                onChange={(e) => updateContent(e.target.value)}
              />
            </Field>
          )}

          {selected.type === 'image' && (
            <Field label="Image URL">
              <input
                className="input"
                value={selected.content}
                onChange={(e) => updateContent(e.target.value)}
              />
            </Field>
          )}

          {(selected.type === 'text' || selected.type === 'button') && (
            <>
              <Field label="Font Size">
                <input
                  className="input"
                  value={selected.styles.fontSize}
                  onChange={(e) => updateStyle('fontSize', e.target.value)}
                />
              </Field>

              <Field label="Font Weight">
                <select
                  className="input"
                  value={selected.styles.fontWeight ?? '400'}
                  onChange={(e) => updateStyle('fontWeight', e.target.value)}
                >
                  {['100', '200', '300', '400', '500', '600', '700', '800', '900', 'bold', 'normal'].map(
                    (w) => <option key={w} value={w}>{w}</option>
                  )}
                </select>
              </Field>

              <Field label="Text Color">
                <ColorInput value={selected.styles.color} onChange={(v) => updateStyle('color', v)} />
              </Field>
            </>
          )}

          <Field label="Background Color">
            <ColorInput
              value={selected.styles.backgroundColor}
              onChange={(v) => updateStyle('backgroundColor', v)}
            />
          </Field>

          {selected.type === 'container' && (
            <Field label="Background Image">
              <div className="flex gap-2">
                <input
                  className="input flex-1 text-xs"
                  placeholder="url(…) or paste URL"
                  value={selected.styles.backgroundImage ?? ''}
                  onChange={(e) => updateStyle('backgroundImage', e.target.value)}
                />
                <button
                  title="Upload image file"
                  className="shrink-0 px-2 rounded bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                  onClick={() => bgImageInputRef.current?.click()}
                >
                  <ImagePlus size={14} />
                </button>
                <input
                  ref={bgImageInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={handleBgImageFile}
                />
              </div>
            </Field>
          )}

          <Field label="Border Radius">
            <input
              className="input"
              value={selected.styles.borderRadius}
              onChange={(e) => updateStyle('borderRadius', e.target.value)}
            />
          </Field>

          <div>
            <label className="field-label">Dimensions (read-only)</label>
            <div className="grid grid-cols-2 gap-2 text-xs text-slate-400 font-mono bg-slate-800 rounded p-2">
              <span>W: {Math.round(selected.styles.width)}px</span>
              <span>H: {Math.round(selected.styles.height)}px</span>
              <span>X: {Math.round(selected.styles.left)}px</span>
              <span>Y: {Math.round(selected.styles.top)}px</span>
            </div>
          </div>

          <button
            className="w-full text-xs text-slate-400 hover:text-slate-200 mt-2 py-1"
            onClick={() => selectElement(null, null)}
          >
            Deselect
          </button>
        </div>
      )}

      {/* Layers panel — shows as soon as any ad exists */}
      {activeAd && (
        <div className="border-t border-slate-700">
          <header className="px-4 py-2 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Layers
            </span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-600">{activeAd.elements.length}</span>
              {adScreenshots[activeAd.id] && !isExtracting && (
                <button
                  title="Re-run AI extraction"
                  className="text-slate-500 hover:text-blue-400 transition-colors"
                  onClick={() => requestReExtract(activeAd.id)}
                >
                  <RefreshCw size={13} />
                </button>
              )}
              <button
                title="Revert to original captured elements"
                className="text-xs text-slate-500 hover:text-amber-400 transition-colors"
                onClick={() => revertAd(activeAd.id)}
              >
                Revert
              </button>
              <button
                title="View JSON"
                className="text-slate-500 hover:text-slate-200 transition-colors"
                onClick={() => setJsonOpen(true)}
              >
                <Braces size={13} />
              </button>
            </div>
          </header>
          <ul className="max-h-40 overflow-y-auto">
            {[...activeAd.elements].reverse().map((el) => {
              const isBg = el.id === activeAd.elements[0]?.id;
              return (
                <li
                  key={el.id}
                  className={`px-4 py-1.5 text-xs cursor-pointer flex items-center gap-2 hover:bg-slate-800 ${
                    el.id === selectedElementId ? 'bg-slate-800 text-blue-400' : 'text-slate-400'
                  }`}
                  onClick={() => selectElement(activeAd.id, el.id)}
                >
                  <span className="w-16 shrink-0 font-mono text-slate-600">
                    {isBg ? 'bg' : el.type}
                  </span>
                  {isBg
                    ? <span className="flex items-center gap-1.5 truncate">
                        <span
                          className="w-3 h-3 rounded-sm shrink-0 border border-slate-600"
                          style={{ background: el.styles.backgroundColor }}
                        />
                        Background
                      </span>
                    : <span className="truncate">{el.content || el.id}</span>
                  }
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* JSON viewer modal */}
      {jsonOpen && activeAd && (
        <JsonModal ad={activeAd} onClose={() => setJsonOpen(false)} />
      )}
    </aside>
  );
}

// ── Extraction status banner ──────────────────────────────────────────────────

function ExtractionBanner({
  adId, isExtracting, error, onDismissError,
}: {
  adId: string;
  isExtracting: boolean;
  error: string | null;
  onDismissError: () => void;
}) {
  const [justFinished, setJustFinished] = useState(false);
  const prevRef = useRef(isExtracting);

  useEffect(() => {
    if (prevRef.current && !isExtracting && !error) {
      setJustFinished(true);
      const t = setTimeout(() => setJustFinished(false), 3000);
      return () => clearTimeout(t);
    }
    prevRef.current = isExtracting;
  }, [isExtracting, error, adId]);

  if (isExtracting) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-blue-950/50 border-b border-blue-800/40 text-xs text-blue-300">
        <span
          className="w-3 h-3 rounded-full border-2 border-blue-400 border-t-transparent animate-spin shrink-0"
          style={{ animationDuration: '0.7s' }}
        />
        AI extracting elements…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-start justify-between gap-2 px-4 py-2 bg-red-950/50 border-b border-red-800/40 text-xs text-red-300">
        <span className="break-all">{error}</span>
        <button className="shrink-0 text-red-400 hover:text-red-200 ml-1" onClick={onDismissError}>
          <X size={11} />
        </button>
      </div>
    );
  }

  if (justFinished) {
    return (
      <div className="flex items-center gap-2 px-4 py-2 bg-green-950/50 border-b border-green-800/40 text-xs text-green-300">
        <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
        Extraction complete — ready to edit
      </div>
    );
  }

  return null;
}

// ── JSON viewer modal ─────────────────────────────────────────────────────────

function JsonModal({ ad, onClose }: { ad: CapturedAd; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(ad.elements, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={onClose}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl flex flex-col"
        style={{ width: 'min(720px, 90vw)', maxHeight: '80vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 shrink-0">
          <span className="text-sm font-semibold text-slate-200">
            Elements JSON
            <span className="ml-2 text-xs font-normal text-slate-500">
              {ad.elements.length} element{ad.elements.length !== 1 ? 's' : ''}
            </span>
          </span>
          <div className="flex items-center gap-3">
            <button
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
              onClick={handleCopy}
            >
              {copied ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button className="text-slate-400 hover:text-slate-200" onClick={onClose}>
              <X size={16} />
            </button>
          </div>
        </div>
        <pre className="flex-1 overflow-auto p-5 text-xs text-slate-300 leading-relaxed font-mono">
          {json}
        </pre>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="field-label">{label}</label>
      {children}
    </div>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const getHex = (cssColor: string): string => {
    const match = cssColor.match(/#[0-9a-fA-F]{3,8}/);
    return match ? match[0] : '#000000';
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        className="w-8 h-8 rounded cursor-pointer border-0 bg-transparent p-0"
        value={getHex(value)}
        onChange={(e) => onChange(e.target.value)}
      />
      <input
        className="input flex-1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
