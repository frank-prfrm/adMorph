import { create } from 'zustand';
import type { AdElement } from './types';

interface AdStore {
  elements: AdElement[];
  previousElements: AdElement[] | null;
  selectedId: string | null;

  setElements: (elements: AdElement[]) => void;
  updateElement: (id: string, patch: Partial<AdElement>) => void;
  selectElement: (id: string | null) => void;
  undo: () => void;
}

export const useAdStore = create<AdStore>((set) => ({
  elements: [],
  previousElements: null,
  selectedId: null,

  setElements: (elements) =>
    set((state) => ({
      previousElements: state.elements.length ? state.elements : null,
      elements,
      selectedId: null,
    })),

  updateElement: (id, patch) =>
    set((state) => ({
      elements: state.elements.map((el) =>
        el.id === id ? { ...el, ...patch, styles: { ...el.styles, ...(patch.styles ?? {}) } } : el
      ),
    })),

  selectElement: (id) => set({ selectedId: id }),

  undo: () =>
    set((state) =>
      state.previousElements
        ? { elements: state.previousElements, previousElements: null }
        : state
    ),
}));
