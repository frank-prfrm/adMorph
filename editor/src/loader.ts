import type { CapturedAd } from './types';

const STORAGE_KEY = 'adMorphAds';
const SCREENSHOTS_KEY = 'adMorphScreenshots';

interface LegacyElement {
  styles?: { width?: number; height?: number };
}

function adFromMessage(elements: unknown): CapturedAd | null {
  if (!Array.isArray(elements) || elements.length === 0) return null;
  const root = elements[0] as LegacyElement;
  const width = Math.round(root?.styles?.width ?? 300);
  const height = Math.round(root?.styles?.height ?? 250);
  return {
    id: `ad-${Date.now()}`,
    capturedAt: Date.now(),
    width,
    height,
  };
}

export function registerPostMessageListener(
  onNewAd: (ad: CapturedAd, screenshot?: string) => void
): () => void {
  const handler = (event: MessageEvent) => {
    if (event.data?.action !== 'adMorphData') return;
    const ad = adFromMessage(event.data.elements);
    if (!ad) return;
    const existing = loadStoredAds();
    saveStoredAds([...existing, ad]);
    onNewAd(ad, event.data.screenshot ?? undefined);
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

export function loadStoredScreenshots(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SCREENSHOTS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch { /* ignore */ }
  return {};
}

export function saveStoredScreenshots(screenshots: Record<string, string>): void {
  try {
    localStorage.setItem(SCREENSHOTS_KEY, JSON.stringify(screenshots));
  } catch { /* quota exceeded — best effort */ }
}

export function deleteStoredScreenshot(adId: string): void {
  const screenshots = loadStoredScreenshots();
  delete screenshots[adId];
  saveStoredScreenshots(screenshots);
}

export function loadStoredAds(): CapturedAd[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map(migrateStoredAd)
          .filter((a): a is CapturedAd => a !== null);
      }
    }
  } catch { /* ignore parse errors */ }
  return [];
}

// Localstorage may contain ads written by a previous build that stored elements
// instead of width/height. Pull dimensions from elements[0].styles when present;
// fall back to 300x250 (banner default) so old captures still render.
function migrateStoredAd(raw: unknown): CapturedAd | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string') return null;
  const capturedAt = typeof obj.capturedAt === 'number' ? obj.capturedAt : Date.now();

  if (typeof obj.width === 'number' && typeof obj.height === 'number'
      && Number.isFinite(obj.width) && Number.isFinite(obj.height)
      && obj.width > 0 && obj.height > 0) {
    return { id: obj.id, capturedAt, width: obj.width, height: obj.height };
  }

  let width = 300;
  let height = 250;
  const elements = obj.elements;
  if (Array.isArray(elements) && elements.length > 0) {
    const root = elements[0] as LegacyElement;
    const w = root?.styles?.width;
    const h = root?.styles?.height;
    if (typeof w === 'number' && Number.isFinite(w) && w > 0) width = Math.round(w);
    if (typeof h === 'number' && Number.isFinite(h) && h > 0) height = Math.round(h);
  }
  return { id: obj.id, capturedAt, width, height };
}

export function saveStoredAds(ads: CapturedAd[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ads));
  } catch { /* ignore quota errors */ }
}

export function loadAndMergeAds(): CapturedAd[] {
  try {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('data');
    if (encoded) {
      const json = decodeURIComponent(escape(atob(encoded)));
      const ad = adFromMessage(JSON.parse(json));
      if (ad) {
        saveStoredAds([ad]);
        window.history.replaceState({}, '', window.location.pathname);
        return [ad];
      }
    }
  } catch { /* malformed data param */ }
  return loadStoredAds();
}
