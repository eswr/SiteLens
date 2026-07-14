import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

const { buildMock, recordUsageMock, listMock, getMock, countMock } = vi.hoisted(
  () => ({
    buildMock: vi.fn(),
    recordUsageMock: vi.fn(async () => {}),
    listMock: vi.fn(),
    getMock: vi.fn(),
    countMock: vi.fn(),
  }),
);
vi.mock('../externalData/planningContextBuilder', () => ({
  buildExternalPlanningContext: buildMock,
  PlanningContextBuildError: class PlanningContextBuildError extends Error {
    code: string;
    statusCode: number;
    constructor(message: string, code: string, statusCode: number) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  },
}));

vi.mock('../externalData/planningContextRepository', () => ({
  listPlanningContexts: listMock,
  getPlanningContext: getMock,
  countContextFeatures: countMock,
}));

vi.mock('../billing/billingRepository', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../billing/billingRepository')>();
  return {
    ...actual,
    getBillingContextForUser: async (userId: string | null) =>
      actual.demoFallbackContext(userId ?? null),
    recordUsage: recordUsageMock,
    getUsage: async () => 0,
  };
});

const { buildApp } = await import('../app');

let app: FastifyInstance;

const sydney = {
  id: 'local-demo-sydney',
  label: 'Sydney Demo',
  source: 'local-demo',
  status: 'ready',
  center: [151.2093, -33.8688],
  bbox: [151.199, -33.876, 151.22, -33.86],
  disclaimer: 'Sydney Demo disclaimer',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  vi.clearAllMocks();
  listMock.mockResolvedValue([sydney]);
  getMock.mockImplementation(async (id: string) =>
    id === 'local-demo-sydney' ? sydney : null,
  );
  countMock.mockResolvedValue({
    sites: 12,
    landUse: 5,
    constraints: 3,
    transit: 8,
    developmentActivity: 4,
  });
});

describe('planning context routes', () => {
  it('lists available planning contexts and never includes failed rows', async () => {
    listMock.mockResolvedValueOnce([sydney]);
    const res = await app.inject({ method: 'GET', url: '/api/planning-contexts' });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.every((c: { status: string }) => c.status === 'ready')).toBe(
      true,
    );
    expect(
      res.json().data.some((c: { status: string }) => c.status === 'failed'),
    ).toBe(false);
  });

  it('returns context detail with feature counts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/planning-contexts/local-demo-sydney',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.context.id).toBe('local-demo-sydney');
    expect(res.json().data.counts).toEqual({
      sites: 12,
      landUse: 5,
      constraints: 3,
      transit: 8,
      developmentActivity: 4,
    });
    expect(countMock).toHaveBeenCalledWith('local-demo-sydney');
  });

  it('returns 404 for unknown planning context id', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/planning-contexts/missing-context',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
    expect(countMock).not.toHaveBeenCalled();
  });

  it('forbids Free/Viewer from building external context', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/planning-contexts/build',
      headers: { 'x-api-key': 'demo-viewer-key' },
      payload: {
        place: {
          id: 'static-demo-bengaluru',
          label: 'Bengaluru',
          displayName: 'Bengaluru, India',
          latitude: 12.9716,
          longitude: 77.5946,
          provider: 'static-demo',
        },
      },
    });
    expect(res.statusCode).toBe(403);
    expect(res.json().error.code).toBe('FORBIDDEN');
    expect(buildMock).not.toHaveBeenCalled();
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it('records usage only for a successful new build, not for reuse', async () => {
    const context = {
      id: 'external-osm:bengaluru:abc123',
      label: 'Bengaluru external context',
      source: 'external-osm',
      status: 'ready',
      center: [77.5946, 12.9716],
      bbox: [77.57, 12.95, 77.62, 12.99],
      disclaimer: 'External context disclaimer',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const counts = {
      sites: 8,
      landUse: 3,
      constraints: 2,
      transit: 4,
      developmentActivity: 1,
    };
    const place = {
      id: 'static-demo-bengaluru',
      label: 'Bengaluru',
      displayName: 'Bengaluru, India',
      latitude: 12.9716,
      longitude: 77.5946,
      provider: 'static-demo',
    };

    buildMock.mockImplementationOnce(
      async (
        _req: unknown,
        options?: { beforeLiveFetch?: () => Promise<void> },
      ) => {
        await options?.beforeLiveFetch?.();
        return { context, counts, reused: false };
      },
    );

    const created = await app.inject({
      method: 'POST',
      url: '/api/planning-contexts/build',
      headers: { 'x-api-key': 'demo-planner-key' },
      payload: { place, source: 'external-osm' },
    });
    expect(created.statusCode).toBe(200);
    expect(recordUsageMock).toHaveBeenCalledWith(
      expect.any(String),
      'external-context:build',
    );

    recordUsageMock.mockClear();
    buildMock.mockResolvedValueOnce({ context, counts, reused: true });

    const reused = await app.inject({
      method: 'POST',
      url: '/api/planning-contexts/build',
      headers: { 'x-api-key': 'demo-planner-key' },
      payload: { place, source: 'external-osm' },
    });
    expect(reused.statusCode).toBe(200);
    expect(reused.json().data.reused).toBe(true);
    expect(recordUsageMock).not.toHaveBeenCalled();
  });

  it('surfaces BUILD_IN_PROGRESS for concurrent builds', async () => {
    const { PlanningContextBuildError } = await import(
      '../externalData/planningContextBuilder'
    );
    buildMock.mockRejectedValueOnce(
      new PlanningContextBuildError(
        'already building',
        'BUILD_IN_PROGRESS',
        409,
      ),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/planning-contexts/build',
      headers: { 'x-api-key': 'demo-planner-key' },
      payload: {
        place: {
          id: 'static-demo-bengaluru',
          label: 'Bengaluru',
          displayName: 'Bengaluru, India',
          latitude: 12.9716,
          longitude: 77.5946,
          provider: 'static-demo',
        },
      },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('BUILD_IN_PROGRESS');
    expect(recordUsageMock).not.toHaveBeenCalled();
  });
});
