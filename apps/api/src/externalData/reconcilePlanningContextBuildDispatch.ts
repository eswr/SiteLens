import { loadConfig } from '../config.js';
import {
  listQueuedBuildJobsForDispatch,
  type QueuedBuildJobForDispatch,
} from './planningContextBuildJobRepository.js';

/** Queued ledger rows older than this are re-enqueued onto pg-boss. */
export const RECONCILE_OLDER_THAN_SECONDS = 20;
const RECONCILE_LIMIT = 25;
const RECONCILE_INTERVAL_MS = 15_000;

let reconcileTimer: ReturnType<typeof setInterval> | null = null;
let reconcileInFlight = false;

export type EnqueueBuildJobFn = (
  buildJobId: string,
  options?: { startAfter?: number },
) => Promise<string | null>;

/**
 * Re-enqueue stale queued ledger jobs onto pg-boss (idempotent via
 * queue policy `short` + singletonKey). Safe to call repeatedly; enqueue
 * failures are logged and do not throw.
 */
export async function reconcileQueuedBuildJobsForDispatch(options?: {
  olderThanSeconds?: number;
  limit?: number;
  enqueue?: EnqueueBuildJobFn;
}): Promise<QueuedBuildJobForDispatch[]> {
  const olderThanSeconds =
    options?.olderThanSeconds ?? RECONCILE_OLDER_THAN_SECONDS;
  const limit = options?.limit ?? RECONCILE_LIMIT;
  const jobs = await listQueuedBuildJobsForDispatch({
    olderThanSeconds,
    limit,
  });

  if (jobs.length === 0) {
    return jobs;
  }

  const enqueue =
    options?.enqueue ??
    (async (buildJobId: string, sendOptions?: { startAfter?: number }) => {
      const { enqueuePlanningContextBuildJob } = await import(
        '../worker/bossClient.js'
      );
      return enqueuePlanningContextBuildJob(buildJobId, sendOptions);
    });

  let overpassCooldownMs = 0;
  try {
    const { getProviderCooldown } = await import(
      '../providers/providerSpacer.js'
    );
    overpassCooldownMs = await getProviderCooldown('overpass');
  } catch {
    overpassCooldownMs = 0;
  }

  for (const job of jobs) {
    try {
      const startAfter =
        overpassCooldownMs > 0
          ? Math.max(1, Math.ceil(overpassCooldownMs / 1000))
          : undefined;
      const bossJobId = await enqueue(
        job.id,
        startAfter != null ? { startAfter } : undefined,
      );
      console.log(
        JSON.stringify({
          level: 'info',
          event: bossJobId
            ? 'planning_context_build.reconciled_dispatch'
            : 'planning_context_build.reconciled_dispatch_deduped',
          jobId: job.id,
          contextId: job.planningContextId,
          bossJobId,
          ...(startAfter != null ? { startAfter } : {}),
        }),
      );
    } catch (error) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'planning_context_build.reconcile_enqueue_failed',
          jobId: job.id,
          contextId: job.planningContextId,
          errorMessage:
            error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return jobs;
}

async function reconcileTick(): Promise<void> {
  if (reconcileInFlight) {
    return;
  }
  if (loadConfig().planningContextWorkerMode !== 'pg-boss') {
    return;
  }
  reconcileInFlight = true;
  try {
    await reconcileQueuedBuildJobsForDispatch();
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        event: 'planning_context_build.reconcile_tick_failed',
        errorMessage: error instanceof Error ? error.message : String(error),
      }),
    );
  } finally {
    reconcileInFlight = false;
  }
}

/** Periodic ledger → pg-boss recovery loop (worker process only). */
export function startPlanningContextBuildReconcileLoop(
  intervalMs: number = RECONCILE_INTERVAL_MS,
): void {
  if (reconcileTimer) {
    return;
  }
  if (loadConfig().planningContextWorkerMode !== 'pg-boss') {
    return;
  }
  void reconcileTick();
  reconcileTimer = setInterval(() => {
    void reconcileTick();
  }, intervalMs);
  if (
    typeof reconcileTimer === 'object' &&
    reconcileTimer !== null &&
    'unref' in reconcileTimer
  ) {
    reconcileTimer.unref();
  }
}

export function stopPlanningContextBuildReconcileLoop(): void {
  if (reconcileTimer) {
    clearInterval(reconcileTimer);
    reconcileTimer = null;
  }
  reconcileInFlight = false;
}
