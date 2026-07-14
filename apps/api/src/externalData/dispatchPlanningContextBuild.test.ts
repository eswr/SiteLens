import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  loadConfig,
  nudgePlanningContextBuildWorker,
  enqueuePlanningContextBuildJob,
} = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  nudgePlanningContextBuildWorker: vi.fn(),
  enqueuePlanningContextBuildJob: vi.fn(async () => 'boss-job-1'),
}));

vi.mock('../config.js', () => ({ loadConfig }));
vi.mock('./planningContextBuildWorker.js', () => ({
  nudgePlanningContextBuildWorker,
}));
vi.mock('../worker/bossClient.js', () => ({
  enqueuePlanningContextBuildJob,
}));

const {
  dispatchBuildJobInBackground,
  dispatchPlanningContextBuildJob,
} = await import('./dispatchPlanningContextBuild.js');

describe('dispatchPlanningContextBuildJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('nudges the in-process worker', async () => {
    loadConfig.mockReturnValue({ planningContextWorkerMode: 'in-process' });
    await dispatchPlanningContextBuildJob('job-1');
    expect(nudgePlanningContextBuildWorker).toHaveBeenCalledTimes(1);
    expect(enqueuePlanningContextBuildJob).not.toHaveBeenCalled();
  });

  it('enqueues a pg-boss job', async () => {
    loadConfig.mockReturnValue({ planningContextWorkerMode: 'pg-boss' });
    await dispatchPlanningContextBuildJob('job-2');
    expect(enqueuePlanningContextBuildJob).toHaveBeenCalledWith('job-2');
    expect(nudgePlanningContextBuildWorker).not.toHaveBeenCalled();
  });

  it('leaves the row queued when disabled', async () => {
    loadConfig.mockReturnValue({ planningContextWorkerMode: 'disabled' });
    await dispatchPlanningContextBuildJob('job-3');
    expect(nudgePlanningContextBuildWorker).not.toHaveBeenCalled();
    expect(enqueuePlanningContextBuildJob).not.toHaveBeenCalled();
  });
});

describe('dispatchBuildJobInBackground', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('logs and swallows pg-boss enqueue failures (no unhandled rejection)', async () => {
    loadConfig.mockReturnValue({ planningContextWorkerMode: 'pg-boss' });
    enqueuePlanningContextBuildJob.mockRejectedValueOnce(
      new Error('pg-boss unavailable'),
    );
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    dispatchBuildJobInBackground('job-active');
    await vi.waitFor(() => {
      expect(warnSpy).toHaveBeenCalled();
    });

    const logged = String(warnSpy.mock.calls[0]?.[0] ?? '');
    expect(logged).toContain('planning_context_build.dispatch_failed');
    expect(logged).toContain('job-active');
    expect(logged).toContain('pg-boss unavailable');
    warnSpy.mockRestore();
  });
});
