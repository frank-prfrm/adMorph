import { create } from 'zustand';
import type { AdElement, CapturedAd } from './types';
import { saveStoredAds } from './loader';

interface AdStore {
  ads: CapturedAd[];
  previousAds: CapturedAd[] | null;
  selectedAdId: string | null;
  selectedElementId: string | null;
  extractingAdIds: string[];

  setAds: (ads: CapturedAd[]) => void;
  addAd: (ad: CapturedAd) => void;
  removeAd: (adId: string) => void;
  updateElement: (adId: string, elementId: string, patch: Partial<AdElement>) => void;
  selectElement: (adId: string | null, elementId: string | null) => void;
  setAdElements: (adId: string, elements: AdElement[]) => void;
  setAdExtracting: (adId: string, extracting: boolean) => void;
  undo: () => void;
}

export const useAdStore = create<AdStore>((set) => ({
  ads: [],
  previousAds: null,
  selectedAdId: null,
  selectedElementId: null,
  extractingAdIds: [],

  setAds: (ads) => {
    saveStoredAds(ads);
    set({ ads, selectedAdId: null, selectedElementId: null });
  },

  addAd: (ad) =>
    set((state) => {
      const ads = [...state.ads, ad];
      saveStoredAds(ads);
      return { ads };
    }),

  removeAd: (adId) =>
    set((state) => {
      const ads = state.ads.filter((a) => a.id !== adId);
      saveStoredAds(ads);
      return {
        ads,
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
      const ads = state.ads.map((ad) => (ad.id === adId ? { ...ad, elements } : ad));
      saveStoredAds(ads);
      return { previousAds: state.ads, ads };
    }),

  setAdExtracting: (adId, extracting) =>
    set((state) => ({
      extractingAdIds: extracting
        ? [...state.extractingAdIds.filter((id) => id !== adId), adId]
        : state.extractingAdIds.filter((id) => id !== adId),
    })),

  undo: () =>
    set((state) => {
      if (!state.previousAds) return state;
      saveStoredAds(state.previousAds);
      return { ads: state.previousAds, previousAds: null };
    }),
}));
