import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { SpatialAnalysisResult } from '@sitelens/shared';

// Deterministic, DB-free billing gating + observable usage.
const { billingMock } = vi.hoisted(() => ({
  billingMock: { usage: 0, recordUsageCalls: 0 },
}));
vi.mock('../billing/billingRepository', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../billing/billingRepository')>();
  return {
    ...actual,
    getBillingContextForUser: async (userId: string | null) =>
      actual.demoFallbackContext(userId ?? null),
    recordUsage: async () => {
      billingMock.recordUsageCalls += 1;
    },
    getUsage: async () => billingMock.usage,
  };
});

// In-memory, Redis-free cache so hit/miss/error are deterministic.
const { cacheMock } = vi.hoisted(() => ({
  cacheMock: { mode: 'memory' as 'memory' | 'error', store: new Map<string, unknown>() },
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
      if (cacheMock.mode === 'error') {
        const data = await compute();
        return { data, cache: 'error', computedAt: new Date().toISOString() };
      }
      if (cacheMock.store.has(key)) {
        return cacheMock.store.get(key);
      }
      const data = await compute();
      const miss = { data, cache: 'miss', computedAt: new Date().toISOString() };
      cacheMock.store.set(key, { ...miss, cache: 'hit' });
      return miss;
    },
  };
});

// Count generator calls without losing real deterministic output.
const { genMock } = vi.hoisted(() => ({ genMock: { calls: 0 } }));
vi.mock('../summary/generatePlanningSummary', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../summary/generatePlanningSummary')>();
  return {
    generatePlanningSummary: (input: Parameters<typeof actual.generatePlanningSummary>[0]) => {
      genMock.calls += 1;
      return actual.generatePlanningSummary(input);
    },
  };
});

const { buildApp } = await import('../app');

const analysisResult: SpatialAnalysisResult = {
  areaSqm: 120000,
  areaHectares: 12,
  parcelCount: 4,
  averageDevelopmentScore: 82,
  zoningBreakdown: [{ zoneCode: 'R1', zoneName: 'General Residential', count: 4 }],
  intersectingConstraints: [
    { id: 'c1', constraintType: 'Flood', riskLevel: 'medium', description: 'x' },
  ],
  nearbyTransit: [{ id: 't1', name: 'Central', mode: 'train', distanceMeters: 200 }],
  developmentActivityCount: 1,
  developmentActivityByStatus: [{ status: 'Approved', count: 1 }],
};

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

beforeEach(() => {
  billingMock.usage = 0;
  billingMock.recordUsageCalls = 0;
  cacheMock.mode = 'memory';
  cacheMock.store.clear();
  genMock.calls = 0;
});

afterAll(async () => {
  await app.close();
});

function post(key?: string, payload: object = { analysisResult }) {
  return app.inject({
    method: 'POST',
    url: '/api/planning-summary',
    headers: key ? { 'x-api-key': key } : {},
    payload,
  });
}

describe('POST /api/planning-summary entitlement', () => {
  it('anonymous (free) is forbidden', async () => {
    const res = await post();
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
  });

  it('viewer (free) is forbidden', async () => {
    const res = await post('demo-viewer-key');
    expect(res.statusCode).toBe(403);
  });

  it('planner (pro) can generate a deterministic summary', async () => {
    const res = await post('demo-planner-key');
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.engine).toBe('deterministic-backend');
    expect(body.data.summary.sections).toHaveLength(5);
    expect(body.data.summary.sourceMetrics.parcelCount).toBe(4);
    expect(body.meta.access.plan).toBe('pro');
  });

  it('admin (enterprise) can generate a summary', async () => {
    const res = await post('demo-admin-key');
    expect(res.statusCode).toBe(200);
    expect(res.json().data.summary.sourceMetrics.constraintCount).toBe(1);
  });
});

describe('POST /api/planning-summary validation', () => {
  it('rejects a body without analysisResult (400)', async () => {
    const res = await post('demo-planner-key', { context: {} });
    expect(res.statusCode).toBe(400);
  });

  it('rejects a malformed analysisResult (400)', async () => {
    const res = await post('demo-planner-key', {
      analysisResult: { areaSqm: 'nope' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/planning-summary caching', () => {
  it('second identical request is a cache hit and does not recompute', async () => {
    const first = await post('demo-planner-key');
    expect(first.json().meta.cache).toBe('miss');
    expect(genMock.calls).toBe(1);

    const second = await post('demo-planner-key');
    expect(second.json().meta.cache).toBe('hit');
    expect(genMock.calls).toBe(1);
  });

  it('cache error still returns a generated summary', async () => {
    cacheMock.mode = 'error';
    const res = await post('demo-planner-key');
    expect(res.statusCode).toBe(200);
    expect(res.json().meta.cache).toBe('error');
    expect(res.json().data.summary.sections).toHaveLength(5);
  });
});

describe('POST /api/planning-summary usage metering', () => {
  it('records usage after a successful generation', async () => {
    await post('demo-planner-key');
    expect(billingMock.recordUsageCalls).toBe(1);
  });

  it('does not record usage on entitlement denial', async () => {
    await post('demo-viewer-key');
    expect(billingMock.recordUsageCalls).toBe(0);
  });

  it('returns 429 ENTITLEMENT_LIMIT_EXCEEDED when the monthly limit is hit', async () => {
    billingMock.usage = 50; // pro summaryRunsPerMonth = 50
    const res = await post('demo-planner-key');
    expect(res.statusCode).toBe(429);
    expect(res.json().error.code).toBe('ENTITLEMENT_LIMIT_EXCEEDED');
    expect(billingMock.recordUsageCalls).toBe(0);
  });
});
