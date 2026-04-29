import { useCallback, useEffect, useRef, useState } from 'react';
import { Layers, MousePointer2, Trash2 } from 'lucide-react';
import { useAdStore } from '../store';
import { CanvasElement } from './CanvasElement';
import { ShadowAdMount, type RoleBox } from './ShadowAdMount';
import type { AdElement, AdElementStyles, CapturedAd } from '../types';

export function Canvas() {
  const ads = useAdStore((s) => s.ads);
  const removeAd = useAdStore((s) => s.removeAd);
  const selectElement = useAdStore((s) => s.selectElement);
  const selectedAdId = useAdStore((s) => s.selectedAdId);
  const selectedElementId = useAdStore((s) => s.selectedElementId);
  const extractingAdIds = useAdStore((s) => s.extractingAdIds);
  const adScreenshots = useAdStore((s) => s.adScreenshots);

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
      <div className="flex flex-col items-center justify-center h-full px-8 text-center gap-8">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center">
            <MousePointer2 size={28} className="text-blue-400" />
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-200">No ads captured yet</p>
            <p className="text-sm text-slate-500 mt-1 max-w-xs leading-relaxed">
              Use the Chrome extension to capture any ad from any webpage.
            </p>
          </div>
        </div>
        <ol className="text-left space-y-3 max-w-xs w-full">
          {[
            <>Click the <span className="text-slate-300 font-medium">Ad-Morph</span> icon in Chrome</>,
            <>Hover over an ad on any webpage to highlight it</>,
            <>Click the ad — it opens here instantly</>,
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-slate-500">
              <span className="w-5 h-5 rounded-full bg-slate-800 border border-slate-700 text-blue-400 text-xs flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
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
            screenshot={adScreenshots[ad.id]}
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
  screenshot?: string;
  onSelectElement: (id: string) => void;
  onRemove: () => void;
}

function AdBlock({ ad, availableWidth, selectedElementId, isExtracting, screenshot, onSelectElement, onRemove }: AdBlockProps) {
  const updateElement = useAdStore((s) => s.updateElement);
  const detectionRequestId = useAdStore((s) => s.detectionRequestId);
  const clearDetectionRequest = useAdStore((s) => s.clearDetectionRequest);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showDetection, setShowDetection] = useState(false);

  // Auto-enable detection view when extraction completes
  const prevExtractingRef = useRef(false);
  useEffect(() => {
    if (prevExtractingRef.current && !isExtracting && screenshot) {
      setShowDetection(true);
    }
    prevExtractingRef.current = isExtracting;
  }, [isExtracting, screenshot]);

  // Enable detection view when an object is selected from the Objects tab
  useEffect(() => {
    if (detectionRequestId === ad.id) {
      setShowDetection(true);
      clearDetectionRequest();
    }
  }, [detectionRequestId, ad.id, clearDetectionRequest]);

  const backgroundId = ad.elements[0]?.id;

  // Use the root element's dimensions as the authoritative ad size.
  // Some DOM elements may have negative coords (captured above/left of the
  // root container) — extend the canvas only in those directions.
  // We deliberately ignore maxRight/maxBottom from all elements because stray
  // absolutely-positioned descendants can have enormous coords that would
  // shrink the scale and produce a ghost layout.
  const root  = ad.elements[0];
  const rootW = root?.styles.width  ?? 1080;
  const rootH = root?.styles.height ?? 1080;

  // Use the root element's dimensions as the authoritative ad size — exactly
  // what the extension's viewRect captured. Elements with negative coords are
  // outside the ad's own bounds and get clipped by overflow:hidden, just like
  // the browser does. No offset expansion to avoid ghost backgrounds.
  const adW = Math.round(rootW);
  const adH = Math.round(rootH);

  // Diagnostic: compare canvas-reported ad size with the screenshot's natural
  // dimensions. A mismatch means the ad is being stretched into a wrong-sized
  // container (because the extension's viewRect disagrees with the DOM root
  // element's bbox). Logged once per ad load.
  useEffect(() => {
    if (!screenshot) return;
    const probe = new Image();
    probe.onload = () => {
      const ratioMatch = Math.abs((probe.naturalWidth / probe.naturalHeight) - (adW / adH)) < 0.02;
      console.log(
        `[AdBlock ${ad.id}] canvas size: ${adW}×${adH}, screenshot natural: ${probe.naturalWidth}×${probe.naturalHeight}` +
        (ratioMatch ? '' : ' ⚠️ aspect-ratio mismatch — screenshot is being stretched')
      );
    };
    probe.src = `data:image/jpeg;base64,${screenshot}`;
  }, [ad.id, screenshot, adW, adH]);

  const scale = Math.min(availableWidth / adW, 1);
  const displayW = Math.round(adW * scale);
  const displayH = Math.round(adH * scale);

  const sorted = [...ad.elements].sort((a, b) => a.zIndex - b.zIndex);
  const selectedEl = selectedElementId ? ad.elements.find((e) => e.id === selectedElementId) : null;

  const [roleBoxes, setRoleBoxes] = useState<RoleBox[]>([]);
  const handleRolesMeasured = useCallback((boxes: RoleBox[]) => setRoleBoxes(boxes), []);
  const isHtmlMode = !!ad.html;

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
          {/* During extraction: show raw screenshot */}
          {isExtracting && screenshot ? (
            <img
              src={`data:image/jpeg;base64,${screenshot}`}
              draggable={false}
              style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none' }}
            />
          ) : isHtmlMode ? (
            /* HTML mode: render LLM-recreated HTML in a shadow DOM. */
            <>
              <ShadowAdMount
                html={ad.html!}
                width={adW}
                height={adH}
                screenshotBase64={screenshot}
                onRolesMeasured={handleRolesMeasured}
              />
              {showDetection && screenshot && (
                <>
                  <img
                    src={`data:image/jpeg;base64,${screenshot}`}
                    draggable={false}
                    style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none', position: 'absolute', inset: 0 }}
                  />
                  {roleBoxes.map((b, i) => (
                    <RoleOverlay key={`${b.role}-${i}`} box={b} />
                  ))}
                </>
              )}
            </>
          ) : showDetection && screenshot ? (
            /* Detection view (bbox mode): screenshot + bounding boxes */
            <>
              <img
                src={`data:image/jpeg;base64,${screenshot}`}
                draggable={false}
                style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none', position: 'absolute', inset: 0 }}
              />
              {sorted
                .filter((el) => el.id !== backgroundId)
                .map((el) => (
                  <BoundingBox
                    key={el.id}
                    element={el}
                    isSelected={el.id === selectedElementId}
                    onClick={() => { setEditingId(null); onSelectElement(el.id); }}
                  />
                ))}
            </>
          ) : (
            <>
              {/* When a screenshot exists, use it as the background instead of
                  the DOM-captured root element (which often has a raw black
                  backgroundColor that hides the real ad visuals post-extraction). */}
              {screenshot && (
                <img
                  src={`data:image/jpeg;base64,${screenshot}`}
                  draggable={false}
                  style={{ width: '100%', height: '100%', display: 'block', userSelect: 'none', position: 'absolute', inset: 0, pointerEvents: 'none' }}
                />
              )}
              {sorted
                .filter((el) => !screenshot || el.id !== backgroundId)
                .map((el) => (
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
            </>
          )}
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
            offsetX={0}
            offsetY={0}
            displayH={displayH}
            onStyleChange={(key, value) => handleStyleChange(selectedEl.id, key, value)}
          />
        )}
      </div>

      {/* Detection toggle — only when screenshot available */}
      {screenshot && !isExtracting && (
        <button
          title={showDetection ? 'Show rendered elements' : 'Show AI detection boxes'}
          onClick={(e) => { e.stopPropagation(); setShowDetection((v) => !v); }}
          className={`p-1.5 rounded-lg transition-colors ${
            showDetection
              ? 'text-blue-400 bg-blue-950/40'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800/40'
          }`}
          style={{ position: 'absolute', top: -32, right: 30, zIndex: 9998 }}
        >
          <Layers size={15} />
        </button>
      )}

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

// ── Role overlay (HTML mode) ─────────────────────────────────────────────────

function RoleOverlay({ box }: { box: RoleBox }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: box.rect.left,
        top: box.rect.top,
        width: box.rect.width,
        height: box.rect.height,
        border: '2px solid #3b82f6cc',
        backgroundColor: '#3b82f61a',
        boxSizing: 'border-box',
        pointerEvents: 'none',
      }}
      title={box.role}
    />
  );
}

// ── Detection bounding box ───────────────────────────────────────────────────

const BOX_COLORS: Record<string, string> = {
  text:      '#3b82f6', // blue
  image:     '#f59e0b', // amber
  button:    '#22c55e', // green
  container: '#a855f7', // purple
};

function BoundingBox({
  element,
  isSelected,
  onClick,
}: {
  element: AdElement;
  isSelected: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const color = BOX_COLORS[element.type] ?? '#94a3b8';
  const active = isSelected || hovered;
  return (
    <div
      style={{
        position: 'absolute',
        left: element.styles.left,
        top: element.styles.top,
        width: element.styles.width,
        height: element.styles.height,
        border: `2px solid ${active ? color : `${color}66`}`,
        backgroundColor: isSelected ? `${color}33` : hovered ? `${color}1a` : 'transparent',
        zIndex: element.zIndex + 1,
        cursor: 'pointer',
        boxSizing: 'border-box',
        outline: isSelected ? `2px solid ${color}` : 'none',
        outlineOffset: 2,
        transition: 'background-color 0.1s, border-color 0.1s',
      }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    />
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
