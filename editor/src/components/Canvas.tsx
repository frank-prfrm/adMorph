import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAdStore } from '../store';
import { CanvasElement } from './CanvasElement';
import type { CapturedAd } from '../types';

export function Canvas() {
  const ads = useAdStore((s) => s.ads);
  const removeAd = useAdStore((s) => s.removeAd);
  const selectElement = useAdStore((s) => s.selectElement);
  const selectedAdId = useAdStore((s) => s.selectedAdId);
  const selectedElementId = useAdStore((s) => s.selectedElementId);

  const wrapperRef = useRef<HTMLDivElement>(null);
  // Available pixel width for each ad canvas (excluding trash button + padding)
  const [availableWidth, setAvailableWidth] = useState(600);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      // 48px trash button + 32px right gap + 64px left padding
      setAvailableWidth(entry.contentRect.width - 48 - 32 - 64);
    });
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  if (ads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3 px-8 text-center">
        <p className="text-lg font-medium text-slate-400">No ads captured yet</p>
        <p className="text-sm">
          Activate the Ad-Morph Chrome extension, hover over an ad, and click to capture it.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={wrapperRef}
      className="overflow-y-auto h-full bg-slate-900 px-8 py-10"
      onClick={() => selectElement(null, null)}
    >
      <div className="flex flex-col gap-10">
        {ads.map((ad) => (
          <AdBlock
            key={ad.id}
            ad={ad}
            availableWidth={availableWidth}
            selectedElementId={selectedAdId === ad.id ? selectedElementId : null}
            onSelectElement={(elId) => selectElement(ad.id, elId)}
            onRemove={() => removeAd(ad.id)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Single ad block ──────────────────────────────────────────────────────────

interface AdBlockProps {
  ad: CapturedAd;
  availableWidth: number;
  selectedElementId: string | null;
  onSelectElement: (id: string) => void;
  onRemove: () => void;
}

function AdBlock({ ad, availableWidth, selectedElementId, onSelectElement, onRemove }: AdBlockProps) {
  // The first element is always the captured root — its dimensions are the true ad size.
  const root = ad.elements[0];
  const adW = root ? Math.round(root.styles.width) : 1080;
  const adH = root ? Math.round(root.styles.height) : 1080;

  // Scale to fit available width, but never upscale beyond 1×
  const scale = Math.min(availableWidth / adW, 1);

  const displayW = Math.round(adW * scale);
  const displayH = Math.round(adH * scale);

  const sorted = [...ad.elements].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div className="flex items-center gap-3">
      {/* Outer clip-box: exact display dimensions so nothing bleeds out */}
      <div
        style={{ width: displayW, height: displayH, position: 'relative', flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Inner canvas at native size, scaled down via transform */}
        <div
          style={{
            width: adW,
            height: adH,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
            background: '#fff',
            overflow: 'hidden',       // clip stray elements that fall outside ad bounds
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          }}
        >
          {sorted.map((el) => (
            <CanvasElement
              key={el.id}
              element={el}
              isSelected={el.id === selectedElementId}
              onClick={onSelectElement}
            />
          ))}
        </div>
      </div>

      {/* Trash button */}
      <button
        title="Delete this ad"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/40 transition-colors shrink-0"
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
}
