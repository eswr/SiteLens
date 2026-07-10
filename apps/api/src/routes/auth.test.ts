import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Mock the DB repository so these gate tests need no Postgres/Redis.
vi.mock('../db/spatialRepository', () => ({
  getLayers: vi.fn(async () => []),
  getParcels: vi.fn(async () => ({
    type: 'FeatureCollection',
    features: Array.from({ length: 10 }, (_, i) => ({
      type: 'Feature',
      id: `parcel-${i}`,
      geometry: { type: 'Polygon', coordinates: [] },
      properties: {},
    })),
  })),
  getParcelById: vi.fn(async () => null),
  // Echo the limit so we can assert result caps by role.
  searchFeatures: vi.fn(async (_q: string, limit: number) =>
    Array.from({ length: limit }, (_, i) => ({
      id: `r${i}`,
      layerId: 'parcels',
      label: 'x',
      subtitle: '',
      properties: {},
      geometry: {},
    })),
  ),
  analyzeArea: vi.fn(async () => ({
    areaSqm: 1,
    areaHectares: 0,
    parcelCount: 0,
    averageDevelopmentScore: null,
    zoningBreakdown: [],
    intersectingConstraints: [],
    nearbyTransit: [],
    developmentActivityCount: 0,
    developmentActivityByStatus: [],
  })),
  InvalidGeometryError: class InvalidGeometryError extends Error {},
}));

const { buildApp } = await import('../app');

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

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

function withKey(key?: string) {
  return key ? { 'x-api-key': key } : {};
}

describe('GET /api/me', () => {
  it('anonymous: no user, cannot run analysis', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/me' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.user).toBeNull();
    expect(body.data.capabilities.canReadLayers).toBe(true);
    expect(body.data.capabilities.canRunAnalysis).toBe(false);
  });

  it('viewer key: role viewer, cannot run analysis', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: withKey('demo-viewer-key'),
    });
    expect(res.json().data.user.role).toBe('viewer');
    expect(res.json().data.capabilities.canRunAnalysis).toBe(false);
  });

  it('planner key: role planner, can run analysis', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: withKey('demo-planner-key'),
    });
    expect(res.json().data.user.role).toBe('planner');
    expect(res.json().data.capabilities.canRunAnalysis).toBe(true);
  });

  it('admin key via Bearer: role admin, can ingest', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: { authorization: 'Bearer demo-admin-key' },
    });
    expect(res.json().data.user.role).toBe('admin');
    expect(res.json().data.capabilities.canIngestData).toBe(true);
  });

  it('invalid key is treated as anonymous', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/me',
      headers: withKey('bogus-key'),
    });
    expect(res.json().data.user).toBeNull();
  });
});

describe('POST /api/analyze-area entitlement gate', () => {
  it('anonymous → 403 FORBIDDEN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyze-area',
      payload: { geometry: validPolygon },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('viewer/free → 403 FORBIDDEN', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyze-area',
      headers: withKey('demo-viewer-key'),
      payload: { geometry: validPolygon },
    });
    expect(res.statusCode).toBe(403);
  });

  it('planner/pro → 200', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyze-area',
      headers: withKey('demo-planner-key'),
      payload: { geometry: validPolygon },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.engine).toBe('postgis');
    expect(res.json().meta.access.plan).toBe('pro');
  });
});

describe('POST /api/planning-summary entitlement gate', () => {
  it('anonymous → 403', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/planning-summary',
      payload: { areaId: 'demo' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('planner → 501 placeholder', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/planning-summary',
      headers: withKey('demo-planner-key'),
      payload: { areaId: 'demo' },
    });
    expect(res.statusCode).toBe(501);
  });
});

describe('GET /api/search entitlement limits', () => {
  it('anonymous is capped at 5 results and marked limited', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=exchange' });
    const body = res.json();
    expect(body.data.length).toBe(5);
    expect(body.meta.access.limited).toBe(true);
    expect(body.meta.cacheKey).toContain(':free:');
  });

  it('planner gets up to 8 results, not limited, with pro cache scope', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=exchange',
      headers: withKey('demo-planner-key'),
    });
    const body = res.json();
    expect(body.data.length).toBe(8);
    expect(body.meta.access.limited).toBe(false);
    expect(body.meta.cacheKey).toContain(':pro:');
  });
});
