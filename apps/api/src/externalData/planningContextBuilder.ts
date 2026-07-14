import type {
  BuildPlanningContextJobResponse,
  BuildPlanningContextRequest,
  PlanningContext,
} from '@sitelens/shared';
import {
  EXTERNAL_OSM_DISCLAIMER,
  LOCAL_DEMO_SYDNEY_CONTEXT_ID,
} from '@sitelens/shared';
import { HttpError } from '../auth/requireCapability';
import { loadConfig } from '../config';
import { getPool } from '../db/pool';
import { BboxTooLargeError, buildExternalContextId, deriveContextBbox } from './bbox';
import {
  findActiveBuildJob,
  insertBuildJob,
  isUniqueViolation,
} from './planningContextBuildJobRepository';
import {
  countContextFeatures,
  getPlanningContext,
  markPlanningContextBuilding,
} from './planningContextRepository';
import { nudgePlanningContextBuildWorker } from './planningContextBuildWorker';

export class PlanningContextBuildError extends Error {
  readonly code: string;
  readonly statusCode: number;
  constructor(message: string, code: string, statusCode: number) {
    super(message);
    this.name = 'PlanningContextBuildError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function isFresh(context: PlanningContext, rebuildAfterDays: number): boolean {
  if (context.status !== 'ready') return false;
  const updated = Date.parse(context.updatedAt);
  if (!Number.isFinite(updated)) return false;
  const ageMs = Date.now() - updated;
  return ageMs < rebuildAfterDays * 24 * 60 * 60 * 1000;
}

function activeJobResponse(
  contextId: string,
  active: { id: string; status: string },
): BuildPlanningContextJobResponse {
  return {
    jobId: active.id,
    contextId,
    status: active.status === 'running' ? 'running' : 'queued',
  };
}

export interface EnqueuePlanningContextBuildOptions {
  /**
   * Called before marking the context `building` / enqueueing a live job.
   * Used for quota checks so entitlement failures never leave a failed context.
   */
  beforeLiveFetch?: () => Promise<void>;
  /** Optional user id stored on the job for usage metering after success. */
  userId?: string | null;
}

/**
 * Enqueue (or reuse) an external OSM planning context build for a selected place.
 *
 * Live Overpass fetch happens in the in-process worker — never on this request
 * path, and never on keystrokes or map moves. Fresh contexts return a succeeded
 * job immediately without calling Overpass.
 */
export async function enqueuePlanningContextBuild(
  request: BuildPlanningContextRequest,
  options: EnqueuePlanningContextBuildOptions = {},
): Promise<BuildPlanningContextJobResponse> {
  const place = request.place;
  if (
    !place ||
    typeof place.latitude !== 'number' ||
    typeof place.longitude !== 'number' ||
    !Number.isFinite(place.latitude) ||
    !Number.isFinite(place.longitude)
  ) {
    throw new PlanningContextBuildError(
      'A valid place with latitude and longitude is required.',
      'INVALID_PLACE',
      400,
    );
  }

  const config = loadConfig();
  let bbox;
  try {
    bbox = deriveContextBbox({
      longitude: place.longitude,
      latitude: place.latitude,
      boundingBox: place.boundingBox,
      maxAreaDeg2: config.externalContextMaxBboxAreaDeg2,
    });
  } catch (error) {
    if (error instanceof BboxTooLargeError) {
      throw new PlanningContextBuildError(error.message, error.code, 400);
    }
    throw error;
  }

  const contextId = buildExternalContextId({
    label: place.label || place.displayName || 'place',
    provider: place.provider || 'unknown',
    placeId: place.id || `${place.longitude},${place.latitude}`,
    bbox,
  });

  if (contextId === LOCAL_DEMO_SYDNEY_CONTEXT_ID) {
    throw new PlanningContextBuildError(
      'Cannot overwrite the local Sydney demo context.',
      'INVALID_CONTEXT',
      400,
    );
  }

  const existing = await getPlanningContext(contextId);
  if (existing && isFresh(existing, config.externalContextRebuildAfterDays)) {
    const counts = await countContextFeatures(contextId);
    const now = new Date().toISOString();
    const job = await insertBuildJob({
      planningContextId: contextId,
      status: 'succeeded',
      place,
      counts,
      reused: true,
      userId: options.userId ?? null,
      startedAt: now,
      finishedAt: now,
    });
    return {
      jobId: job.id,
      contextId,
      status: 'succeeded',
      reused: true,
    };
  }

  const active = await findActiveBuildJob(contextId);
  if (active) {
    nudgePlanningContextBuildWorker();
    return activeJobResponse(contextId, active);
  }

  // Fresh reuse may create a context; live enqueue requires the context row
  // (FK on jobs). Ensure building row exists before inserting the job.
  const now = new Date().toISOString();
  const building: PlanningContext = {
    id: contextId,
    label: `${(place.label || place.displayName || 'Place').split(',')[0]?.trim() || 'Place'} external context`,
    source: 'external-osm',
    status: 'building',
    center: [place.longitude, place.latitude],
    bbox,
    place: {
      id: place.id,
      label: place.label,
      displayName: place.displayName,
      provider: place.provider,
    },
    disclaimer: EXTERNAL_OSM_DISCLAIMER,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Re-check freshness / active job under the transaction.
    const underTxn = await getPlanningContext(contextId, client);
    if (
      underTxn &&
      isFresh(underTxn, config.externalContextRebuildAfterDays)
    ) {
      const counts = await countContextFeatures(contextId, client);
      const job = await insertBuildJob(
        {
          planningContextId: contextId,
          status: 'succeeded',
          place,
          counts,
          reused: true,
          userId: options.userId ?? null,
          startedAt: now,
          finishedAt: now,
        },
        client,
      );
      await client.query('COMMIT');
      return {
        jobId: job.id,
        contextId,
        status: 'succeeded',
        reused: true,
      };
    }

    const activeAgain = await findActiveBuildJob(contextId, client);
    if (activeAgain) {
      await client.query('COMMIT');
      nudgePlanningContextBuildWorker();
      return activeJobResponse(contextId, activeAgain);
    }

    // Quota / entitlement before status=building so limits leave no failed row.
    if (options.beforeLiveFetch) {
      await options.beforeLiveFetch();
    }

    await markPlanningContextBuilding(client, building);
    const job = await insertBuildJob(
      {
        planningContextId: contextId,
        status: 'queued',
        place,
        userId: options.userId ?? null,
      },
      client,
    );
    await client.query('COMMIT');

    nudgePlanningContextBuildWorker();

    return {
      jobId: job.id,
      contextId,
      status: 'queued',
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Ignore rollback errors.
    }

    // Concurrent enqueue raced past findActiveBuildJob — return the winner.
    // The winner may already have finished between 23505 and this lookup.
    if (isUniqueViolation(error)) {
      const winner = await findActiveBuildJob(contextId);
      if (winner) {
        nudgePlanningContextBuildWorker();
        return activeJobResponse(contextId, winner);
      }

      const fresh = await getPlanningContext(contextId);
      if (fresh && isFresh(fresh, config.externalContextRebuildAfterDays)) {
        const counts = await countContextFeatures(contextId);
        const reuseNow = new Date().toISOString();
        const job = await insertBuildJob({
          planningContextId: contextId,
          status: 'succeeded',
          place,
          counts,
          reused: true,
          userId: options.userId ?? null,
          startedAt: reuseNow,
          finishedAt: reuseNow,
        });
        return {
          jobId: job.id,
          contextId,
          status: 'succeeded',
          reused: true,
        };
      }
    }

    if (error instanceof HttpError || error instanceof PlanningContextBuildError) {
      throw error;
    }
    throw error;
  } finally {
    client.release();
  }
}

/** @deprecated Use enqueuePlanningContextBuild — kept as alias for tests/migration. */
export const buildExternalPlanningContext = enqueuePlanningContextBuild;
