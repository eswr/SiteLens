import type { PlanningContext } from '@sitelens/shared';
import { EXTERNAL_OSM_DISCLAIMER } from '@sitelens/shared';
import { recordUsage } from '../billing/billingRepository.js';
import { clearPlanningCacheForContext } from '../cache/clearCache.js';
import { isCacheEnabled, waitForCacheReady } from '../cache/cacheClient.js';
import { loadConfig } from '../config.js';
import { getPool } from '../db/pool.js';
import {
  fetchOverpassFeatures,
  OverpassDisabledError,
  OverpassRequestError,
} from './osmOverpassClient.js';
import { osmToPlanningContext } from './osmToPlanningContext.js';
import { generateSyntheticExternalFeatures } from './syntheticExternalFeatures.js';
import type { ExternalFeature } from './externalDataTypes.js';
import {
  claimNextQueuedBuildJob,
  extendBuildJobLease,
  logBuildJobEvent,
  markBuildJobAndContextFailed,
  markBuildJobSucceeded,
  type JobRowWithUser,
} from './planningContextBuildJobRepository.js';
import {
  commitReadyExternalContext,
  getPlanningContext,
} from './planningContextRepository.js';

let timer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;
/** When true, skip deferred cooldown re-enqueue timers (worker teardown). */
let isShuttingDown = false;

/** Mark the worker as shutting down so settle timers do not touch pg-boss. */
export function markPlanningContextBuildWorkerShuttingDown(): void {
  isShuttingDown = true;
}

/** Clear shutdown flag (tests / same-process restart). */
export function clearPlanningContextBuildWorkerShuttingDown(): void {
  isShuttingDown = false;
}

/** Thrown when heartbeat shows another worker took the lease (or job ended). */
class BuildLeaseLostError extends Error {
  constructor(message = 'Build lease was lost before commit.') {
    super(message);
    this.name = 'BuildLeaseLostError';
  }
}

async function invalidatePlanningCacheForContext(
  planningContextId: string,
): Promise<void> {
  if (!isCacheEnabled()) return;
  try {
    await waitForCacheReady();
    await clearPlanningCacheForContext(planningContextId);
  } catch {
    // Cache invalidation must never fail a successful build.
  }
}

function toFailureMessage(error: unknown): string {
  if (error instanceof OverpassDisabledError || error instanceof OverpassRequestError) {
    return error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'External data provider unavailable or bbox too large. Try a smaller city/area or use Sydney Demo.';
}

function buildingContextFromJob(job: JobRowWithUser): PlanningContext {
  const place = job.place;
  const now = new Date().toISOString();
  return {
    id: job.planningContextId,
    label: `${(place.label || place.displayName || 'Place').split(',')[0]?.trim() || 'Place'} external context`,
    source: 'external-osm',
    status: 'building',
    center: [place.longitude, place.latitude],
    bbox: [0, 0, 0, 0],
    place: {
      id: place.id,
      label: place.label,
      displayName: place.displayName,
      provider: place.provider,
    },
    disclaimer: EXTERNAL_OSM_DISCLAIMER,
    createdAt: now,
    updatedAt: now,
  };
}

async function resolveBuildingContext(job: JobRowWithUser): Promise<PlanningContext> {
  const existing = await getPlanningContext(job.planningContextId);
  return existing
    ? { ...existing, status: 'building' }
    : buildingContextFromJob(job);
}

/**
 * Periodically extend the job lease while a long Overpass fetch runs.
 * No-op when heartbeatMs is 0 (disabled via PLANNING_CONTEXT_JOB_HEARTBEAT_MS=0).
 * Calls `onLost` when the lease can no longer be extended.
 */
function startLeaseHeartbeat(
  jobId: string,
  options: { onLost: () => void },
): () => void {
  const heartbeatMs = loadConfig().planningContextJobHeartbeatMs;
  if (heartbeatMs <= 0) {
    return () => {};
  }

  let stopped = false;
  const timerHandle = setInterval(() => {
    void extendBuildJobLease(jobId)
      .then((extended) => {
        if (!stopped && !extended) {
          options.onLost();
        }
      })
      .catch(() => {
        if (!stopped) {
          options.onLost();
        }
      });
  }, heartbeatMs);

  if (typeof timerHandle === 'object' && timerHandle !== null && 'unref' in timerHandle) {
    timerHandle.unref();
  }

  return () => {
    stopped = true;
    clearInterval(timerHandle);
  };
}

async function failJob(
  job: JobRowWithUser,
  building: PlanningContext,
  message: string,
  startedAtMs: number,
): Promise<void> {
  try {
    const marked = await markBuildJobAndContextFailed(job.id, building, message);
    if (!marked) {
      logBuildJobEvent('planning_context_build.failure', {
        jobId: job.id,
        planningContextId: job.planningContextId,
        attempts: job.attempts,
        errorMessage:
          'Build failure ignored: job is no longer running (lease lost or already terminal).',
      });
      return;
    }
    logBuildJobEvent('planning_context_build.failure', {
      jobId: job.id,
      planningContextId: job.planningContextId,
      attempts: job.attempts,
      status: 'failed',
      errorMessage: message,
      durationMs: Date.now() - startedAtMs,
    });
  } catch (error) {
    console.warn(
      '[planning-context-build] failed to mark job/context failed',
      error,
    );
  }
}

/** Core processing for a claimed ledger job (shared by in-process and pg-boss). */
export async function processClaimedPlanningContextBuildJob(
  job: JobRowWithUser,
): Promise<void> {
  const building = await resolveBuildingContext(job);
  const maxAttempts = loadConfig().planningContextJobMaxAttempts;
  const startedAtMs = Date.now();

  if (job.attempts > maxAttempts) {
    await failJob(
      job,
      building,
      `Build exceeded ${maxAttempts} attempts after worker interruption. Try again.`,
      startedAtMs,
    );
    return;
  }

  let leaseLost = false;
  const stopHeartbeat = startLeaseHeartbeat(job.id, {
    onLost: () => {
      leaseLost = true;
    },
  });
  try {
    // Overpass RTT: no pool client held; heartbeat keeps the lease alive.
    // When Overpass is disabled/unavailable and synthetic fallback is enabled,
    // use clearly labeled synthetic features (CI / offline release gates).
    let features: ExternalFeature[];
    let usedSyntheticFallback = false;
    try {
      features = await fetchOverpassFeatures(building.bbox);
    } catch (error) {
      const canFallback =
        loadConfig().externalContextSyntheticFallbackEnabled &&
        (error instanceof OverpassDisabledError ||
          error instanceof OverpassRequestError);
      if (!canFallback) {
        throw error;
      }
      usedSyntheticFallback = true;
      features = generateSyntheticExternalFeatures(building.bbox);
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'planning_context_build.synthetic_fallback',
          jobId: job.id,
          planningContextId: job.planningContextId,
          reason:
            error instanceof Error ? error.message : String(error),
        }),
      );
    }
    const normalized = osmToPlanningContext(features);
    const contextToCommit = usedSyntheticFallback
      ? { ...building, source: 'synthetic-fallback' as const }
      : building;

    if (leaseLost) {
      throw new BuildLeaseLostError();
    }

    const pool = getPool();
    const client = await pool.connect();
    let counts: {
      sites: number;
      landUse: number;
      constraints: number;
      transit: number;
      developmentActivity: number;
    };
    try {
      await client.query('BEGIN');
      const committed = await commitReadyExternalContext({
        client,
        building: contextToCommit,
        normalized,
        manageTransaction: false,
      });
      counts = {
        sites: committed.sites,
        landUse: committed.landUse,
        constraints: committed.constraints,
        transit: committed.transit,
        developmentActivity: committed.developmentActivity,
      };
      const succeeded = await markBuildJobSucceeded(
        client,
        job.id,
        counts,
        false,
      );
      if (!succeeded) {
        await client.query('ROLLBACK');
        logBuildJobEvent('planning_context_build.failure', {
          jobId: job.id,
          planningContextId: job.planningContextId,
          attempts: job.attempts,
          errorMessage:
            'Build finished after lease was lost; skipping commit result.',
        });
        return;
      }
      await client.query('COMMIT');
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Ignore rollback errors.
      }
      throw error;
    } finally {
      client.release();
    }

    logBuildJobEvent('planning_context_build.success', {
      jobId: job.id,
      planningContextId: job.planningContextId,
      attempts: job.attempts,
      status: 'succeeded',
      durationMs: Date.now() - startedAtMs,
      reused: false,
      counts,
    });
  } catch (error) {
    if (error instanceof BuildLeaseLostError) {
      logBuildJobEvent('planning_context_build.failure', {
        jobId: job.id,
        planningContextId: job.planningContextId,
        attempts: job.attempts,
        errorMessage: error.message,
        durationMs: Date.now() - startedAtMs,
      });
      return;
    }
    await failJob(job, building, toFailureMessage(error), startedAtMs);
    return;
  } finally {
    stopHeartbeat();
  }

  await invalidatePlanningCacheForContext(job.planningContextId);

  // Metering must never flip a successful job/context to failed.
  if (job.userId) {
    try {
      await recordUsage(job.userId, 'external-context:build');
    } catch (error) {
      logBuildJobEvent('planning_context_build.metering_failure', {
        jobId: job.id,
        planningContextId: job.planningContextId,
        attempts: job.attempts,
        status: 'succeeded',
        userId: job.userId,
        errorMessage:
          error instanceof Error ? error.message : String(error),
      });
    }
  }
}

/** Process at most one claimable job. Safe to call from nudge or interval. */
export async function runPlanningContextBuildWorkerTick(): Promise<void> {
  if (tickInFlight) return;
  tickInFlight = true;
  try {
    const job = await claimNextQueuedBuildJob();
    if (!job) return;
    await processClaimedPlanningContextBuildJob(job);
  } finally {
    tickInFlight = false;
  }
}

/**
 * pg-boss handler path: claim the ledger row by id, then process.
 * No-ops when the job is terminal / already claimed.
 *
 * When Overpass cooldown is active in pg-boss mode, leaves the ledger row
 * `queued` and schedules a delayed re-enqueue (does not mark `running`).
 */
export async function processQueuedBuildJobById(
  buildJobId: string,
): Promise<void> {
  const mode = loadConfig().planningContextWorkerMode;
  if (mode === 'pg-boss') {
    const { getProviderCooldown } = await import(
      '../providers/providerSpacer.js'
    );
    const remainingMs = await getProviderCooldown('overpass');
    if (remainingMs > 0) {
      const delaySeconds = Math.max(1, Math.ceil(remainingMs / 1000));
      console.log(
        JSON.stringify({
          level: 'info',
          event: 'planning_context_build.cooldown_defer',
          jobId: buildJobId,
          remainingMs,
          delaySeconds,
        }),
      );
      // Complete this pg-boss job without claiming the ledger, then re-enqueue
      // after a short settle so singletonKey is released. If the worker exits
      // during that window the timer is lost; the reconcile loop recovers
      // stale `queued` ledger rows onto pg-boss.
      const settleMs = 250;
      const settleTimer = setTimeout(() => {
        if (isShuttingDown) return;
        void import('../worker/bossClient.js')
          .then(({ enqueuePlanningContextBuildJob }) =>
            enqueuePlanningContextBuildJob(buildJobId, {
              startAfter: delaySeconds,
            }),
          )
          .catch((error) => {
            console.warn(
              JSON.stringify({
                level: 'warn',
                event: 'planning_context_build.cooldown_reenqueue_failed',
                jobId: buildJobId,
                errorMessage:
                  error instanceof Error ? error.message : String(error),
              }),
            );
          });
      }, settleMs);
      // Don't keep the process alive solely for the settle window.
      if (typeof settleTimer === 'object' && settleTimer !== null && 'unref' in settleTimer) {
        settleTimer.unref();
      }
      return;
    }
  }

  const { claimBuildJobByIdForWorker } = await import(
    './planningContextBuildJobRepository.js'
  );
  const job = await claimBuildJobByIdForWorker(buildJobId);
  if (!job) return;
  await processClaimedPlanningContextBuildJob(job);
}

/** Wake the in-process worker soon after enqueue (does not block the request). */
export function nudgePlanningContextBuildWorker(): void {
  if (loadConfig().planningContextWorkerMode !== 'in-process') {
    return;
  }
  void runPlanningContextBuildWorkerTick();
}

/** Start the in-process poll loop. Only used when worker mode is in-process. */
export function startPlanningContextBuildWorker(pollMs?: number): void {
  if (loadConfig().planningContextWorkerMode !== 'in-process') return;
  if (timer) return;
  const intervalMs = pollMs ?? loadConfig().planningContextWorkerPollMs;
  timer = setInterval(() => {
    void runPlanningContextBuildWorkerTick();
  }, intervalMs);
  // Avoid keeping the process alive solely for the demo worker interval.
  if (typeof timer === 'object' && timer !== null && 'unref' in timer) {
    timer.unref();
  }
}

export function stopPlanningContextBuildWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
