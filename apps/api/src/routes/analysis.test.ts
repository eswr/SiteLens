import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

const { analyzeAreaMock, InvalidGeometryError } = vi.hoisted(() => {
  class InvalidGeometryError extends Error {
    constructor(message = 'Area geometry is invalid') {
      super(message);
      this.name = 'InvalidGeometryError';
    }
  }
  return { analyzeAreaMock: vi.fn(), InvalidGeometryError };
});

vi.mock('../db/spatialRepository', () => ({
  analyzeArea: analyzeAreaMock,
  InvalidGeometryError,
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

const sampleResult = {
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

let app: FastifyInstance;

beforeEach(() => {
  analyzeAreaMock.mockReset();
});

afterAll(async () => {
  if (app) await app.close();
});

async function makeApp(): Promise<FastifyInstance> {
  const instance = await buildApp();
  await instance.ready();
  return instance;
}

describe('POST /api/analyze-area', () => {
  it('returns 400 for a missing body', async () => {
    app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/analyze-area', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
    await app.close();
  });

  it('returns 400 for an unsupported geometry type', async () => {
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyze-area',
      payload: { geometry: { type: 'Point', coordinates: [1, 2] } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('BAD_REQUEST');
    await app.close();
  });

  it('returns 200 with a PostGIS result for a valid polygon (planner)', async () => {
    analyzeAreaMock.mockResolvedValueOnce(sampleResult);
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyze-area',
      headers: { 'x-api-key': 'demo-planner-key' },
      payload: { geometry: validPolygon },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.engine).toBe('postgis');
    expect(body.data.result.parcelCount).toBe(4);
    expect(body.meta.computedAt).toBeDefined();
    await app.close();
  });

  it('returns 400 INVALID_GEOMETRY when the repository rejects the geometry', async () => {
    analyzeAreaMock.mockRejectedValueOnce(new InvalidGeometryError());
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyze-area',
      headers: { 'x-api-key': 'demo-planner-key' },
      payload: { geometry: validPolygon },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_GEOMETRY');
    await app.close();
  });

  it('returns 503 when the database is unavailable', async () => {
    analyzeAreaMock.mockRejectedValueOnce({ code: 'ECONNREFUSED' });
    app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyze-area',
      headers: { 'x-api-key': 'demo-planner-key' },
      payload: { geometry: validPolygon },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json().error.code).toBe('SERVICE_UNAVAILABLE');
    await app.close();
  });
});
