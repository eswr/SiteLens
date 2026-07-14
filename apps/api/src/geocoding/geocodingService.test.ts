import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaceSearchResult } from '@sitelens/shared';

const { nominatim } = vi.hoisted(() => ({
  nominatim: {
    calls: 0,
    lastLimit: 0,
    results: [] as PlaceSearchResult[],
  },
}));

vi.mock('./nominatimClient', () => ({
  searchNominatim: vi.fn(async (_query: string, limit: number) => {
    nominatim.calls += 1;
    nominatim.lastLimit = limit;
    return nominatim.results;
  }),
}));

vi.mock('./geocodingRateLimiter', () => ({
  waitForGeocodingSlot: vi.fn(async () => {}),
}));

const { cacheState } = vi.hoisted(() => ({
  cacheState: { store: new Map<string, unknown>() },
}));
vi.mock('../cache/cacheJson', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../cache/cacheJson')>();
  return {
    ...actual,
    cached: async <T>({
      key,
      compute,
    }: {
      key: string;
      ttlSeconds: number;
      compute: () => Promise<T>;
    }) => {
      if (cacheState.store.has(key)) {
        return cacheState.store.get(key);
      }
      const data = await compute();
      const miss = { data, cache: 'miss', computedAt: new Date().toISOString() };
      cacheState.store.set(key, { ...miss, cache: 'hit' });
      return miss;
    },
  };
});

const { searchPlaces, GEOCODING_ATTRIBUTION } = await import('./geocodingService');

const oneResult: PlaceSearchResult = {
  id: '123',
  label: 'Bengaluru, Karnataka, India',
  displayName: 'Bengaluru, Karnataka, India',
  latitude: 12.9768,
  longitude: 77.5901,
  provider: 'nominatim',
};

beforeEach(() => {
  nominatim.calls = 0;
  nominatim.lastLimit = 0;
  nominatim.results = [oneResult];
  cacheState.store.clear();
});

describe('searchPlaces', () => {
  it('rejects a query shorter than 3 characters with a 400', async () => {
    await expect(searchPlaces('ab')).rejects.toMatchObject({ statusCode: 400 });
  });

  it('returns mapped results with attribution on a cache miss', async () => {
    const result = await searchPlaces('bengaluru', 5);
    expect(result.cache).toBe('miss');
    expect(result.response.provider).toBe('nominatim');
    expect(result.response.attribution).toBe(GEOCODING_ATTRIBUTION);
    expect(result.response.results).toEqual([oneResult]);
    expect(nominatim.calls).toBe(1);
  });

  it('serves repeated searches from cache without calling upstream', async () => {
    await searchPlaces('bengaluru', 5);
    const second = await searchPlaces('bengaluru', 5);
    expect(second.cache).toBe('hit');
    expect(nominatim.calls).toBe(1);
  });

  it('clamps the limit to a maximum of 10', async () => {
    await searchPlaces('bengaluru', 50);
    expect(nominatim.lastLimit).toBe(10);
  });
});
