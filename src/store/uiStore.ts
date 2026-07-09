import { create } from 'zustand';

export type DetailsTab = 'summary' | 'analytics';

interface UiState {
  /** Active tab in the AOI section of the details panel. */
  detailsTab: DetailsTab;
  setDetailsTab: (tab: DetailsTab) => void;
}

/** Small store for cross-component UI state (kept separate from data stores). */
export const useUiStore = create<UiState>((set) => ({
  detailsTab: 'summary',
  setDetailsTab: (tab) => set({ detailsTab: tab }),
}));
