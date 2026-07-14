import { create } from 'zustand';
import { searchPlaces, type PlaceSearchResult } from '../api/geocodingApi';
import { ApiError, isApiConfigured, type CacheStatus } from '../api/client';
import { useMapStore } from './mapStore';
import { useAnalysisStore } from './analysisStore';

export const MIN_PLACE_QUERY_LENGTH = 3;
const DEFAULT_LIMIT = 5;

interface PlaceSearchState {
  query: string;
  results: PlaceSearchResult[];
  isLoading: boolean;
  error: string | null;
  selectedPlace: PlaceSearchResult | null;
  cacheStatus: CacheStatus | null;
  computedAt: string | null;
  attribution: string | null;
  /** Update the query text (does not trigger a search). */
  setQuery: (query: string) => void;
  /** Run a worldwide place search (explicit submit only). */
  search: (query: string) => Promise<void>;
  /** Select a place: clears local feature selection so the two never conflict. */
  selectPlace: (place: PlaceSearchResult) => void;
  /** Clear only the selected place (keeps query/results). */
  clearSelectedPlace: () => void;
  /** Reset all place-search state. */
  clear: () => void;
}

export const usePlaceSearchStore = create<PlaceSearchState>((set) => ({
  query: '',
  results: [],
  isLoading: false,
  error: null,
  selectedPlace: null,
  cacheStatus: null,
  computedAt: null,
  attribution: null,

  setQuery: (query) => set({ query }),

  search: async (query) => {
    const trimmed = query.trim();
    set({ query });
    if (!isApiConfigured()) {
      set({
        error:
          'Worldwide place search requires backend API mode. Set VITE_API_BASE_URL to enable it.',
        results: [],
      });
      return;
    }
    if (trimmed.length < MIN_PLACE_QUERY_LENGTH) {
      set({
        error: `Enter at least ${MIN_PLACE_QUERY_LENGTH} characters to search places.`,
        results: [],
      });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const { results, attribution, meta } = await searchPlaces(
        trimmed,
        DEFAULT_LIMIT,
      );
      set({
        results,
        attribution,
        cacheStatus: meta?.cache ?? null,
        computedAt: meta?.computedAt ?? null,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        isLoading: false,
        results: [],
        error:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : 'Failed to search places.',
      });
    }
  },

  selectPlace: (place) => {
    // A place selection is independent of local planning features.
    useAnalysisStore.getState().cancelDrawing();
    useMapStore.getState().setSelectedFeature(null);
    set({ selectedPlace: place });
  },

  clearSelectedPlace: () => set({ selectedPlace: null }),

  clear: () =>
    set({
      query: '',
      results: [],
      error: null,
      selectedPlace: null,
      cacheStatus: null,
      computedAt: null,
      attribution: null,
    }),
}));
