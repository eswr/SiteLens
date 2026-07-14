import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, loadConfig } = vi.hoisted(() => ({
  query: vi.fn(),
  loadConfig: vi.fn(() => ({
    planningContextJobLockMs: 300_000,
    planningContextJobMaxAttempts: 3,
    planningContextWorkerMode: 'pg-boss' as const,
    planningContextWorkerEnabled: true,
    planningContextWorkerPollMs: 750,
    planningContextJobHeartbeatMs: 0,
  })),
}));

vi.mock('../config.js', () => ({ loadConfig }));
vi.mock('../db/pool.js', () => ({
  getPool: () => ({ query }),
}));

const { listQueuedBuildJobsForDispatch } = await import(
  './planningContextBuildJobRepository.js'
);

describe('listQueuedBuildJobsForDispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns only queued rows from SQL (stale scan)', async () => {
    const now = new Date().toISOString();
    query.mockResolvedValue({
      rows: [
        {
          id: 'job-queued',
          planning_context_id: 'ctx-1',
          status: 'queued',
          updated_at: now,
          created_at: now,
        },
      ],
    });

    const jobs = await listQueuedBuildJobsForDispatch({
      olderThanSeconds: 20,
      limit: 10,
    });

    expect(jobs).toEqual([
      {
        id: 'job-queued',
        planningContextId: 'ctx-1',
        status: 'queued',
        updatedAt: now,
        createdAt: now,
      },
    ]);
    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain("status = 'queued'");
    expect(sql).not.toContain("'running'");
    expect(sql).not.toContain("'succeeded'");
    expect(sql).not.toContain("'failed'");
    expect(query.mock.calls[0]?.[1]).toEqual([20, 10]);
  });

  it('clamps limit and passes olderThanSeconds', async () => {
    query.mockResolvedValue({ rows: [] });
    await listQueuedBuildJobsForDispatch({
      olderThanSeconds: 30,
      limit: 999,
    });
    expect(query.mock.calls[0]?.[1]).toEqual([30, 100]);
  });
});
