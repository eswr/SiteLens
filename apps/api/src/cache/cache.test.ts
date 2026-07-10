import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// A controllable fake Redis client + repository mocks, so these tests need no
// real Redis or Postgres.
const { fakeRedis, getLayersMock, analyzeAreaMock } = vi.hoisted(() => {
  const fakeRedis = {
    get: vi.fn<(key: string) => Promise<string | null>>(),
    set: vi.fn(async () => 'OK'),
    del: vi.fn(async () => 0),
    scanStream: vi.fn(),
  };
  return {
    fakeRedis,
    getLayersMock: vi.fn(),
    analyzeAreaMock: vi.fn(),
  };
});

vi.mock('./cacheClient', () => ({
  isCacheEnabled: () => true,
  getRedisClient: () => fakeRedis,
  closeRedisClient: async () => {},
  logCacheError: () => {},
}));

vi.mock('../db/spatialRepository', () => ({
  getLayers: getLayersMock,
  getParcels: vi.fn(async () => ({ type: 'FeatureCollection', features: [] })),
  getParcelById: vi.fn(async () => null),
  searchFeatures: vi.fn(async () => []),
  analyzeArea: analyzeAreaMock,
  InvalidGeometryError: class InvalidGeometryError extends Error {},
}));

vi.mock('../billing/billingRepository', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../billing/billingRepository')>();
  return {
    ...actual,
    getBillingContextForUser: async (userId: string | null) =>
      actual.demoFallbackContext(userId ?? null),
    recordUsage: async () => {},
    getUsage: async () => 0,
  };
});

const { buildApp } = await import('../app');

const layers = [
  { id: 'parcels', label: 'Parcels', description: '', geometryType: 'polygon', featureCount: 10 },
];
const analysisResult = {
  areaSqm: 12345,
  areaHectares: 1.23,
  parcelCount: 4,
  averageDevelopmentScore: 72.5,
  zoningBreakdown: [],
  intersectingConstraints: [],
  nearbyTransit: [],
  developmentActivityCount: 2,
  developmentActivityByStatus: [],
};
const validPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [151.205, -33.87],
      [151.215, -33.87],
      [151.215, -33.86],
      [151.205, -33.86],
      [151.205, -33.87],
    ],
  ],
};

let app: FastifyInstance;

beforeEach(async () => {
  fakeRedis.get.mockReset();
  fakeRedis.set.mockClear();
  getLayersMock.mockReset();
  analyzeAreaMock.mockReset();
  app = await buildApp();
  await app.ready();
});

afterEach(async () => {
  await app.close();
});

describe('GET /api/layers caching', () => {
  it('computes from the DB on a cache miss and writes to cache', async () => {
    fakeRedis.get.mockResolvedValue(null);
    getLayersMock.mockResolvedValue(layers);

    const res = await app.inject({ method: 'GET', url: '/api/layers' });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta.cache).toBe('miss');
    expect(getLayersMock).toHaveBeenCalledTimes(1);
    expect(fakeRedis.set).toHaveBeenCalledTimes(1);
  });

  it('returns a cache hit without hitting the DB', async () => {
    fakeRedis.get.mockResolvedValue(
      JSON.stringify({ data: layers, computedAt: '2026-01-01T00:00:00.000Z' }),
    );

    const res = await app.inject({ method: 'GET', url: '/api/layers' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta.cache).toBe('hit');
    expect(body.meta.computedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(body.data).toEqual(layers);
    expect(getLayersMock).not.toHaveBeenCalled();
  });

  it('still returns a DB result with cache="error" when Redis read fails', async () => {
    fakeRedis.get.mockRejectedValue(new Error('redis down'));
    getLayersMock.mockResolvedValue(layers);

    const res = await app.inject({ method: 'GET', url: '/api/layers' });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta.cache).toBe('error');
    expect(getLayersMock).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/analyze-area caching', () => {
  it('returns a cache hit without calling the repository', async () => {
    fakeRedis.get.mockResolvedValue(
      JSON.stringify({ data: analysisResult, computedAt: '2026-01-01T00:00:00.000Z' }),
    );

    const res = await app.inject({
      method: 'POST',
      url: '/api/analyze-area',
      headers: { 'x-api-key': 'demo-planner-key' },
      payload: { geometry: validPolygon },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.engine).toBe('postgis');
    expect(body.meta.cache).toBe('hit');
    expect(body.data.result.parcelCount).toBe(4);
    expect(analyzeAreaMock).not.toHaveBeenCalled();
  });

  it('computes analysis on a cache miss', async () => {
    fakeRedis.get.mockResolvedValue(null);
    analyzeAreaMock.mockResolvedValue(analysisResult);

    const res = await app.inject({
      method: 'POST',
      url: '/api/analyze-area',
      headers: { 'x-api-key': 'demo-planner-key' },
      payload: { geometry: validPolygon },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().meta.cache).toBe('miss');
    expect(analyzeAreaMock).toHaveBeenCalledTimes(1);
  });
});
