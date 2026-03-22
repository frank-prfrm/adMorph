import { useEffect, useRef, useState } from 'react';
import { useAdStore } from '../store';
import { CanvasElement } from './CanvasElement';

const CANVAS_W = 1080;
const CANVAS_H = 1080;

export function Canvas() {
  const elements = useAdStore((s) => s.elements);
  const selectedId = useAdStore((s) => s.selectedId);
  const selectElement = useAdStore((s) => s.selectElement);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  // Compute scale so the canvas fits inside the wrapper
  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setScale(Math.min(width / CANVAS_W, height / CANVAS_H, 1));
    });
    if (wrapperRef.current) observer.observe(wrapperRef.current);
    return () => observer.disconnect();
  }, []);

  if (elements.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-3">
        <p className="text-lg font-medium">No ad loaded</p>
        <p className="text-sm">
          Use the Ad-Morph Chrome extension to capture an ad, or paste JSON into
          localStorage key <code className="bg-slate-800 px-1 rounded">adMorphPayload</code> and reload.
        </p>
      </div>
    );
  }

  // Sort by zIndex so elements stack correctly
  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  return (
    <div
      ref={wrapperRef}
      className="flex items-center justify-center w-full h-full overflow-hidden bg-slate-900"
      onClick={() => selectElement(null)}
    >
      <div
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
          position: 'relative',
          flexShrink: 0,
          background: '#fff',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.1)',
        }}
      >
        {sorted.map((el) => (
          <CanvasElement
            key={el.id}
            element={el}
            isSelected={el.id === selectedId}
            onClick={selectElement}
          />
        ))}
      </div>
    </div>
  );
}
