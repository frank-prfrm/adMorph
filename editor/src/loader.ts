import type { AdElement } from './types';

/**
 * Reads the ad payload from URL ?data= param (base64-encoded JSON).
 * Falls back to localStorage key "adMorphPayload" for manual testing.
 * Returns null if no data is found.
 */
export function loadAdPayload(): AdElement[] | null {
  try {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('data');
    if (encoded) {
      const json = decodeURIComponent(escape(atob(encoded)));
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) return parsed as AdElement[];
    }
  } catch {
    // fall through to localStorage
  }

  try {
    const raw = localStorage.getItem('adMorphPayload');
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed as AdElement[];
    }
  } catch {
    // ignore
  }

  return null;
}
