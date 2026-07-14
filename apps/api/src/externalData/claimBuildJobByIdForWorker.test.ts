import { beforeEach, describe, expect, it, vi } from 'vitest';

const { query, getBuildJobByIdRun, loadConfig } = vi.hoisted(() => ({
  query: vi.fn(),
  getBuildJobByIdRun: vi.fn(),
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
vi.mock('./queries/buildJobs.queries.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('./queries/buildJobs.queries.js')>();
  return {
    ...actual,
    getBuildJobById: { run: getBuildJobByIdRun },
  };
});

const place = {
  id: 'p1',
  label: 'Place',
  displayName: 'Place',
  latitude: 1,
  longitude: 2,
  provider: 'static-demo',
};

const queuedRow = {
  id: 'job-1',
  planning_context_id: 'external-osm:x',
  status: 'queued',
  place,
  counts: null,
  reused: null,
  error_message: null,
  user_id: 'user_1',
  attempts: 0,
  locked_until: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  started_at: null,
  finished_at: null,
};

const { claimBuildJobByIdForWorker } = await import(
  './planningContextBuildJobRepository.js'
);

describe('claimBuildJobByIdForWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('claims only queued jobs', async () => {
    getBuildJobByIdRun.mockResolvedValue([queuedRow]);
    query.mockResolvedValue({
      rows: [{ ...queuedRow, status: 'running', attempts: 1 }],
    });

    const claimed = await claimBuildJobByIdForWorker('job-1');
    expect(claimed?.id).toBe('job-1');
    expect(claimed?.status).toBe('running');
    expect(claimed?.attempts).toBe(1);
    expect(query).toHaveBeenCalled();
  });

  it('returns null for terminal jobs without updating', async () => {
    getBuildJobByIdRun.mockResolvedValue([
      { ...queuedRow, status: 'succeeded', attempts: 1 },
    ]);

    const claimed = await claimBuildJobByIdForWorker('job-1');
    expect(claimed).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });

  it('returns null when job is already running', async () => {
    getBuildJobByIdRun.mockResolvedValue([
      { ...queuedRow, status: 'running', attempts: 1 },
    ]);

    const claimed = await claimBuildJobByIdForWorker('job-1');
    expect(claimed).toBeNull();
    expect(query).not.toHaveBeenCalled();
  });
});
