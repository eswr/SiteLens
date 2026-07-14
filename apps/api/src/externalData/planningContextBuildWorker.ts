import type { PlanningContext } from '@sitelens/shared';
import { EXTERNAL_OSM_DISCLAIMER } from '@sitelens/shared';
import { recordUsage } from '../billing/billingRepository';
import { clearPlanningCache } from '../cache/clearCache';
import { isCacheEnabled, waitForCacheReady } from '../cache/cacheClient';
import { loadConfig } from '../config';
import { getPool } from '../db/pool';
import {
  fetchOverpassFeatures,
  OverpassDisabledError,
  OverpassRequestError,
} from './osmOverpassClient';
import { osmToPlanningContext } from './osmToPlanningContext';
import {
  claimNextQueuedBuildJob,
  markBuildJobAndContextFailed,
  markBuildJobSucceeded,
  type JobRowWithUser,
} from './planningContextBuildJobRepository';
import {
  commitReadyExternalContext,
  getPlanningContext,
} from './planningContextRepository';

let timer: ReturnType<typeof setInterval> | null = null;
let tickInFlight = false;

async function invalidatePlanningCache(): Promise<void> {
  if (!isCacheEnabled()) return;
  try {
    await waitForCacheReady();
    await clearPlanningCache();
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

async function failJob(
  job: JobRowWithUser,
  building: PlanningContext,
  message: string,
): Promise<void> {
  try {
    await markBuildJobAndContextFailed(job.id, building, message);
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

  if (job.attempts > maxAttempts) {
    await failJob(
      job,
      building,
      `Build exceeded ${maxAttempts} attempts after worker interruption. Try again.`,
    );
    return;
  }

  try {
    // Overpass RTT: no pool client held.
    const features = await fetchOverpassFeatures(building.bbox);
    const normalized = osmToPlanningContext(features);

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const committed = await commitReadyExternalContext({
        client,
        building,
        normalized,
        manageTransaction: false,
      });
      const counts = {
        sites: committed.sites,
        landUse: committed.landUse,
        constraints: committed.constraints,
        transit: committed.transit,
        developmentActivity: committed.developmentActivity,
      };
      await markBuildJobSucceeded(client, job.id, counts, false);
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
  } catch (error) {
    await failJob(job, building, toFailureMessage(error));
    return;
  }

  await invalidatePlanningCache();

  // Metering must never flip a successful job/context to failed.
  if (job.userId) {
    try {
      await recordUsage(job.userId, 'external-context:build');
    } catch (error) {
      console.warn(
        'usage metering failed after successful context build',
        error,
      );
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
