import { create } from 'zustand';
import type {
  GeocodingProvider,
  PlaceSearchFallback,
  PlaceSearchResult,
  PlaceSuggestion,
  PlaceSuggestionSource,
} from '../api/geocodingApi';
import { searchPlaces } from '../api/geocodingApi';
import { ApiError, isApiConfigured, type CacheStatus } from '../api/client';
import { STATIC_PLACE_SUGGESTIONS } from '../data/staticPlaceSuggestions';
import { useMapStore } from './mapStore';
import { useAnalysisStore } from './analysisStore';
import {
  DEFAULT_SUGGESTION_LIMIT,
  MIN_SUGGESTION_QUERY_LENGTH,
  placeResultToSuggestion,
  rankPlaceSuggestions,
  suggestionToPlaceResult,
} from '../utils/placeSuggestions';

export const MIN_PLACE_QUERY_LENGTH = 3;
export { MIN_SUGGESTION_QUERY_LENGTH };

const DEFAULT_LIMIT = 5;
const MAX_RECENT_PLACES = 10;
const RECENT_STORAGE_KEY = 'sitelens:recent-place-suggestions:v1';

const STATIC_DEMO_ATTRIBUTION =
  'Static demo place dataset for offline portfolio fallback. Map data © OpenStreetMap contributors.';
const NOMINATIM_ATTRIBUTION =
  '© OpenStreetMap contributors; geocoding by Nominatim';

function attributionForSuggestion(suggestion: PlaceSuggestion): string {
  if (suggestion.provider === 'static-demo') {
    return STATIC_DEMO_ATTRIBUTION;
  }
  return NOMINATIM_ATTRIBUTION;
}

function loadRecentPlaces(): PlaceSuggestion[] {
  try {
    const raw = localStorage.getItem(RECENT_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(isValidSuggestion)
      .slice(0, MAX_RECENT_PLACES)
      .map((place) => ({ ...place, source: 'recent' as const }));
  } catch {
    return [];
  }
}

function isValidSuggestion(value: unknown): value is PlaceSuggestion {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const place = value as Partial<PlaceSuggestion>;
  return (
    typeof place.id === 'string' &&
    typeof place.label === 'string' &&
    typeof place.displayName === 'string' &&
    typeof place.latitude === 'number' &&
    typeof place.longitude === 'number' &&
    (place.provider === 'nominatim' || place.provider === 'static-demo')
  );
}

function persistRecentPlaces(places: PlaceSuggestion[]): void {
  try {
    localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(places));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function buildCandidatePool(
  recentPlaces: PlaceSuggestion[],
  cachedSearchResults: PlaceSuggestion[],
): PlaceSuggestion[] {
  return [
    ...recentPlaces.map((place) => ({ ...place, source: 'recent' as const })),
    ...cachedSearchResults,
    ...STATIC_PLACE_SUGGESTIONS,
  ];
}

interface PlaceSearchState {
  query: string;
  results: PlaceSearchResult[];
  isLoading: boolean;
  error: string | null;
  selectedPlace: PlaceSearchResult | null;
  /** How the current selection was chosen (local suggestion), if applicable. */
  selectedSuggestionSource: PlaceSuggestionSource | null;
  cacheStatus: CacheStatus | null;
  computedAt: string | null;
  attribution: string | null;
  provider: GeocodingProvider | null;
  fallback: PlaceSearchFallback | null;
  suggestions: PlaceSuggestion[];
  recentPlaces: PlaceSuggestion[];
  /** Explicit search results remembered for this session's local autocomplete. */
  cachedSearchResults: PlaceSuggestion[];
  highlightedSuggestionIndex: number;
  isSuggesting: boolean;
  autocompleteMode: 'local-only';
  /** Update the query text and recompute local suggestions (no network). */
  updateQuery: (query: string) => void;
  /** Recompute suggestions from the current query + local pools. */
  computeSuggestions: () => void;
  highlightSuggestion: (index: number) => void;
  highlightNextSuggestion: () => void;
  highlightPreviousSuggestion: () => void;
  selectHighlightedSuggestion: () => void;
  selectSuggestion: (suggestion: PlaceSuggestion) => void;
  rememberSearchResults: (results: PlaceSearchResult[]) => void;
  clearSuggestions: () => void;
  /** @deprecated Prefer updateQuery — kept for callers that only set text. */
  setQuery: (query: string) => void;
  /** Run a worldwide place search (explicit submit only). */
  search: (query: string) => Promise<void>;
  /** Select a place from explicit search results. */
  selectPlace: (place: PlaceSearchResult) => void;
  /** Clear only the selected place (keeps query/results). */
  clearSelectedPlace: () => void;
  /** Reset all place-search state (keeps persisted recent places). */
  clear: () => void;
}

function computeSuggestionsForQuery(
  query: string,
  recentPlaces: PlaceSuggestion[],
  cachedSearchResults: PlaceSuggestion[],
): PlaceSuggestion[] {
  return rankPlaceSuggestions(
    query,
    buildCandidatePool(recentPlaces, cachedSearchResults),
    DEFAULT_SUGGESTION_LIMIT,
  );
}

export const usePlaceSearchStore = create<PlaceSearchState>((set, get) => ({
  query: '',
  results: [],
  isLoading: false,
  error: null,
  selectedPlace: null,
  selectedSuggestionSource: null,
  cacheStatus: null,
  computedAt: null,
  attribution: null,
  provider: null,
  fallback: null,
  suggestions: [],
  recentPlaces: typeof localStorage !== 'undefined' ? loadRecentPlaces() : [],
  cachedSearchResults: [],
  highlightedSuggestionIndex: -1,
  isSuggesting: false,
  autocompleteMode: 'local-only',

  updateQuery: (query) => {
    const { recentPlaces, cachedSearchResults } = get();
    const suggestions = computeSuggestionsForQuery(
      query,
      recentPlaces,
      cachedSearchResults,
    );
    set({
      query,
      suggestions,
      isSuggesting: suggestions.length > 0,
      highlightedSuggestionIndex: -1,
    });
  },

  computeSuggestions: () => {
    const { query, recentPlaces, cachedSearchResults } = get();
    const suggestions = computeSuggestionsForQuery(
      query,
      recentPlaces,
      cachedSearchResults,
    );
    set({
      suggestions,
      isSuggesting: suggestions.length > 0,
      highlightedSuggestionIndex:
        suggestions.length === 0
          ? -1
          : Math.min(
              Math.max(get().highlightedSuggestionIndex, -1),
              suggestions.length - 1,
            ),
    });
  },

  highlightSuggestion: (index) => {
    const { suggestions } = get();
    if (index < 0 || index >= suggestions.length) {
      return;
    }
    set({
      highlightedSuggestionIndex: index,
      isSuggesting: true,
    });
  },

  highlightNextSuggestion: () => {
    const { suggestions, highlightedSuggestionIndex } = get();
    if (suggestions.length === 0) {
      return;
    }
    const next =
      highlightedSuggestionIndex < 0
        ? 0
        : (highlightedSuggestionIndex + 1) % suggestions.length;
    set({ highlightedSuggestionIndex: next, isSuggesting: true });
  },

  highlightPreviousSuggestion: () => {
    const { suggestions, highlightedSuggestionIndex } = get();
    if (suggestions.length === 0) {
      return;
    }
    const prev =
      highlightedSuggestionIndex <= 0
        ? suggestions.length - 1
        : highlightedSuggestionIndex - 1;
    set({ highlightedSuggestionIndex: prev, isSuggesting: true });
  },

  selectHighlightedSuggestion: () => {
    const { suggestions, highlightedSuggestionIndex, selectSuggestion } =
      get();
    if (
      highlightedSuggestionIndex < 0 ||
      highlightedSuggestionIndex >= suggestions.length
    ) {
      return;
    }
    selectSuggestion(suggestions[highlightedSuggestionIndex]!);
  },

  selectSuggestion: (suggestion) => {
    useAnalysisStore.getState().cancelDrawing();
    useMapStore.getState().setSelectedFeature(null);

    const place = suggestionToPlaceResult(suggestion);
    const recentEntry: PlaceSuggestion = {
      ...suggestion,
      source: 'recent',
    };
    const recentPlaces = [
      recentEntry,
      ...get().recentPlaces.filter((item) => item.id !== suggestion.id),
    ].slice(0, MAX_RECENT_PLACES);
    persistRecentPlaces(recentPlaces);

    set({
      selectedPlace: place,
      selectedSuggestionSource: suggestion.source,
      attribution: attributionForSuggestion(suggestion),
      provider: suggestion.provider,
      fallback:
        suggestion.provider === 'static-demo'
          ? {
              active: true,
              reason: 'geocoding_disabled',
              message:
                'This is a bundled demo suggestion. Live geocoding runs only on explicit Search.',
            }
          : null,
      recentPlaces,
      suggestions: [],
      isSuggesting: false,
      highlightedSuggestionIndex: -1,
      query: suggestion.label,
    });
  },

  rememberSearchResults: (results) => {
    if (results.length === 0) {
      return;
    }
    const remembered = results.map((result) =>
      placeResultToSuggestion(result, 'cached-search-result'),
    );
    // Dedupe by id, newest search first.
    const byId = new Map<string, PlaceSuggestion>();
    for (const item of remembered) {
      byId.set(item.id, item);
    }
    for (const item of get().cachedSearchResults) {
      if (!byId.has(item.id)) {
        byId.set(item.id, item);
      }
    }
    set({ cachedSearchResults: Array.from(byId.values()) });
  },

  clearSuggestions: () =>
    set({
      suggestions: [],
      isSuggesting: false,
      highlightedSuggestionIndex: -1,
    }),

  setQuery: (query) => get().updateQuery(query),

  search: async (query) => {
    const trimmed = query.trim();
    set({
      query,
      suggestions: [],
      isSuggesting: false,
      highlightedSuggestionIndex: -1,
    });
    if (!isApiConfigured()) {
      set({
        error:
          'Worldwide place search requires backend API mode. Set VITE_API_BASE_URL to enable it.',
        results: [],
        provider: null,
        fallback: null,
      });
      return;
    }
    if (trimmed.length < MIN_PLACE_QUERY_LENGTH) {
      set({
        error: `Enter at least ${MIN_PLACE_QUERY_LENGTH} characters to search places.`,
        results: [],
        provider: null,
        fallback: null,
      });
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const { results, attribution, provider, fallback, meta } =
        await searchPlaces(trimmed, DEFAULT_LIMIT);
      get().rememberSearchResults(results);
      set({
        results,
        attribution,
        provider,
        fallback,
        cacheStatus: meta?.cache ?? null,
        computedAt: meta?.computedAt ?? null,
        isLoading: false,
        error: null,
      });
    } catch (error) {
      set({
        isLoading: false,
        results: [],
        provider: null,
        fallback: null,
        error:
          error instanceof ApiError || error instanceof Error
            ? error.message
            : 'Failed to search places.',
      });
    }
  },

  selectPlace: (place) => {
    useAnalysisStore.getState().cancelDrawing();
    useMapStore.getState().setSelectedFeature(null);

    const recentEntry = placeResultToSuggestion(place, 'recent');
    const recentPlaces = [
      recentEntry,
      ...get().recentPlaces.filter((item) => item.id !== place.id),
    ].slice(0, MAX_RECENT_PLACES);
    persistRecentPlaces(recentPlaces);

    set({
      selectedPlace: place,
      selectedSuggestionSource: null,
      // Keep live-search attribution when present; otherwise derive from provider.
      attribution:
        get().attribution ??
        attributionForSuggestion(placeResultToSuggestion(place)),
      provider: place.provider,
      recentPlaces,
      suggestions: [],
      isSuggesting: false,
      highlightedSuggestionIndex: -1,
    });
  },

  clearSelectedPlace: () =>
    set({ selectedPlace: null, selectedSuggestionSource: null }),

  clear: () =>
    set({
      query: '',
      results: [],
      error: null,
      selectedPlace: null,
      selectedSuggestionSource: null,
      cacheStatus: null,
      computedAt: null,
      attribution: null,
      provider: null,
      fallback: null,
      suggestions: [],
      isSuggesting: false,
      highlightedSuggestionIndex: -1,
      cachedSearchResults: [],
    }),
}));
