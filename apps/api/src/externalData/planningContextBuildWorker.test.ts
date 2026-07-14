import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  claimNextQueuedBuildJob,
  markBuildJobAndContextFailed,
  markBuildJobSucceeded,
  extendBuildJobLease,
  logBuildJobEvent,
  fetchOverpassFeatures,
  osmToPlanningContext,
  commitReadyExternalContext,
  getPlanningContext,
  recordUsage,
  getPool,
  isCacheEnabled,
  clearPlanningCacheForContext,
  loadConfig,
} = vi.hoisted(() => ({
  claimNextQueuedBuildJob: vi.fn(),
  markBuildJobAndContextFailed: vi.fn(async () => true),
  markBuildJobSucceeded: vi.fn(),
  extendBuildJobLease: vi.fn(async () => true),
  logBuildJobEvent: vi.fn(),
  fetchOverpassFeatures: vi.fn(),
  osmToPlanningContext: vi.fn(),
  commitReadyExternalContext: vi.fn(),
  getPlanningContext: vi.fn(),
  recordUsage: vi.fn(async () => {}),
  getPool: vi.fn(),
  isCacheEnabled: vi.fn(() => false),
  clearPlanningCacheForContext: vi.fn(async () => 0),
  loadConfig: vi.fn(() => ({
    planningContextJobMaxAttempts: 3,
    planningContextWorkerPollMs: 750,
    planningContextWorkerEnabled: true,
    planningContextJobHeartbeatMs: 0,
    planningContextJobLockMs: 300_000,
  })),
}));

vi.mock('../billing/billingRepository', () => ({ recordUsage }));
vi.mock('../config', () => ({ loadConfig }));
vi.mock('../db/pool', () => ({ getPool }));
vi.mock('../cache/cacheClient', () => ({
  isCacheEnabled,
  waitForCacheReady: vi.fn(async () => {}),
}));
vi.mock('../cache/clearCache', () => ({
  clearPlanningCacheForContext,
}));
vi.mock('./osmOverpassClient', () => ({
  fetchOverpassFeatures,
  OverpassDisabledError: class OverpassDisabledError extends Error {
    code = 'OVERPASS_DISABLED';
  },
  OverpassRequestError: class OverpassRequestError extends Error {
    code = 'OVERPASS_ERROR';
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock('./osmToPlanningContext', () => ({ osmToPlanningContext }));
vi.mock('./planningContextBuildJobRepository', () => ({
  claimNextQueuedBuildJob,
  markBuildJobAndContextFailed,
  markBuildJobSucceeded,
  extendBuildJobLease,
  logBuildJobEvent,
}));
vi.mock('./planningContextRepository', () => ({
  commitReadyExternalContext,
  getPlanningContext,
}));

const {
  runPlanningContextBuildWorkerTick,
  nudgePlanningContextBuildWorker,
} = await import('./planningContextBuildWorker.js');
const { OverpassRequestError } = await import('./osmOverpassClient.js');

const place = {
  id: 'static-demo-bengaluru',
  label: 'Bengaluru',
  displayName: 'Bengaluru, India',
  latitude: 12.9716,
  longitude: 77.5946,
  provider: 'static-demo',
};

const job = {
  id: '11111111-1111-1111-1111-111111111111',
  planningContextId: 'external-osm:bengaluru:test',
  status: 'running' as const,
  place,
  userId: 'user_planner',
  attempts: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const building = {
  id: job.planningContextId,
  label: 'Bengaluru external context',
  source: 'external-osm' as const,
  status: 'building' as const,
  center: [77.5946, 12.9716] as [number, number],
  bbox: [77.57, 12.95, 77.62, 12.99] as [number, number, number, number],
  disclaimer: 'demo',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

describe('planningContextBuildWorker', () => {
  const release = vi.fn();
  const query = vi.fn();
  let heldClients = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    heldClients = 0;
    isCacheEnabled.mockReturnValue(false);
    getPlanningContext.mockResolvedValue(building);
    osmToPlanningContext.mockReturnValue({
      sites: [],
      landUse: [],
      constraints: [],
      transit: [],
      developmentActivity: [],
      skipped: 0,
    });
    query.mockResolvedValue({ rows: [] });
    getPool.mockReturnValue({
      connect: async () => {
        heldClients += 1;
        return {
          query,
          release: () => {
            heldClients -= 1;
            release();
          },
        };
      },
    });
  });

  it('fetches Overpass with no pool client held, then commits in a short txn', async () => {
    claimNextQueuedBuildJob.mockResolvedValue(job);
    fetchOverpassFeatures.mockImplementation(async () => {
      expect(heldClients).toBe(0);
      return [];
    });
    commitReadyExternalContext.mockResolvedValue({
      sites: 2,
      landUse: 0,
      constraints: 0,
      transit: 0,
      developmentActivity: 0,
      skipped: 0,
      context: { ...building, status: 'ready' },
    });
    markBuildJobSucceeded.mockResolvedValue({ ...job, status: 'succeeded' });

    await runPlanningContextBuildWorkerTick();

    expect(fetchOverpassFeatures).toHaveBeenCalledWith(building.bbox);
    expect(commitReadyExternalContext).toHaveBeenCalledWith(
      expect.objectContaining({ manageTransaction: false }),
    );
    expect(markBuildJobSucceeded).toHaveBeenCalled();
    expect(logBuildJobEvent).toHaveBeenCalledWith(
      'planning_context_build.success',
      expect.objectContaining({
        jobId: job.id,
        planningContextId: job.planningContextId,
      }),
    );
    expect(recordUsage).toHaveBeenCalledWith(
      'user_planner',
      'external-context:build',
    );
    expect(heldClients).toBe(0);
  });

  it('invalidates cache for the built context only when caching is enabled', async () => {
    isCacheEnabled.mockReturnValue(true);
    claimNextQueuedBuildJob.mockResolvedValue(job);
    fetchOverpassFeatures.mockResolvedValue([]);
    commitReadyExternalContext.mockResolvedValue({
      sites: 1,
      landUse: 0,
      constraints: 0,
      transit: 0,
      developmentActivity: 0,
      skipped: 0,
      context: { ...building, status: 'ready' },
    });
    markBuildJobSucceeded.mockResolvedValue({ ...job, status: 'succeeded' });

    await runPlanningContextBuildWorkerTick();

    expect(clearPlanningCacheForContext).toHaveBeenCalledWith(
      job.planningContextId,
    );
  });

  it('heartbeats the lease while Overpass is in flight when enabled', async () => {
    vi.useFakeTimers();
    try {
      loadConfig.mockReturnValue({
        planningContextJobMaxAttempts: 3,
        planningContextWorkerPollMs: 750,
        planningContextWorkerEnabled: true,
        planningContextJobHeartbeatMs: 50,
        planningContextJobLockMs: 300_000,
      });
      claimNextQueuedBuildJob.mockResolvedValue(job);
      let resolveOverpass: (value: unknown[]) => void = () => {};
      fetchOverpassFeatures.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveOverpass = resolve;
          }),
      );
      commitReadyExternalContext.mockResolvedValue({
        sites: 0,
        landUse: 0,
        constraints: 0,
        transit: 0,
        developmentActivity: 0,
        skipped: 0,
        context: { ...building, status: 'ready' },
      });
      markBuildJobSucceeded.mockResolvedValue({ ...job, status: 'succeeded' });

      const tickPromise = runPlanningContextBuildWorkerTick();
      await vi.advanceTimersByTimeAsync(120);
      expect(extendBuildJobLease).toHaveBeenCalledWith(job.id);

      resolveOverpass([]);
      await tickPromise;
    } finally {
      vi.useRealTimers();
    }
  });

  it('skips commit when heartbeat reports the lease was lost', async () => {
    vi.useFakeTimers();
    try {
      loadConfig.mockReturnValue({
        planningContextJobMaxAttempts: 3,
        planningContextWorkerPollMs: 750,
        planningContextWorkerEnabled: true,
        planningContextJobHeartbeatMs: 50,
        planningContextJobLockMs: 300_000,
      });
      claimNextQueuedBuildJob.mockResolvedValue(job);
      extendBuildJobLease.mockResolvedValue(false);
      let resolveOverpass: (value: unknown[]) => void = () => {};
      fetchOverpassFeatures.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveOverpass = resolve;
          }),
      );

      const tickPromise = runPlanningContextBuildWorkerTick();
      await vi.advanceTimersByTimeAsync(60);
      resolveOverpass([]);
      await tickPromise;

      expect(commitReadyExternalContext).not.toHaveBeenCalled();
      expect(markBuildJobSucceeded).not.toHaveBeenCalled();
      expect(markBuildJobAndContextFailed).not.toHaveBeenCalled();
      expect(logBuildJobEvent).toHaveBeenCalledWith(
        'planning_context_build.failure',
        expect.objectContaining({
          jobId: job.id,
          errorMessage: expect.stringMatching(/lease was lost/i),
        }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('rolls back and skips success when markBuildJobSucceeded returns null', async () => {
    claimNextQueuedBuildJob.mockResolvedValue(job);
    fetchOverpassFeatures.mockResolvedValue([]);
    commitReadyExternalContext.mockResolvedValue({
      sites: 1,
      landUse: 0,
      constraints: 0,
      transit: 0,
      developmentActivity: 0,
      skipped: 0,
      context: { ...building, status: 'ready' },
    });
    markBuildJobSucceeded.mockResolvedValue(null);

    await runPlanningContextBuildWorkerTick();

    expect(query).toHaveBeenCalledWith('ROLLBACK');
    expect(recordUsage).not.toHaveBeenCalled();
    expect(clearPlanningCacheForContext).not.toHaveBeenCalled();
    expect(logBuildJobEvent).toHaveBeenCalledWith(
      'planning_context_build.failure',
      expect.objectContaining({
        errorMessage: expect.stringMatching(/lease was lost/i),
      }),
    );
  });

  it('does not mark a successful build failed when metering throws', async () => {
    claimNextQueuedBuildJob.mockResolvedValue(job);
    fetchOverpassFeatures.mockResolvedValue([]);
    commitReadyExternalContext.mockResolvedValue({
      sites: 1,
      landUse: 0,
      constraints: 0,
      transit: 0,
      developmentActivity: 0,
      skipped: 0,
      context: { ...building, status: 'ready' },
    });
    markBuildJobSucceeded.mockResolvedValue({ ...job, status: 'succeeded' });
    recordUsage.mockRejectedValueOnce(new Error('billing down'));

    await runPlanningContextBuildWorkerTick();

    expect(markBuildJobSucceeded).toHaveBeenCalled();
    expect(markBuildJobAndContextFailed).not.toHaveBeenCalled();
    expect(logBuildJobEvent).toHaveBeenCalledWith(
      'planning_context_build.metering_failure',
      expect.objectContaining({
        jobId: job.id,
        userId: 'user_planner',
        errorMessage: 'billing down',
      }),
    );
  });

  it('marks job and context failed atomically when Overpass errors', async () => {
    claimNextQueuedBuildJob.mockResolvedValue(job);
    fetchOverpassFeatures.mockRejectedValue(
      new OverpassRequestError('upstream down', 503),
    );

    await runPlanningContextBuildWorkerTick();

    expect(markBuildJobAndContextFailed).toHaveBeenCalledWith(
      job.id,
      expect.objectContaining({ id: job.planningContextId }),
      expect.stringContaining('upstream'),
    );
    expect(logBuildJobEvent).toHaveBeenCalledWith(
      'planning_context_build.failure',
      expect.objectContaining({
        jobId: job.id,
        errorMessage: expect.stringContaining('upstream'),
      }),
    );
    expect(commitReadyExternalContext).not.toHaveBeenCalled();
    expect(recordUsage).not.toHaveBeenCalled();
  });

  it('fails the job when attempts exceed the max after reclaim', async () => {
    loadConfig.mockReturnValue({
      planningContextJobMaxAttempts: 3,
      planningContextWorkerPollMs: 750,
      planningContextWorkerEnabled: true,
      planningContextJobHeartbeatMs: 0,
      planningContextJobLockMs: 300_000,
    });
    claimNextQueuedBuildJob.mockResolvedValue({
      ...job,
      attempts: 4,
    });

    await runPlanningContextBuildWorkerTick();

    expect(fetchOverpassFeatures).not.toHaveBeenCalled();
    expect(markBuildJobAndContextFailed).toHaveBeenCalledWith(
      job.id,
      expect.anything(),
      expect.stringContaining('attempts'),
    );
  });

  it('does not run a tick when the worker is disabled', async () => {
    loadConfig.mockReturnValue({
      planningContextJobMaxAttempts: 3,
      planningContextWorkerPollMs: 750,
      planningContextWorkerEnabled: false,
      planningContextJobHeartbeatMs: 0,
      planningContextJobLockMs: 300_000,
    });

    nudgePlanningContextBuildWorker();
    // Allow any queued microtask from a buggy non-guarded path to flush.
    await Promise.resolve();

    expect(claimNextQueuedBuildJob).not.toHaveBeenCalled();
  });
});
