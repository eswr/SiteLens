import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlaceSearchResult } from '@sitelens/shared';
import { HttpError } from '../auth/requireCapability.js';
import { resetGeocodingUpstreamState } from './geocodingUpstreamState.js';

const { nominatim } = vi.hoisted(() => ({
  nominatim: {
    calls: 0,
    lastLimit: 0,
    mode: 'ok' as 'ok' | 'forbidden' | 'rateLimited' | 'timeout' | 'error',
    results: [] as PlaceSearchResult[],
  },
}));

vi.mock('./nominatimClient', () => ({
  searchNominatim: vi.fn(async (_query: string, limit: number) => {
    nominatim.calls += 1;
    nominatim.lastLimit = limit;
    if (nominatim.mode === 'forbidden') {
      throw new HttpError(
        502,
        'GEOCODING_UPSTREAM_FORBIDDEN',
        'denied',
      );
    }
    if (nominatim.mode === 'rateLimited') {
      throw new HttpError(
        502,
        'GEOCODING_UPSTREAM_RATE_LIMITED',
        'rate limited',
      );
    }
    if (nominatim.mode === 'timeout') {
      throw new HttpError(504, 'GEOCODING_UPSTREAM_TIMEOUT', 'timed out');
    }
    if (nominatim.mode === 'error') {
      throw new HttpError(502, 'GEOCODING_UPSTREAM_ERROR', 'unavailable');
    }
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
  const actual = await importOriginal<typeof import('../cache/cacheJson.js')>();
  return {
    ...actual,
    getJson: async <T>(key: string) => {
      if (!cacheState.store.has(key)) {
        return { value: null, status: 'miss' as const };
      }
      const entry = cacheState.store.get(key) as {
        data: T;
        cache: string;
        computedAt: string;
      };
      return {
        value: { data: entry.data, computedAt: entry.computedAt },
        status: 'hit' as const,
      };
    },
    cached: async <T>({
      key,
      compute,
    }: {
      key: string;
      ttlSeconds: number;
      compute: () => Promise<T>;
    }) => {
      if (cacheState.store.has(key)) {
        const entry = cacheState.store.get(key) as {
          data: T;
          cache: string;
          computedAt: string;
        };
        return { data: entry.data, cache: 'hit', computedAt: entry.computedAt };
      }
      const data = await compute();
      const miss = { data, cache: 'miss', computedAt: new Date().toISOString() };
      cacheState.store.set(key, { ...miss, cache: 'hit' });
      return miss;
    },
  };
});

const {
  searchPlaces,
  GEOCODING_ATTRIBUTION,
} = await import('./geocodingService.js');
const { STATIC_DEMO_ATTRIBUTION } = await import('./staticPlaceProvider.js');

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
  nominatim.mode = 'ok';
  nominatim.results = [oneResult];
  cacheState.store.clear();
  resetGeocodingUpstreamState();
  delete process.env.GEOCODING_STATIC_FALLBACK_ENABLED;
  process.env.GEOCODING_STATIC_FALLBACK_ENABLED = 'true';
  process.env.GEOCODING_UPSTREAM_ERROR_COOLDOWN_MS = '60000';
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
    expect(result.response.fallback).toBeUndefined();
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

  it('returns static-demo fallback on Nominatim 403 when fallback enabled', async () => {
    nominatim.mode = 'forbidden';
    const result = await searchPlaces('bengaluru', 5);
    expect(result.response.provider).toBe('static-demo');
    expect(result.response.fallback?.active).toBe(true);
    expect(result.response.fallback?.reason).toBe('upstream_forbidden');
    expect(result.response.attribution).toBe(STATIC_DEMO_ATTRIBUTION);
    expect(result.response.results[0]?.provider).toBe('static-demo');
    expect(nominatim.calls).toBe(1);
  });

  it('returns static-demo fallback on Nominatim 429 when fallback enabled', async () => {
    nominatim.mode = 'rateLimited';
    const result = await searchPlaces('london', 5);
    expect(result.response.provider).toBe('static-demo');
    expect(result.response.fallback?.reason).toBe('upstream_rate_limited');
  });

  it('returns static-demo fallback on timeout when fallback enabled', async () => {
    nominatim.mode = 'timeout';
    const result = await searchPlaces('tokyo', 5);
    expect(result.response.provider).toBe('static-demo');
    expect(result.response.fallback?.reason).toBe('upstream_timeout');
  });

  it('preserves safe 502 when fallback is disabled', async () => {
    process.env.GEOCODING_STATIC_FALLBACK_ENABLED = 'false';
    nominatim.mode = 'forbidden';
    await expect(searchPlaces('paris', 5)).rejects.toMatchObject({
      statusCode: 502,
      code: 'GEOCODING_UPSTREAM_FORBIDDEN',
    });
  });

  it('skips upstream during cooldown and uses static fallback', async () => {
    nominatim.mode = 'forbidden';
    await searchPlaces('sydney', 5);
    expect(nominatim.calls).toBe(1);

    nominatim.mode = 'ok';
    const second = await searchPlaces('new york', 5);
    expect(second.response.provider).toBe('static-demo');
    expect(second.response.fallback?.reason).toBe('cooldown_active');
    expect(nominatim.calls).toBe(1);
  });

  it('caches static fallback responses separately and avoids upstream on hit', async () => {
    nominatim.mode = 'error';
    await searchPlaces('dubai', 5);
    const second = await searchPlaces('dubai', 5);
    expect(second.cache).toBe('hit');
    expect(second.response.provider).toBe('static-demo');
    expect(nominatim.calls).toBe(1);
  });
});
