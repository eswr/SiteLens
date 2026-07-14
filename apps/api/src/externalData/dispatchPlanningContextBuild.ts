import { loadConfig } from '../config.js';
import { nudgePlanningContextBuildWorker } from './planningContextBuildWorker.js';

/**
 * Dispatch a queued planning-context ledger job for execution.
 * - in-process: nudge the local poller
 * - pg-boss: enqueue `{ buildJobId }` on the execution queue
 * - disabled: leave the ledger row queued
 */
export async function dispatchPlanningContextBuildJob(
  buildJobId: string,
): Promise<void> {
  const mode = loadConfig().planningContextWorkerMode;
  if (mode === 'in-process') {
    nudgePlanningContextBuildWorker();
    return;
  }
  if (mode === 'pg-boss') {
    const { enqueuePlanningContextBuildJob } = await import(
      '../worker/bossClient.js'
    );
    await enqueuePlanningContextBuildJob(buildJobId);
  }
}

/**
 * Fire-and-forget dispatch for “existing active job” paths.
 * Fresh enqueue should `await dispatchPlanningContextBuildJob` so failures surface.
 */
export function dispatchBuildJobInBackground(jobId: string): void {
  void dispatchPlanningContextBuildJob(jobId).catch((error) => {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'planning_context_build.dispatch_failed',
        jobId,
        errorMessage: error instanceof Error ? error.message : String(error),
      }),
    );
  });
}
