import { create } from 'zustand';
import type { AdElement, CapturedAd } from './types';
import { saveStoredAds, loadStoredScreenshots, saveStoredScreenshots, deleteStoredScreenshot } from './loader';

interface AdStore {
  ads: CapturedAd[];
  previousAds: CapturedAd[] | null;
  selectedAdId: string | null;
  selectedElementId: string | null;
  extractingAdIds: string[];
  extractionErrors: Record<string, string>;
  adScreenshots: Record<string, string>;
  adRawJsons: Record<string, string>;
  reExtractRequestId: string | null;

  setAds: (ads: CapturedAd[]) => void;
  addAd: (ad: CapturedAd) => void;
  removeAd: (adId: string) => void;
  updateElement: (adId: string, elementId: string, patch: Partial<AdElement>) => void;
  selectElement: (adId: string | null, elementId: string | null) => void;
  setAdElements: (adId: string, elements: AdElement[]) => void;
  setAdRawJson: (adId: string, rawJson: string) => void;
  revertAd: (adId: string) => void;
  setAdExtracting: (adId: string, extracting: boolean) => void;
  setAdExtractionError: (adId: string, error: string) => void;
  clearAdExtractionError: (adId: string) => void;
  setAdScreenshot: (adId: string, screenshot: string) => void;
  requestReExtract: (adId: string) => void;
  clearReExtractRequest: () => void;
  undo: () => void;
}

export const useAdStore = create<AdStore>((set) => ({
  ads: [],
  previousAds: null,
  selectedAdId: null,
  selectedElementId: null,
  extractingAdIds: [],
  extractionErrors: {},
  adScreenshots: loadStoredScreenshots(),
  adRawJsons: {},
  reExtractRequestId: null,

  setAds: (ads) => {
    const hydrated = ads.map((ad) => ({
      ...ad,
      originalElements: ad.originalElements ?? [...ad.elements],
    }));
    saveStoredAds(hydrated);
    set({ ads: hydrated, selectedAdId: null, selectedElementId: null });
  },

  addAd: (ad) =>
    set((state) => {
      // Freeze originalElements at capture time — never overwritten after this
      const frozenAd = { ...ad, originalElements: ad.originalElements ?? [...ad.elements] };
      const ads = [...state.ads, frozenAd];
      saveStoredAds(ads);
      return { ads };
    }),

  removeAd: (adId) =>
    set((state) => {
      const ads = state.ads.filter((a) => a.id !== adId);
      saveStoredAds(ads);
      deleteStoredScreenshot(adId);
      const { [adId]: _, ...adScreenshots } = state.adScreenshots;
      return {
        ads,
        adScreenshots,
        selectedAdId: state.selectedAdId === adId ? null : state.selectedAdId,
        selectedElementId: state.selectedAdId === adId ? null : state.selectedElementId,
      };
    }),

  updateElement: (adId, elementId, patch) =>
    set((state) => {
      const ads = state.ads.map((ad) =>
        ad.id !== adId
          ? ad
          : {
              ...ad,
              elements: ad.elements.map((el) =>
                el.id !== elementId
                  ? el
                  : { ...el, ...patch, styles: { ...el.styles, ...(patch.styles ?? {}) } }
              ),
            }
      );
      saveStoredAds(ads);
      return { ads };
    }),

  selectElement: (adId, elementId) =>
    set({ selectedAdId: adId, selectedElementId: elementId }),

  setAdElements: (adId, elements) =>
    set((state) => {
      // originalElements is never touched here — only elements changes.
      // Always prepend the original root as the background layer so it
      // survives AI extraction (which produces entirely new element IDs).
      const ad = state.ads.find((a) => a.id === adId);
      const root = ad?.originalElements[0];
      const withBackground = root
        ? [{ ...root, zIndex: 0 }, ...elements]
        : elements;
      const ads = state.ads.map((a) => (a.id === adId ? { ...a, elements: withBackground } : a));
      saveStoredAds(ads);
      return { previousAds: state.ads, ads };
    }),

  setAdRawJson: (adId, rawJson) =>
    set((state) => ({ adRawJsons: { ...state.adRawJsons, [adId]: rawJson } })),

  revertAd: (adId) =>
    set((state) => {
      const ads = state.ads.map((ad) =>
        ad.id === adId ? { ...ad, elements: [...ad.originalElements] } : ad
      );
      saveStoredAds(ads);
      return { previousAds: state.ads, ads };
    }),

  setAdExtracting: (adId, extracting) =>
    set((state) => ({
      extractingAdIds: extracting
        ? [...state.extractingAdIds.filter((id) => id !== adId), adId]
        : state.extractingAdIds.filter((id) => id !== adId),
    })),

  setAdExtractionError: (adId, error) =>
    set((state) => ({ extractionErrors: { ...state.extractionErrors, [adId]: error } })),

  clearAdExtractionError: (adId) =>
    set((state) => {
      const { [adId]: _, ...rest } = state.extractionErrors;
      return { extractionErrors: rest };
    }),

  setAdScreenshot: (adId, screenshot) =>
    set((state) => {
      const adScreenshots = { ...state.adScreenshots, [adId]: screenshot };
      saveStoredScreenshots(adScreenshots);
      return { adScreenshots };
    }),

  requestReExtract: (adId) => set({ reExtractRequestId: adId }),

  clearReExtractRequest: () => set({ reExtractRequestId: null }),

  undo: () =>
    set((state) => {
      if (!state.previousAds) return state;
      saveStoredAds(state.previousAds);
      return { ads: state.previousAds, previousAds: null };
    }),
}));
