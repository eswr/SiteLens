import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';

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
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBe(5);
    const parcels = body.data.find((l: { id: string }) => l.id === 'parcels');
    expect(parcels.geometryType).toBe('polygon');
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
  it('returns up to 8 results for a matching query', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/search?q=exchange' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.length).toBeLessThanOrEqual(8);
  });

  it('returns an array (possibly empty) for q=central', async () => {
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
    const body = res.json();
    expect(body.error.code).toBe('BAD_REQUEST');
    expect(body.error.details).toBeDefined();
  });

  it('returns 501 for a valid polygon body (placeholder)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/analyze-area',
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
    expect(res.statusCode).toBe(501);
    expect(res.json().error.code).toBe('NOT_IMPLEMENTED');
  });
});

describe('POST /api/planning-summary', () => {
  it('returns 501 for a valid minimal body (placeholder)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/planning-summary',
      payload: { areaId: 'demo' },
    });
    expect(res.statusCode).toBe(501);
    expect(res.json().error.code).toBe('NOT_IMPLEMENTED');
  });
});
