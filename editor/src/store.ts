import { create } from 'zustand';
import type { AdElement, CapturedAd } from './types';

interface AdStore {
  ads: CapturedAd[];
  previousAds: CapturedAd[] | null;
  selectedAdId: string | null;
  selectedElementId: string | null;

  setAds: (ads: CapturedAd[]) => void;
  addAd: (ad: CapturedAd) => void;
  removeAd: (adId: string) => void;
  updateElement: (adId: string, elementId: string, patch: Partial<AdElement>) => void;
  selectElement: (adId: string | null, elementId: string | null) => void;
  setAdElements: (adId: string, elements: AdElement[]) => void;
  undo: () => void;
}

export const useAdStore = create<AdStore>((set) => ({
  ads: [],
  previousAds: null,
  selectedAdId: null,
  selectedElementId: null,

  setAds: (ads) => set({ ads, selectedAdId: null, selectedElementId: null }),

  addAd: (ad) =>
    set((state) => ({ ads: [...state.ads, ad] })),

  removeAd: (adId) =>
    set((state) => ({
      ads: state.ads.filter((a) => a.id !== adId),
      selectedAdId: state.selectedAdId === adId ? null : state.selectedAdId,
      selectedElementId: state.selectedAdId === adId ? null : state.selectedElementId,
    })),

  updateElement: (adId, elementId, patch) =>
    set((state) => ({
      ads: state.ads.map((ad) =>
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
      ),
    })),

  selectElement: (adId, elementId) =>
    set({ selectedAdId: adId, selectedElementId: elementId }),

  setAdElements: (adId, elements) =>
    set((state) => ({
      previousAds: state.ads,
      ads: state.ads.map((ad) => (ad.id === adId ? { ...ad, elements } : ad)),
    })),

  undo: () =>
    set((state) =>
      state.previousAds ? { ads: state.previousAds, previousAds: null } : state
    ),
}));
