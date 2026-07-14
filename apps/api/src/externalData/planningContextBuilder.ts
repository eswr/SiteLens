import type {
  BuildPlanningContextRequest,
  BuildPlanningContextResponse,
  PlanningContext,
} from '@sitelens/shared';
import {
  EXTERNAL_OSM_DISCLAIMER,
  LOCAL_DEMO_SYDNEY_CONTEXT_ID,
} from '@sitelens/shared';
import { HttpError } from '../auth/requireCapability';
import { loadConfig } from '../config';
import { clearPlanningCache } from '../cache/clearCache';
import { isCacheEnabled, waitForCacheReady } from '../cache/cacheClient';
import { getPool } from '../db/pool';
import { BboxTooLargeError, buildExternalContextId, deriveContextBbox } from './bbox';
import {
  fetchOverpassFeatures,
  OverpassDisabledError,
  OverpassRequestError,
} from './osmOverpassClient';
import { osmToPlanningContext } from './osmToPlanningContext';
import {
  commitReadyExternalContext,
  countContextFeatures,
  getPlanningContext,
  markPlanningContextBuilding,
  markPlanningContextFailed,
  releaseContextBuildLock,
  tryAcquireContextBuildLock,
} from './planningContextRepository';

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

async function invalidatePlanningCache(): Promise<void> {
  if (!isCacheEnabled()) return;
  try {
    await waitForCacheReady();
    await clearPlanningCache();
  } catch {
    // Cache invalidation must never fail a successful build.
  }
}

function toBuildError(error: unknown): PlanningContextBuildError {
  if (error instanceof PlanningContextBuildError) {
    return error;
  }
  if (error instanceof OverpassDisabledError) {
    return new PlanningContextBuildError(error.message, error.code, 503);
  }
  if (error instanceof OverpassRequestError) {
    return new PlanningContextBuildError(
      error.message,
      error.code,
      error.status === 429 ? 429 : 503,
    );
  }
  return new PlanningContextBuildError(
    'External data provider unavailable or bbox too large. Try a smaller city/area or use Sydney Demo.',
    'OVERPASS_ERROR',
    503,
  );
}

export interface BuildExternalPlanningContextOptions {
  /**
   * Called under the advisory lock after the freshness recheck, and before
   * marking the context `building` / calling Overpass. Used for quota checks so
   * entitlement failures never leave a failed context row behind.
   */
  beforeLiveFetch?: () => Promise<void>;
}

/**
 * Build (or reuse) an external OSM planning context for a selected place.
 *
 * Live Overpass fetch happens only here — never on keystrokes or map moves.
 * Per-context advisory locks prevent concurrent Overpass calls for the same id.
 *
 * Demo note: the Postgres session (and advisory lock) is held for the duration
 * of the Overpass HTTP call. That gives simple singleflight semantics for a
 * portfolio demo; production should move to a job queue / distributed lock with
 * short DB transactions instead of pinning a pool client across the provider round-trip.
 */
export async function buildExternalPlanningContext(
  request: BuildPlanningContextRequest,
  options: BuildExternalPlanningContextOptions = {},
): Promise<BuildPlanningContextResponse> {
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
    return { context: existing, counts, reused: true };
  }

  const pool = getPool();
  const client = await pool.connect();
  let lockHeld = false;

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

  try {
    lockHeld = await tryAcquireContextBuildLock(client, contextId);
    if (!lockHeld) {
      const concurrent = await getPlanningContext(contextId);
      if (concurrent?.status === 'building') {
        throw new PlanningContextBuildError(
          `Planning context "${contextId}" is already building. Try again shortly.`,
          'BUILD_IN_PROGRESS',
          409,
        );
      }
      if (
        concurrent &&
        isFresh(concurrent, config.externalContextRebuildAfterDays)
      ) {
        const counts = await countContextFeatures(contextId);
        return { context: concurrent, counts, reused: true };
      }
      throw new PlanningContextBuildError(
        `Planning context "${contextId}" is already building. Try again shortly.`,
        'BUILD_IN_PROGRESS',
        409,
      );
    }

    // Re-check freshness under the lock (another request may have finished).
    const underLock = await getPlanningContext(contextId, client);
    if (
      underLock &&
      isFresh(underLock, config.externalContextRebuildAfterDays)
    ) {
      const counts = await countContextFeatures(contextId, client);
      return { context: underLock, counts, reused: true };
    }

    // Quota / entitlement checks run under the lock but before status=building
    // so a monthly limit does not leave a failed context behind.
    if (options.beforeLiveFetch) {
      await options.beforeLiveFetch();
    }

    await markPlanningContextBuilding(client, building);

    // Overpass fetch happens while the session advisory lock is held so a
    // concurrent request for the same contextId never starts a second provider call.
    // (Acceptable for demo singleflight; production should use a job queue.)
    const features = await fetchOverpassFeatures(bbox);
    const normalized = osmToPlanningContext(features);
    const committed = await commitReadyExternalContext({
      client,
      building,
      normalized,
    });

    await invalidatePlanningCache();

    return {
      context: committed.context,
      counts: {
        sites: committed.sites,
        landUse: committed.landUse,
        constraints: committed.constraints,
        transit: committed.transit,
        developmentActivity: committed.developmentActivity,
      },
      reused: false,
    };
  } catch (error) {
    // Concurrent builders must not mark the other request's in-flight context failed.
    if (
      error instanceof PlanningContextBuildError &&
      error.code === 'BUILD_IN_PROGRESS'
    ) {
      throw error;
    }

    // Entitlement / quota failures are request failures, not context builds.
    if (error instanceof HttpError) {
      throw error;
    }

    const buildError = toBuildError(error);
    try {
      await markPlanningContextFailed(building, buildError.message);
    } catch {
      // Best-effort failure marking.
    }
    throw buildError;
  } finally {
    if (lockHeld) {
      try {
        await releaseContextBuildLock(client, contextId);
      } catch {
        // Ignore unlock errors on disconnect.
      }
    }
    client.release();
  }
}
