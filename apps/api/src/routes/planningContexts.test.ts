import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

const {
  buildMock,
  listMock,
  getMock,
  countMock,
  getJobMock,
  queueHealthMock,
} = vi.hoisted(() => ({
  buildMock: vi.fn(),
  listMock: vi.fn(),
  getMock: vi.fn(),
  countMock: vi.fn(),
  getJobMock: vi.fn(),
  queueHealthMock: vi.fn(),
}));
vi.mock('../externalData/planningContextBuilder', () => ({
  enqueuePlanningContextBuild: buildMock,
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

vi.mock('../externalData/planningContextBuildJobRepository', () => ({
  getBuildJob: getJobMock,
  getBuildJobQueueHealth: queueHealthMock,
}));

vi.mock('../billing/billingRepository', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../billing/billingRepository.js')>();
  return {
    ...actual,
    getBillingContextForUser: async (userId: string | null) =>
      actual.demoFallbackContext(userId ?? null),
    getUsage: async () => 0,
  };
});

const { buildApp } = await import('../app.js');

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

  it('returns build job queue health', async () => {
    queueHealthMock.mockResolvedValueOnce({
      workerEnabled: true,
      workerMode: 'pg-boss',
      pgBossEnabled: true,
      pollMs: 750,
      lockMs: 300_000,
      maxAttempts: 3,
      heartbeatMs: 100_000,
      workerHeartbeatAt: '2026-07-14T08:00:00.000Z',
      workerHeartbeatAgeSeconds: 5,
      workerHeartbeatSource: 'redis',
      queued: 1,
      running: 0,
      runningExpiredLease: 0,
      succeededRecent: 2,
      failedLast24h: 0,
      oldestQueuedAt: '2026-07-14T08:00:00.000Z',
      oldestRunningAt: null,
      pgBoss: {
        pending: 0,
        active: 0,
        retry: 0,
        failed: 0,
        workerHealthy: true,
      },
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/planning-contexts/jobs/health',
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json().data).toMatchObject({
      workerEnabled: true,
      queued: 1,
      failedLast24h: 0,
      succeededRecent: 2,
      workerHeartbeatAt: '2026-07-14T08:00:00.000Z',
      workerHeartbeatAgeSeconds: 5,
      workerHeartbeatSource: 'redis',
      pgBoss: { workerHealthy: true },
    });
    expect(getJobMock).not.toHaveBeenCalled();
  });

  it('requires admin for queue health in production-shaped mode', async () => {
    const configModule = await import('../config.js');
    const baseline = configModule.loadConfig();
    const spy = vi.spyOn(configModule, 'loadConfig').mockReturnValue({
      ...baseline,
      isProduction: true,
      enableDemoBilling: false,
    });
    try {
      const anonymous = await app.inject({
        method: 'GET',
        url: '/api/planning-contexts/jobs/health',
      });
      expect(anonymous.statusCode).toBe(401);

      const planner = await app.inject({
        method: 'GET',
        url: '/api/planning-contexts/jobs/health',
        headers: { 'x-api-key': 'demo-planner-key' },
      });
      expect(planner.statusCode).toBe(403);

      queueHealthMock.mockResolvedValueOnce({
        workerEnabled: true,
        pollMs: 750,
        lockMs: 300_000,
        maxAttempts: 3,
        heartbeatMs: 100_000,
        queued: 0,
        running: 0,
        runningExpiredLease: 0,
        succeededRecent: 0,
        failedLast24h: 0,
        oldestQueuedAt: null,
        oldestRunningAt: null,
      });
      const admin = await app.inject({
        method: 'GET',
        url: '/api/planning-contexts/jobs/health',
        headers: { 'x-api-key': 'demo-admin-key' },
      });
      expect(admin.statusCode).toBe(200);
      expect(admin.headers['cache-control']).toBe('no-store');
    } finally {
      spy.mockRestore();
    }
  });

  it('returns build job status', async () => {
    getJobMock.mockResolvedValueOnce({
      id: '11111111-1111-1111-1111-111111111111',
      planningContextId: 'external-osm:bengaluru:abc',
      status: 'running',
      place: {
        id: 'static-demo-bengaluru',
        label: 'Bengaluru',
        displayName: 'Bengaluru, India',
        latitude: 12.9716,
        longitude: 77.5946,
        provider: 'static-demo',
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    const res = await app.inject({
      method: 'GET',
      url: '/api/planning-contexts/jobs/11111111-1111-1111-1111-111111111111',
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.job.status).toBe('running');
    expect(getJobMock).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
    );
  });

  it('returns 404 for unknown build job', async () => {
    getJobMock.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: 'GET',
      url: '/api/planning-contexts/jobs/22222222-2222-2222-2222-222222222222',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('NOT_FOUND');
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
  });

  it('returns a job enqueue response for a new build', async () => {
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
        options?: { beforeLiveFetch?: () => Promise<void>; userId?: string },
      ) => {
        await options?.beforeLiveFetch?.();
        expect(options?.userId).toBeTruthy();
        return {
          jobId: '11111111-1111-1111-1111-111111111111',
          contextId: 'external-osm:bengaluru:abc123',
          status: 'queued',
        };
      },
    );

    const created = await app.inject({
      method: 'POST',
      url: '/api/planning-contexts/build',
      headers: { 'x-api-key': 'demo-planner-key' },
      payload: { place, source: 'external-osm' },
    });
    expect(created.statusCode).toBe(200);
    expect(created.json().data).toEqual({
      jobId: '11111111-1111-1111-1111-111111111111',
      contextId: 'external-osm:bengaluru:abc123',
      status: 'queued',
    });
  });

  it('returns succeeded/reused without requiring a live job', async () => {
    buildMock.mockResolvedValueOnce({
      jobId: '11111111-1111-1111-1111-111111111111',
      contextId: 'external-osm:bengaluru:abc123',
      status: 'succeeded',
      reused: true,
    });

    const reused = await app.inject({
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
    expect(reused.statusCode).toBe(200);
    expect(reused.json().data.reused).toBe(true);
    expect(reused.json().data.status).toBe('succeeded');
  });
});
