import type { AdElement, CapturedAd } from './types';

export function registerPostMessageListener(
  onNewAd: (ad: CapturedAd, screenshot?: string) => void
): () => void {
  const handler = (event: MessageEvent) => {
    if (event.data?.action !== 'adMorphData') return;
    try {
      const elements = event.data.elements as AdElement[];
      if (!Array.isArray(elements) || elements.length === 0) return;
      const adId = `ad-${Date.now()}`;
      const prefixed = elements.map((el) => ({ ...el, id: `${adId}:${el.id}` }));
      const newAd: CapturedAd = { id: adId, elements: prefixed, capturedAt: Date.now() };
      const existing = loadStoredAds();
      saveStoredAds([...existing, newAd]);
      onNewAd(newAd, event.data.screenshot ?? undefined);
    } catch {
      // ignore malformed messages
    }
  };
  window.addEventListener('message', handler);
  return () => window.removeEventListener('message', handler);
}

const STORAGE_KEY = 'adMorphAds';

/** Read all saved ads from localStorage. */
export function loadStoredAds(): CapturedAd[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as CapturedAd[];
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

/** Persist the full ads array to localStorage. */
export function saveStoredAds(ads: CapturedAd[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ads));
  } catch {
    // ignore storage errors (quota, private mode)
  }
}

/**
 * Check the URL ?data= param for a newly captured ad.
 * If found: parse it, append to stored ads, clear the URL param, return updated list.
 * If not found: return stored ads as-is.
 */
export function loadAndMergeAds(): CapturedAd[] {
  try {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('data');
    if (encoded) {
      // URL param means a fresh capture session — start clean so previous
      // session's ads don't bleed back in.
      const json = decodeURIComponent(escape(atob(encoded)));
      const elements = JSON.parse(json) as AdElement[];
      if (Array.isArray(elements) && elements.length > 0) {
        const adId = `ad-${Date.now()}`;
        const prefixed = elements.map((el) => ({ ...el, id: `${adId}:${el.id}` }));
        const newAd: CapturedAd = { id: adId, elements: prefixed, capturedAt: Date.now() };
        saveStoredAds([newAd]);
        window.history.replaceState({}, '', window.location.pathname);
        return [newAd];
      }
    }
  } catch {
    // malformed data param — ignore
  }

  // No URL param: restore whatever was in localStorage (e.g. page refresh mid-session)
  return loadStoredAds();
}
