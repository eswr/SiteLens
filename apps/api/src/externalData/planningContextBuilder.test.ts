import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanningContext } from '@sitelens/shared';

const {
  getPlanningContext,
  countContextFeatures,
  markPlanningContextBuilding,
  findActiveBuildJob,
  insertBuildJob,
  getPool,
  loadConfig,
  dispatchPlanningContextBuildJob,
  dispatchBuildJobInBackground,
} = vi.hoisted(() => {
  const dispatchPlanningContextBuildJob = vi.fn(async () => {});
  return {
    getPlanningContext: vi.fn(),
    countContextFeatures: vi.fn(),
    markPlanningContextBuilding: vi.fn(),
    findActiveBuildJob: vi.fn(),
    insertBuildJob: vi.fn(),
    getPool: vi.fn(),
    loadConfig: vi.fn(),
    dispatchPlanningContextBuildJob,
    dispatchBuildJobInBackground: vi.fn((jobId: string) => {
      void dispatchPlanningContextBuildJob(jobId);
    }),
  };
});

vi.mock('../config', () => ({ loadConfig }));
vi.mock('../db/pool', () => ({ getPool }));
vi.mock('./dispatchPlanningContextBuild', () => ({
  dispatchPlanningContextBuildJob,
  dispatchBuildJobInBackground,
}));
vi.mock('./planningContextBuildJobRepository', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./planningContextBuildJobRepository.js')>();
  return {
    ...actual,
    findActiveBuildJob,
    insertBuildJob,
  };
});
vi.mock('./planningContextRepository', () => ({
  getPlanningContext,
  countContextFeatures,
  markPlanningContextBuilding,
}));

const { enqueuePlanningContextBuild } = await import('./planningContextBuilder.js');

const place = {
  id: 'static-demo-bengaluru',
  label: 'Bengaluru',
  displayName: 'Bengaluru, India',
  latitude: 12.9716,
  longitude: 77.5946,
  provider: 'static-demo',
};

function readyContext(overrides: Partial<PlanningContext> = {}): PlanningContext {
  const now = new Date().toISOString();
  return {
    id: 'external-osm:bengaluru:test',
    label: 'Bengaluru external context',
    source: 'external-osm',
    status: 'ready',
    center: [77.5946, 12.9716],
    bbox: [77.57, 12.95, 77.62, 12.99],
    disclaimer: 'demo',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const emptyCounts = {
  sites: 0,
  landUse: 0,
  constraints: 0,
  transit: 0,
  developmentActivity: 0,
};

describe('enqueuePlanningContextBuild', () => {
  const release = vi.fn();
  const query = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    loadConfig.mockReturnValue({
      externalContextMaxBboxAreaDeg2: 0.25,
      externalContextRebuildAfterDays: 7,
    });
    countContextFeatures.mockResolvedValue(emptyCounts);
    findActiveBuildJob.mockResolvedValue(null);
    query.mockResolvedValue({ rows: [] });
    getPool.mockReturnValue({
      connect: async () => ({
        query,
        release,
      }),
    });
  });

  it('reuses a fresh ready context without enqueueing a live job', async () => {
    getPlanningContext.mockImplementation(async (id: string) =>
      readyContext({ id }),
    );
    countContextFeatures.mockResolvedValue({ ...emptyCounts, sites: 12 });
    insertBuildJob.mockImplementation(async (input: { planningContextId: string }) => ({
      id: 'job-reuse',
      planningContextId: input.planningContextId,
      status: 'succeeded',
      place,
      counts: { ...emptyCounts, sites: 12 },
      reused: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));

    const result = await enqueuePlanningContextBuild({ place });

    expect(result).toMatchObject({
      jobId: 'job-reuse',
      status: 'succeeded',
      reused: true,
    });
    expect(result.contextId).toMatch(/^external-osm:/);
    expect(insertBuildJob).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'succeeded', reused: true }),
    );
    expect(markPlanningContextBuilding).not.toHaveBeenCalled();
    expect(dispatchPlanningContextBuildJob).not.toHaveBeenCalled();
    expect(dispatchBuildJobInBackground).not.toHaveBeenCalled();
  });

  it('returns an existing active job for the same context and dispatches the worker', async () => {
    getPlanningContext.mockResolvedValue(null);
    findActiveBuildJob.mockResolvedValue({
      id: 'job-active',
      planningContextId: 'external-osm:bengaluru:test',
      status: 'running',
      place,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const result = await enqueuePlanningContextBuild({ place });

    expect(result).toEqual({
      jobId: 'job-active',
      contextId: expect.any(String),
      status: 'running',
    });
    expect(markPlanningContextBuilding).not.toHaveBeenCalled();
    expect(dispatchBuildJobInBackground).toHaveBeenCalledWith('job-active');
    expect(dispatchPlanningContextBuildJob).toHaveBeenCalledWith('job-active');
  });

  it('enqueues a queued job and dispatches the worker', async () => {
    getPlanningContext.mockResolvedValue(null);
    findActiveBuildJob.mockResolvedValue(null);
    insertBuildJob.mockResolvedValue({
      id: 'job-queued',
      planningContextId: 'external-osm:bengaluru:test',
      status: 'queued',
      place,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const beforeLiveFetch = vi.fn(async () => {});
    const result = await enqueuePlanningContextBuild(
      { place },
      { beforeLiveFetch, userId: 'user_planner' },
    );

    expect(result.status).toBe('queued');
    expect(result.jobId).toBe('job-queued');
    expect(beforeLiveFetch).toHaveBeenCalledTimes(1);
    expect(markPlanningContextBuilding).toHaveBeenCalled();
    expect(insertBuildJob).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'queued',
        userId: 'user_planner',
      }),
      expect.anything(),
    );
    expect(dispatchPlanningContextBuildJob).toHaveBeenCalledWith('job-queued');
    expect(dispatchBuildJobInBackground).not.toHaveBeenCalled();
  });

  it('quota exceeded before live enqueue does not mark building', async () => {
    const { HttpError } = await import('../auth/requireCapability.js');
    getPlanningContext.mockResolvedValue(null);
    findActiveBuildJob.mockResolvedValue(null);

    const beforeLiveFetch = vi.fn(async () => {
      throw new HttpError(
        429,
        'ENTITLEMENT_LIMIT_EXCEEDED',
        'Monthly limit of 20 for "external-context:build" reached on your plan. Upgrade for more.',
      );
    });

    await expect(
      enqueuePlanningContextBuild({ place }, { beforeLiveFetch }),
    ).rejects.toMatchObject({
      name: 'HttpError',
      code: 'ENTITLEMENT_LIMIT_EXCEEDED',
      statusCode: 429,
    });

    expect(beforeLiveFetch).toHaveBeenCalledTimes(1);
    expect(markPlanningContextBuilding).not.toHaveBeenCalled();
    expect(dispatchPlanningContextBuildJob).not.toHaveBeenCalled();
    expect(dispatchBuildJobInBackground).not.toHaveBeenCalled();
  });

  it('returns the existing active job on unique violation (singleflight)', async () => {
    getPlanningContext.mockResolvedValue(null);
    findActiveBuildJob
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'job-winner',
        planningContextId: 'external-osm:bengaluru:test',
        status: 'queued',
        place,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    markPlanningContextBuilding.mockResolvedValue(undefined);
    insertBuildJob.mockRejectedValueOnce(
      Object.assign(new Error('duplicate'), { code: '23505' }),
    );

    const result = await enqueuePlanningContextBuild({ place });

    expect(result).toEqual({
      jobId: 'job-winner',
      contextId: expect.any(String),
      status: 'queued',
    });
    expect(dispatchBuildJobInBackground).toHaveBeenCalledWith('job-winner');
    expect(dispatchPlanningContextBuildJob).toHaveBeenCalledWith('job-winner');
  });

  it('returns reused succeeded job when unique-violation winner already finished', async () => {
    const fresh = readyContext({
      id: 'external-osm:bengaluru:finished',
      status: 'ready',
    });
    getPlanningContext
      .mockResolvedValueOnce(null) // initial freshness check
      .mockResolvedValueOnce(null) // under txn
      .mockResolvedValueOnce(fresh); // after 23505, winner finished
    findActiveBuildJob.mockResolvedValue(null);
    markPlanningContextBuilding.mockResolvedValue(undefined);
    countContextFeatures.mockResolvedValue({ ...emptyCounts, sites: 5 });
    insertBuildJob
      .mockRejectedValueOnce(
        Object.assign(new Error('duplicate'), { code: '23505' }),
      )
      .mockResolvedValueOnce({
        id: 'job-reuse-after-race',
        planningContextId: fresh.id,
        status: 'succeeded',
        place,
        counts: { ...emptyCounts, sites: 5 },
        reused: true,
        createdAt: fresh.createdAt,
        updatedAt: fresh.updatedAt,
      });

    const result = await enqueuePlanningContextBuild({ place });

    expect(result).toMatchObject({
      jobId: 'job-reuse-after-race',
      status: 'succeeded',
      reused: true,
    });
    expect(insertBuildJob).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'succeeded', reused: true }),
    );
  });
});
