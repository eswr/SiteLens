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
    getLayerFeatures: vi.fn(async () => ({ type: 'FeatureCollection', features: [parcel] })),
    getParcelById: vi.fn(async (_ctx: string, id: string) =>
      id === 'parcel-001' || id === 'LOT-1-DP1001' ? parcel : null,
    ),
    searchFeatures: vi.fn(async (ctx: string, q: string) => {
      const needle = q.toLowerCase();
      if (ctx === 'external-osm:other:1' && needle.includes('harbor')) {
        return [
          {
            id: 'other-parcel-1',
            layerId: 'parcels',
            label: 'Harbor Hub',
            subtitle: 'OTHER-1',
            properties: {},
            geometry: { type: 'Point', coordinates: [77.59, 12.97] },
          },
        ];
      }
      if (ctx === 'local-demo-sydney' && needle.includes('exchange')) {
        return [
          {
            id: 'parcel-006',
            layerId: 'parcels',
            label: '77 Exchange Place',
            subtitle: 'LOT-6-DP1003',
            properties: {},
            geometry: { type: 'Point', coordinates: [151.21, -33.868] },
          },
        ];
      }
      return [];
    }),
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

vi.mock('../externalData/planningContextRepository', () => ({
  getPlanningContext: vi.fn(async (id: string) =>
    id === 'local-demo-sydney' || id.startsWith('external-osm:')
      ? {
          id,
          label: id === 'local-demo-sydney' ? 'Sydney Demo' : id,
          source: id === 'local-demo-sydney' ? 'local-demo' : 'external-osm',
          status: 'ready',
          center: [151.2093, -33.8688],
          bbox: [151.199, -33.876, 151.22, -33.86],
          disclaimer: 'demo',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }
      : null,
  ),
  listPlanningContexts: vi.fn(async () => [
    {
      id: 'local-demo-sydney',
      label: 'Sydney Demo',
      source: 'local-demo',
      status: 'ready',
      center: [151.2093, -33.8688],
      bbox: [151.199, -33.876, 151.22, -33.86],
      disclaimer: 'demo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ]),
  createOrUpdatePlanningContext: vi.fn(async () => {}),
  commitReadyExternalContext: vi.fn(async () => ({
    sites: 0,
    landUse: 0,
    constraints: 0,
    transit: 0,
    developmentActivity: 0,
    skipped: 0,
    context: {
      id: 'external-osm:x',
      label: 'x',
      source: 'external-osm',
      status: 'ready',
      center: [0, 0],
      bbox: [0, 0, 1, 1],
      disclaimer: 'demo',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  })),
  markPlanningContextBuilding: vi.fn(async () => {}),
  markPlanningContextFailed: vi.fn(async () => {}),
  countContextFeatures: vi.fn(async () => ({
    sites: 0,
    landUse: 0,
    constraints: 0,
    transit: 0,
    developmentActivity: 0,
  })),
}));

vi.mock('../externalData/planningContextBuildJobRepository', () => ({
  getBuildJob: vi.fn(async () => null),
  findActiveBuildJob: vi.fn(async () => null),
  insertBuildJob: vi.fn(async () => ({
    id: '11111111-1111-1111-1111-111111111111',
    planningContextId: 'external-osm:x',
    status: 'queued',
    place: {
      id: 'x',
      label: 'x',
      displayName: 'x',
      latitude: 0,
      longitude: 0,
      provider: 'static-demo',
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })),
  claimNextQueuedBuildJob: vi.fn(async () => null),
  markBuildJobSucceeded: vi.fn(async () => ({})),
  markBuildJobFailed: vi.fn(async () => null),
}));

vi.mock('../externalData/planningContextBuildWorker', () => ({
  nudgePlanningContextBuildWorker: vi.fn(),
  startPlanningContextBuildWorker: vi.fn(),
  stopPlanningContextBuildWorker: vi.fn(),
  runPlanningContextBuildWorkerTick: vi.fn(),
}));

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

  it('returns only rows from the selected planning context', async () => {
    const sydney = await app.inject({
      method: 'GET',
      url: '/api/search?q=harbor&planningContextId=local-demo-sydney',
    });
    expect(sydney.statusCode).toBe(200);
    expect(sydney.json().data).toEqual([]);

    const other = await app.inject({
      method: 'GET',
      url: '/api/search?q=harbor&planningContextId=external-osm:other:1',
    });
    expect(other.statusCode).toBe(200);
    expect(other.json().data).toHaveLength(1);
    expect(other.json().data[0].label).toBe('Harbor Hub');
    expect(other.json().meta.planningContextId).toBe('external-osm:other:1');
  });

  it('returns a clear error for an unknown planningContextId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/search?q=exchange&planningContextId=does-not-exist',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('INVALID_CONTEXT');
    expect(res.json().error.message).toContain('Planning context not found');
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
