import { useEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAdStore } from '../store';
import { CanvasElement } from './CanvasElement';
import type { AdElement, AdElementStyles, CapturedAd } from '../types';

export function Canvas() {
  const ads = useAdStore((s) => s.ads);
  const removeAd = useAdStore((s) => s.removeAd);
  const selectElement = useAdStore((s) => s.selectElement);
  const selectedAdId = useAdStore((s) => s.selectedAdId);
  const selectedElementId = useAdStore((s) => s.selectedElementId);
  const extractingAdIds = useAdStore((s) => s.extractingAdIds);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(600);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      // Subtract only the px-8 canvas padding (32px each side = 64px)
      setAvailableWidth(entry.contentRect.width - 64);
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
      <div className="flex flex-col gap-10 items-center">
        {ads.map((ad) => (
          <AdBlock
            key={ad.id}
            ad={ad}
            availableWidth={availableWidth}
            selectedElementId={selectedAdId === ad.id ? selectedElementId : null}
            isExtracting={extractingAdIds.includes(ad.id)}
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
  isExtracting: boolean;
  onSelectElement: (id: string) => void;
  onRemove: () => void;
}

function AdBlock({ ad, availableWidth, selectedElementId, isExtracting, onSelectElement, onRemove }: AdBlockProps) {
  const updateElement = useAdStore((s) => s.updateElement);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Use the root element's dimensions as the authoritative ad size.
  // Some DOM elements may have negative coords (captured above/left of the
  // root container) — extend the canvas only in those directions.
  // We deliberately ignore maxRight/maxBottom from all elements because stray
  // absolutely-positioned descendants can have enormous coords that would
  // shrink the scale and produce a ghost layout.
  const root  = ad.elements[0];
  const rootW = root?.styles.width  ?? 1080;
  const rootH = root?.styles.height ?? 1080;

  const minTop  = Math.min(0, ...ad.elements.map((e) => e.styles.top));
  const minLeft = Math.min(0, ...ad.elements.map((e) => e.styles.left));

  const offsetX = Math.round(-minLeft);
  const offsetY = Math.round(-minTop);

  const adW = Math.round(rootW + offsetX);
  const adH = Math.round(rootH + offsetY);

  const scale = Math.min(availableWidth / adW, 1);
  const displayW = Math.round(adW * scale);
  const displayH = Math.round(adH * scale);

  const sorted = [...ad.elements].sort((a, b) => a.zIndex - b.zIndex);
  const selectedEl = selectedElementId ? ad.elements.find((e) => e.id === selectedElementId) : null;

  const handleStyleChange = (elementId: string, key: keyof AdElementStyles, value: string) => {
    updateElement(ad.id, elementId, { styles: { ...ad.elements.find(e => e.id === elementId)!.styles, [key]: value } });
  };

  const handleEditCommit = (elementId: string, content: string) => {
    updateElement(ad.id, elementId, { content });
    setEditingId(null);
  };

  const handleImageSwap = (elementId: string, dataUrl: string) => {
    updateElement(ad.id, elementId, { content: dataUrl });
  };

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Outer clip-box: display dimensions, toolbar is positioned here */}
      <div
        style={{ width: displayW, height: displayH, position: 'relative', overflow: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Inner canvas at native size, scaled via transform */}
        <div
          data-ad-id={ad.id}
          style={{
            width: adW,
            height: adH,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            position: 'absolute',
            top: 0,
            left: 0,
            background: '#fff',
            overflow: 'hidden',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
          }}
        >
          {/* Offset wrapper: shifts elements into view when any have negative coords */}
          <div style={{ position: 'absolute', top: offsetY, left: offsetX }}>
            {sorted.map((el) => (
              <CanvasElement
                key={el.id}
                element={el}
                isSelected={el.id === selectedElementId}
                isEditing={el.id === editingId}
                onClick={(id) => { setEditingId(null); onSelectElement(id); }}
                onDoubleClick={(id) => { onSelectElement(id); setEditingId(id); }}
                onEditCommit={handleEditCommit}
                onImageSwap={handleImageSwap}
              />
            ))}
          </div>
        </div>

        {/* Extraction overlay */}
        {isExtracting && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10000,
            background: 'rgba(15,23,42,0.7)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 8, borderRadius: 2,
          }}>
            <div className="animate-spin" style={{
              width: 20, height: 20, border: '2px solid #3b82f6', borderTopColor: 'transparent',
              borderRadius: '50%',
            }} />
            <span style={{ fontSize: 11, color: '#93c5fd', fontWeight: 500 }}>Extracting via vision…</span>
          </div>
        )}

        {/* Floating color toolbar — lives outside the scaled div, in display space */}
        {selectedEl && editingId !== selectedEl.id && (
          <ElementToolbar
            element={selectedEl}
            scale={scale}
            offsetX={offsetX}
            offsetY={offsetY}
            displayH={displayH}
            onStyleChange={(key, value) => handleStyleChange(selectedEl.id, key, value)}
          />
        )}
      </div>

      {/* Trash button — absolutely positioned top-right, outside the ad area */}
      <button
        title="Delete this ad"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/40 transition-colors"
        style={{ position: 'absolute', top: -32, right: 0, zIndex: 9998 }}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}

// ── Floating color toolbar ───────────────────────────────────────────────────

function ElementToolbar({
  element,
  scale,
  offsetX,
  offsetY,
  displayH,
  onStyleChange,
}: {
  element: AdElement;
  scale: number;
  offsetX: number;
  offsetY: number;
  displayH: number;
  onStyleChange: (key: keyof AdElementStyles, value: string) => void;
}) {
  const TOOLBAR_H = 34;
  const elTop    = (element.styles.top    + offsetY) * scale;
  const elLeft   = (element.styles.left   + offsetX) * scale;
  const elBottom = (element.styles.top + element.styles.height + offsetY) * scale;

  // Prefer above element; fall back to below if too close to top
  const top = elTop > TOOLBAR_H + 6 ? elTop - TOOLBAR_H - 4 : Math.min(elBottom + 4, displayH - TOOLBAR_H);

  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: Math.max(0, elLeft),
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: '#0f172a',
        border: '1px solid #334155',
        borderRadius: 6,
        padding: '4px 8px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
        fontSize: 11,
        color: '#94a3b8',
        whiteSpace: 'nowrap',
        pointerEvents: 'auto',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <ColorSwatch
        label="BG"
        color={element.styles.backgroundColor}
        onChange={(v) => onStyleChange('backgroundColor', v)}
      />
      {(element.type === 'text' || element.type === 'button') && (
        <>
          <Divider />
          <ColorSwatch
            label="Text"
            color={element.styles.color}
            onChange={(v) => onStyleChange('color', v)}
            showLetter
          />
        </>
      )}
    </div>
  );
}

function ColorSwatch({
  color,
  label,
  onChange,
  showLetter,
}: {
  color: string;
  label: string;
  onChange: (v: string) => void;
  showLetter?: boolean;
}) {
  const hex = color.match(/#[0-9a-fA-F]{3,8}/)?.[0] ?? '#000000';
  return (
    <label title={label} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none' }}>
      <div
        style={{
          width: 14,
          height: 14,
          background: color,
          border: '1px solid rgba(148,163,184,0.4)',
          borderRadius: 3,
          flexShrink: 0,
        }}
      />
      {showLetter
        ? <span style={{ fontWeight: 700, color, fontSize: 12, lineHeight: 1 }}>A</span>
        : <span style={{ color: '#64748b', fontSize: 10 }}>{label}</span>
      }
      <input
        type="color"
        value={hex}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', opacity: 0, width: '100%', height: '100%', cursor: 'pointer', left: 0, top: 0, padding: 0, margin: 0, border: 'none' }}
      />
    </label>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 16, background: '#334155', flexShrink: 0 }} />;
}
