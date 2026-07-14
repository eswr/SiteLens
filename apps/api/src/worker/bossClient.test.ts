import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  loadConfig,
  createQueue,
  updateQueue,
  send,
  start,
  stop,
  on,
} = vi.hoisted(() => ({
  loadConfig: vi.fn(() => ({
    databaseUrl: 'postgres://sitelens:sitelens@localhost:54329/sitelens',
    pgBossSchema: 'pgboss',
    pgBossQueuePlanningContext: 'planning-context-build',
    dbSsl: false,
  })),
  createQueue: vi.fn(async () => undefined),
  updateQueue: vi.fn(async () => undefined),
  send: vi.fn(async () => 'boss-job-1'),
  start: vi.fn(async () => undefined),
  stop: vi.fn(async () => undefined),
  on: vi.fn(),
}));

vi.mock('../config.js', () => ({ loadConfig }));

vi.mock('pg-boss', () => {
  class FakePgBoss {
    start = start;
    stop = stop;
    on = on;
    createQueue = createQueue;
    updateQueue = updateQueue;
    send = send;
  }
  return { default: FakePgBoss };
});

const {
  startBoss,
  stopBoss,
  enqueuePlanningContextBuildJob,
} = await import('./bossClient.js');

describe('bossClient queue policy', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await stopBoss();
  });

  it('startBoss creates and updates the queue with policy short', async () => {
    await startBoss();
    expect(createQueue).toHaveBeenCalledWith('planning-context-build', {
      name: 'planning-context-build',
      policy: 'short',
    });
    expect(updateQueue).toHaveBeenCalledWith('planning-context-build', {
      name: 'planning-context-build',
      policy: 'short',
    });
  });

  it('enqueuePlanningContextBuildJob sends singletonKey and optional startAfter', async () => {
    await startBoss();
    await enqueuePlanningContextBuildJob('job-1');
    expect(send).toHaveBeenCalledWith(
      'planning-context-build',
      { buildJobId: 'job-1' },
      { singletonKey: 'job-1' },
    );

    await enqueuePlanningContextBuildJob('job-2', { startAfter: 12 });
    expect(send).toHaveBeenCalledWith(
      'planning-context-build',
      { buildJobId: 'job-2' },
      { singletonKey: 'job-2', startAfter: 12 },
    );
  });
});
