import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAdStore } from '../store';
import { CanvasElement } from './CanvasElement';
import type { CapturedAd } from '../types';

const CANVAS_W = 1080;
const CANVAS_H = 1080;

export function Canvas() {
  const ads = useAdStore((s) => s.ads);
  const removeAd = useAdStore((s) => s.removeAd);
  const selectElement = useAdStore((s) => s.selectElement);
  const selectedAdId = useAdStore((s) => s.selectedAdId);
  const selectedElementId = useAdStore((s) => s.selectedElementId);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      // Leave room for trash button (48px) + padding (64px each side)
      const available = entry.contentRect.width - 48 - 64;
      setScale(Math.min(available / CANVAS_W, 0.85));
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
            scale={scale}
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
  scale: number;
  selectedElementId: string | null;
  onSelectElement: (id: string) => void;
  onRemove: () => void;
}

function AdBlock({ ad, scale, selectedElementId, onSelectElement, onRemove }: AdBlockProps) {
  const sorted = [...ad.elements].sort((a, b) => a.zIndex - b.zIndex);

  const displayW = Math.round(CANVAS_W * scale);
  const displayH = Math.round(CANVAS_H * scale);

  return (
    <div className="flex items-start gap-3">
      {/* Scaled canvas */}
      <div
        style={{ width: displayW, height: displayH, position: 'relative', flexShrink: 0 }}
        onClick={(e) => e.stopPropagation()} // don't bubble to outer deselect handler
      >
        <div
          style={{
            width: CANVAS_W,
            height: CANVAS_H,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
            background: '#fff',
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

      {/* Trash button — sits to the right of the canvas */}
      <button
        title="Delete this ad"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        style={{ marginTop: 4 }}
        className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/40 transition-colors shrink-0"
      >
        <Trash2 size={18} />
      </button>
    </div>
  );
}
