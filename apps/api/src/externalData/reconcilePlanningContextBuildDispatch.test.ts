import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  loadConfig,
  listQueuedBuildJobsForDispatch,
  enqueuePlanningContextBuildJob,
} = vi.hoisted(() => ({
  loadConfig: vi.fn(() => ({
    planningContextWorkerMode: 'pg-boss' as const,
  })),
  listQueuedBuildJobsForDispatch: vi.fn(),
  enqueuePlanningContextBuildJob: vi.fn(async () => 'boss-1'),
}));

vi.mock('../config.js', () => ({ loadConfig }));
vi.mock('./planningContextBuildJobRepository.js', () => ({
  listQueuedBuildJobsForDispatch,
}));
vi.mock('../worker/bossClient.js', () => ({
  enqueuePlanningContextBuildJob,
}));

const { reconcileQueuedBuildJobsForDispatch } = await import(
  './reconcilePlanningContextBuildDispatch.js'
);

describe('reconcileQueuedBuildJobsForDispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadConfig.mockReturnValue({ planningContextWorkerMode: 'pg-boss' });
  });

  it('re-enqueues stale queued ledger jobs and logs reconciled_dispatch', async () => {
    listQueuedBuildJobsForDispatch.mockResolvedValue([
      {
        id: 'job-stale',
        planningContextId: 'ctx-1',
        status: 'queued',
        updatedAt: new Date(0).toISOString(),
        createdAt: new Date(0).toISOString(),
      },
    ]);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    const jobs = await reconcileQueuedBuildJobsForDispatch({
      olderThanSeconds: 20,
      limit: 10,
    });

    expect(listQueuedBuildJobsForDispatch).toHaveBeenCalledWith({
      olderThanSeconds: 20,
      limit: 10,
    });
    expect(enqueuePlanningContextBuildJob).toHaveBeenCalledWith(
      'job-stale',
      undefined,
    );
    expect(jobs).toHaveLength(1);

    const logged = logSpy.mock.calls.map((c) => String(c[0] ?? '')).join('\n');
    expect(logged).toContain('planning_context_build.reconciled_dispatch');
    expect(logged).toContain('job-stale');
    expect(logged).toContain('ctx-1');
    logSpy.mockRestore();
  });

  it('ignores an empty list (terminal / active jobs never returned by repo)', async () => {
    listQueuedBuildJobsForDispatch.mockResolvedValue([]);
    await reconcileQueuedBuildJobsForDispatch();
    expect(enqueuePlanningContextBuildJob).not.toHaveBeenCalled();
  });

  it('logs enqueue failure without throwing (loop continues)', async () => {
    listQueuedBuildJobsForDispatch.mockResolvedValue([
      {
        id: 'job-a',
        planningContextId: 'ctx-a',
        status: 'queued',
        updatedAt: new Date(0).toISOString(),
        createdAt: new Date(0).toISOString(),
      },
      {
        id: 'job-b',
        planningContextId: 'ctx-b',
        status: 'queued',
        updatedAt: new Date(0).toISOString(),
        createdAt: new Date(0).toISOString(),
      },
    ]);
    enqueuePlanningContextBuildJob
      .mockRejectedValueOnce(new Error('pg-boss down'))
      .mockResolvedValueOnce('boss-2');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await expect(
      reconcileQueuedBuildJobsForDispatch({
        enqueue: enqueuePlanningContextBuildJob,
      }),
    ).resolves.toHaveLength(2);

    expect(enqueuePlanningContextBuildJob).toHaveBeenCalledTimes(2);
    const warned = warnSpy.mock.calls.map((c) => String(c[0] ?? '')).join('\n');
    expect(warned).toContain('planning_context_build.reconcile_enqueue_failed');
    expect(warned).toContain('job-a');
    const logged = logSpy.mock.calls.map((c) => String(c[0] ?? '')).join('\n');
    expect(logged).toContain('job-b');
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('logs reconciled_dispatch_deduped when singleton enqueue returns null', async () => {
    listQueuedBuildJobsForDispatch.mockResolvedValue([
      {
        id: 'job-dup',
        planningContextId: 'ctx-dup',
        status: 'queued',
        updatedAt: new Date(0).toISOString(),
        createdAt: new Date(0).toISOString(),
      },
    ]);
    enqueuePlanningContextBuildJob.mockResolvedValueOnce(null);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    await reconcileQueuedBuildJobsForDispatch({
      enqueue: enqueuePlanningContextBuildJob,
    });

    const logged = logSpy.mock.calls.map((c) => String(c[0] ?? '')).join('\n');
    expect(logged).toContain(
      'planning_context_build.reconciled_dispatch_deduped',
    );
    expect(logged).toContain('job-dup');
    logSpy.mockRestore();
  });
});
