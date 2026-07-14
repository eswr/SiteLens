import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { PlaceSearchResult } from '@sitelens/shared';

const { nominatim } = vi.hoisted(() => ({
  nominatim: {
    calls: 0,
    lastLimit: 0,
    mode: 'ok' as 'ok' | 'error',
    results: [] as PlaceSearchResult[],
  },
}));

vi.mock('../geocoding/nominatimClient', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../geocoding/nominatimClient')>();
  const { HttpError } = await import('../auth/requireCapability');
  return {
    ...actual,
    searchNominatim: vi.fn(async (_query: string, limit: number) => {
      nominatim.calls += 1;
      nominatim.lastLimit = limit;
      if (nominatim.mode === 'error') {
        throw new HttpError(
          502,
          'GEOCODING_UPSTREAM_ERROR',
          'upstream failed',
        );
      }
      return nominatim.results;
    }),
  };
});

vi.mock('../geocoding/geocodingRateLimiter', () => ({
  waitForGeocodingSlot: vi.fn(async () => {}),
  resetGeocodingRateLimiter: () => {},
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

const { buildApp } = await import('../app');

const oneResult: PlaceSearchResult = {
  id: '123',
  label: 'Bengaluru, Karnataka, India',
  displayName: 'Bengaluru, Bangalore North, Bengaluru Urban, Karnataka, India',
  latitude: 12.9768,
  longitude: 77.5901,
  boundingBox: [12.834, 13.143, 77.46, 77.784],
  category: 'place',
  type: 'city',
  importance: 0.72,
  provider: 'nominatim',
};

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

beforeEach(() => {
  nominatim.calls = 0;
  nominatim.lastLimit = 0;
  nominatim.mode = 'ok';
  nominatim.results = [oneResult];
  cacheState.store.clear();
  delete process.env.GEOCODING_ENABLED;
});

afterAll(async () => {
  delete process.env.GEOCODING_ENABLED;
  await app.close();
});

function get(url: string) {
  return app.inject({ method: 'GET', url });
}

describe('GET /api/geocode/search', () => {
  it('returns 400 for a query shorter than 3 characters', async () => {
    const res = await get('/api/geocode/search?q=ab');
    expect(res.statusCode).toBe(400);
  });

  it('returns mapped results with attribution (cache miss)', async () => {
    const res = await get('/api/geocode/search?q=bengaluru&limit=5');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.provider).toBe('nominatim');
    expect(body.data.attribution).toContain('OpenStreetMap');
    expect(body.data.results[0]).toMatchObject({ id: '123', provider: 'nominatim' });
    expect(body.meta.cache).toBe('miss');
    expect(nominatim.calls).toBe(1);
  });

  it('serves a repeated search from cache without calling upstream', async () => {
    await get('/api/geocode/search?q=bengaluru&limit=5');
    const res = await get('/api/geocode/search?q=bengaluru&limit=5');
    expect(res.json().meta.cache).toBe('hit');
    expect(nominatim.calls).toBe(1);
  });

  it('clamps the limit to a maximum of 10', async () => {
    await get('/api/geocode/search?q=bengaluru&limit=50');
    expect(nominatim.lastLimit).toBe(10);
  });

  it('maps an upstream failure to a safe 502', async () => {
    nominatim.mode = 'error';
    const res = await get('/api/geocode/search?q=london');
    expect(res.statusCode).toBe(502);
    expect(res.json().error.code).toBe('GEOCODING_UPSTREAM_ERROR');
  });

  it('returns 503 when geocoding is disabled', async () => {
    process.env.GEOCODING_ENABLED = 'false';
    const res = await get('/api/geocode/search?q=london');
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('GEOCODING_DISABLED');
  });
});
