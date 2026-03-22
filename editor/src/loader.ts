import type { AdElement, CapturedAd } from './types';

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
  const existing = loadStoredAds();

  try {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('data');
    if (encoded) {
      const json = decodeURIComponent(escape(atob(encoded)));
      const elements = JSON.parse(json) as AdElement[];
      if (Array.isArray(elements) && elements.length > 0) {
        const adId = `ad-${Date.now()}`;
        // Prefix element IDs with the ad ID to avoid collisions across captures
        const prefixed = elements.map((el) => ({ ...el, id: `${adId}:${el.id}` }));
        const newAd: CapturedAd = { id: adId, elements: prefixed, capturedAt: Date.now() };
        const updated = [...existing, newAd];
        saveStoredAds(updated);
        // Remove param so a page refresh doesn't re-add the same ad
        window.history.replaceState({}, '', window.location.pathname);
        return updated;
      }
    }
  } catch {
    // malformed data param — ignore
  }

  return existing;
}
