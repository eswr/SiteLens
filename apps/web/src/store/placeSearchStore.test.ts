import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaceSearchResult } from '../api/geocodingApi';
import { STATIC_PLACE_SUGGESTIONS } from '../data/staticPlaceSuggestions';
import {
  MIN_SUGGESTION_QUERY_LENGTH,
  rankPlaceSuggestions,
} from '../utils/placeSuggestions';

const { searchPlaces, isApiConfigured } = vi.hoisted(() => ({
  searchPlaces: vi.fn(),
  isApiConfigured: vi.fn(() => true),
}));

vi.mock('../api/geocodingApi', () => ({
  searchPlaces,
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    isApiConfigured,
  };
});

const { usePlaceSearchStore, MIN_PLACE_QUERY_LENGTH } = await import(
  './placeSearchStore'
);

describe('rankPlaceSuggestions (local pool)', () => {
  it('matches Bengaluru via the Bangalore alias without network I/O', () => {
    const ranked = rankPlaceSuggestions(
      'bangalore',
      STATIC_PLACE_SUGGESTIONS,
      6,
    );
    expect(ranked[0]?.id).toBe('static-demo-bengaluru');
  });

  it('returns no suggestions below the minimum query length', () => {
    expect(
      rankPlaceSuggestions('l', STATIC_PLACE_SUGGESTIONS).length,
    ).toBe(0);
    expect(MIN_SUGGESTION_QUERY_LENGTH).toBe(2);
  });
});

describe('placeSearchStore local-only autocomplete', () => {
  beforeEach(() => {
    isApiConfigured.mockReturnValue(true);
    usePlaceSearchStore.setState({
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
      recentPlaces: [],
      cachedSearchResults: [],
      highlightedSuggestionIndex: -1,
      isSuggesting: false,
      autocompleteMode: 'local-only',
    });
  });

  it('keeps autocompleteMode as local-only', () => {
    expect(usePlaceSearchStore.getState().autocompleteMode).toBe('local-only');
  });

  it('updateQuery ranks local static suggestions and never calls searchPlaces', () => {
    usePlaceSearchStore.getState().updateQuery('lon');

    const state = usePlaceSearchStore.getState();
    expect(state.query).toBe('lon');
    expect(state.suggestions.some((s) => s.id === 'static-demo-london')).toBe(
      true,
    );
    expect(state.isSuggesting).toBe(true);
    expect(searchPlaces).not.toHaveBeenCalled();
  });

  it('does not suggest for queries shorter than the local minimum', () => {
    usePlaceSearchStore.getState().updateQuery('b');
    const state = usePlaceSearchStore.getState();
    expect(state.suggestions).toEqual([]);
    expect(state.isSuggesting).toBe(false);
    expect(searchPlaces).not.toHaveBeenCalled();
  });

  it('includes remembered explicit-search results in later local suggestions', () => {
    const remembered: PlaceSearchResult = {
      id: 'nominatim-custom-place',
      label: 'Customville',
      displayName: 'Customville, Testland',
      latitude: 1,
      longitude: 2,
      provider: 'nominatim',
    };
    usePlaceSearchStore.getState().rememberSearchResults([remembered]);
    usePlaceSearchStore.getState().updateQuery('custom');

    const state = usePlaceSearchStore.getState();
    expect(
      state.suggestions.some((s) => s.id === 'nominatim-custom-place'),
    ).toBe(true);
    expect(searchPlaces).not.toHaveBeenCalled();
  });

  it('only hits the network from explicit search()', async () => {
    searchPlaces.mockResolvedValue({
      results: [
        {
          id: 'nominatim-paris',
          label: 'Paris',
          displayName: 'Paris, France',
          latitude: 48.8566,
          longitude: 2.3522,
          provider: 'nominatim',
        },
      ],
      attribution: '© OpenStreetMap',
      provider: 'nominatim',
      fallback: null,
      meta: { cache: 'miss' },
    });

    usePlaceSearchStore.getState().updateQuery('par');
    expect(searchPlaces).not.toHaveBeenCalled();

    await usePlaceSearchStore.getState().search('Paris');
    expect(searchPlaces).toHaveBeenCalledTimes(1);
    expect(searchPlaces).toHaveBeenCalledWith('Paris', 5);
    expect(usePlaceSearchStore.getState().results[0]?.id).toBe(
      'nominatim-paris',
    );
  });

  it('requires API mode for explicit search and enforces min length', async () => {
    isApiConfigured.mockReturnValue(false);
    await usePlaceSearchStore.getState().search('Paris');
    expect(usePlaceSearchStore.getState().error).toMatch(/VITE_API_BASE_URL/);
    expect(searchPlaces).not.toHaveBeenCalled();

    isApiConfigured.mockReturnValue(true);
    await usePlaceSearchStore.getState().search('ab');
    expect(usePlaceSearchStore.getState().error).toMatch(
      new RegExp(`${MIN_PLACE_QUERY_LENGTH}`),
    );
    expect(searchPlaces).not.toHaveBeenCalled();
  });
});
