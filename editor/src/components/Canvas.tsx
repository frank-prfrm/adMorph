import { MousePointer2, Trash2 } from 'lucide-react';
import { useAdStore } from '../store';
import { LiftSubject } from './LiftSubject';
import type { CapturedAd } from '../types';

interface CanvasProps {
  availableWidth: number;
}

export function Canvas({ availableWidth }: CanvasProps) {
  const ads = useAdStore((s) => s.ads);
  const removeAd = useAdStore((s) => s.removeAd);
  const adScreenshots = useAdStore((s) => s.adScreenshots);

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
              Use the Chrome extension to capture an ad, then press and hold on a subject to lift it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-y-auto h-full bg-slate-900 px-8 py-10">
      <div className="flex flex-col gap-10 items-center">
        {ads.map((ad) => (
          <AdBlock
            key={ad.id}
            ad={ad}
            availableWidth={availableWidth}
            screenshot={adScreenshots[ad.id]}
            onRemove={() => removeAd(ad.id)}
          />
        ))}
      </div>
    </div>
  );
}

function AdBlock({
  ad,
  availableWidth,
  screenshot,
  onRemove,
}: {
  ad: CapturedAd;
  availableWidth: number;
  screenshot?: string;
  onRemove: () => void;
}) {
  const scale = Math.min(availableWidth / ad.width, 1);
  const displayW = Math.round(ad.width * scale);
  const displayH = Math.round(ad.height * scale);

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <div
        style={{
          width: displayW,
          height: displayH,
          position: 'relative',
          overflow: 'hidden',
          background: '#fff',
          boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
        }}
      >
        {screenshot ? (
          <LiftSubject
            adId={ad.id}
            screenshotBase64={screenshot}
            displayWidth={displayW}
            displayHeight={displayH}
          />
        ) : (
          <div className="flex items-center justify-center w-full h-full text-slate-400 text-sm">
            Waiting for screenshot…
          </div>
        )}
      </div>

      <button
        title="Delete this ad"
        onClick={onRemove}
        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/40 transition-colors"
        style={{ position: 'absolute', top: -32, right: 0, zIndex: 9998 }}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
