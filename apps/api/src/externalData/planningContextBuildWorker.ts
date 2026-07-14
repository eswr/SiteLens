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

async function processJob(job: JobRowWithUser): Promise<void> {
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
    const features = await fetchOverpassFeatures(building.bbox);
    const normalized = osmToPlanningContext(features);

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
        building,
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
    await processJob(job);
  } finally {
    tickInFlight = false;
  }
}

/** Wake the worker soon after enqueue (does not block the request). */
export function nudgePlanningContextBuildWorker(): void {
  if (!loadConfig().planningContextWorkerEnabled) {
    return;
  }
  void runPlanningContextBuildWorkerTick();
}

/** Start the poll loop. Self-guards so callers cannot bypass config or double-start. */
export function startPlanningContextBuildWorker(pollMs?: number): void {
  if (!loadConfig().planningContextWorkerEnabled) return;
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
