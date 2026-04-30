import { create } from 'zustand';
import type { CapturedAd } from './types';
import {
  saveStoredAds,
  loadStoredScreenshots,
  saveStoredScreenshots,
  deleteStoredScreenshot,
} from './loader';

interface AdStore {
  ads: CapturedAd[];
  adScreenshots: Record<string, string>;

  setAds: (ads: CapturedAd[]) => void;
  addAd: (ad: CapturedAd) => void;
  removeAd: (adId: string) => void;
  setAdScreenshot: (adId: string, screenshot: string) => void;
}

export const useAdStore = create<AdStore>((set) => ({
  ads: [],
  adScreenshots: loadStoredScreenshots(),

  setAds: (ads) => {
    saveStoredAds(ads);
    set({ ads });
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
      deleteStoredScreenshot(adId);
      const { [adId]: _, ...adScreenshots } = state.adScreenshots;
      return { ads, adScreenshots };
    }),

  setAdScreenshot: (adId, screenshot) =>
    set((state) => {
      const adScreenshots = { ...state.adScreenshots, [adId]: screenshot };
      saveStoredScreenshots(adScreenshots);
      return { adScreenshots };
    }),
}));
