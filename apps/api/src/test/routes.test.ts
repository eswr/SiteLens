import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Route tests mock the DB-backed repository so they run without Postgres.
vi.mock('../db/spatialRepository', () => {
  const layers = [
    { id: 'zoning', label: 'Zoning', description: '', geometryType: 'polygon', featureCount: 4 },
    { id: 'parcels', label: 'Parcels', description: '', geometryType: 'polygon', featureCount: 10 },
    { id: 'constraints', label: 'Constraints', description: '', geometryType: 'polygon', featureCount: 3 },
    { id: 'transit', label: 'Transit', description: '', geometryType: 'point', featureCount: 6 },
    { id: 'developmentActivity', label: 'Development Activity', description: '', geometryType: 'point', featureCount: 6 },
  ];
  const parcel = {
    type: 'Feature',
    id: 'parcel-001',
    geometry: { type: 'Polygon', coordinates: [] },
    properties: { parcelId: 'LOT-1-DP1001', name: '12 George Street' },
  };
  return {
    getLayers: vi.fn(async () => layers),
    getParcels: vi.fn(async () => ({ type: 'FeatureCollection', features: [parcel] })),
    getParcelById: vi.fn(async (id: string) =>
      id === 'parcel-001' || id === 'LOT-1-DP1001' ? parcel : null,
    ),
    searchFeatures: vi.fn(async (q: string) =>
      q.toLowerCase().includes('exchange')
        ? [
            {
              id: 'parcel-006',
              layerId: 'parcels',
              label: '77 Exchange Place',
              subtitle: 'LOT-6-DP1003',
              properties: {},
              geometry: { type: 'Point', coordinates: [151.21, -33.868] },
            },
          ]
        : [],
    ),
    analyzeArea: vi.fn(async () => ({
      areaSqm: 12345,
      areaHectares: 1.23,
      parcelCount: 4,
      averageDevelopmentScore: 72.5,
      zoningBreakdown: [],
      intersectingConstraints: [],
      nearbyTransit: [],
      developmentActivityCount: 2,
      developmentActivityByStatus: [],
    })),
    InvalidGeometryError: class InvalidGeometryError extends Error {},
  };
});

// Resolve billing from demo-user defaults (no DB) for deterministic gating.
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

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('GET /api/layers', () => {
  it('returns layer metadata with feature counts', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/layers' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBe(5);
    const parcels = body.data.find((l: { id: string }) => l.id === 'parcels');
    expect(parcels.featureCount).toBeGreaterThan(0);
  });
});

describe('GET /api/parcels', () => {
  it('returns a FeatureCollection with count metadata', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/parcels' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.type).toBe('FeatureCollection');
    expect(body.meta.count).toBe(body.data.features.length);
  });

  it('returns a single parcel by parcelId', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/parcels/parcel-001' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.type).toBe('Feature');
  });

  it('404s for an unknown parcel', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/parcels/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
  });
});

describe('GET /api/search', () => {
  it('returns results for a matching query', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=exchange' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.length).toBeLessThanOrEqual(8);
  });

  it('returns an array for q=central', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=central' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
  });

  it('returns no results for an empty query', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
  });
});

describe('POST /api/analyze-area', () => {
  it('rejects an invalid body with a validation error envelope', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyze-area',
      payload: { geometry: { type: 'Point', coordinates: [1, 2] } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
    expect(res.json().error.details).toBeDefined();
  });

  it('returns 200 with a PostGIS result for a valid polygon body (planner)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyze-area',
      headers: { 'x-api-key': 'demo-planner-key' },
      payload: {
        geometry: {
          type: 'Polygon',
          coordinates: [
            [
              [151.2, -33.87],
              [151.21, -33.87],
              [151.21, -33.86],
              [151.2, -33.87],
            ],
          ],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.engine).toBe('postgis');
    expect(body.data.result.areaSqm).toBeGreaterThan(0);
  });
});

describe('POST /api/planning-summary', () => {
  it('returns a deterministic backend summary for a planner', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/planning-summary',
      headers: { 'x-api-key': 'demo-planner-key' },
      payload: {
        analysisResult: {
          areaSqm: 1000,
          areaHectares: 0.1,
          parcelCount: 0,
          averageDevelopmentScore: null,
          zoningBreakdown: [],
          intersectingConstraints: [],
          nearbyTransit: [],
          developmentActivityCount: 0,
          developmentActivityByStatus: [],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.engine).toBe('deterministic-backend');
    expect(res.json().data.summary.sections).toHaveLength(5);
  });
});
