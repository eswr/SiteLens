/**
 * Planning context types — local demo seed vs generated external urban context.
 *
 * External contexts are open-map-derived urban context layers for portfolio
 * verification. They are not official zoning, cadastre, or development-
 * application datasets.
 */

export type PlanningContextSource =
  | 'local-demo'
  | 'external-osm'
  | 'external-overture'
  | 'synthetic-fallback';

export type PlanningContextStatus =
  | 'ready'
  | 'building'
  | 'failed'
  | 'stale';

export interface PlanningContextPlace {
  id: string;
  label: string;
  displayName: string;
  provider: string;
}

export interface PlanningContext {
  id: string;
  label: string;
  source: PlanningContextSource;
  status: PlanningContextStatus;
  /** `[longitude, latitude]` */
  center: [number, number];
  /** `[west, south, east, north]` */
  bbox: [number, number, number, number];
  place?: PlanningContextPlace;
  disclaimer: string;
  createdAt: string;
  updatedAt: string;
}

export interface BuildPlanningContextRequest {
  place: {
    id: string;
    label: string;
    displayName: string;
    latitude: number;
    longitude: number;
    /** Nominatim-style `[south, north, west, east]` when available. */
    boundingBox?: [number, number, number, number];
    provider: string;
  };
  source?: 'external-osm';
}

export interface PlanningContextFeatureCounts {
  sites: number;
  landUse: number;
  constraints: number;
  transit: number;
  developmentActivity: number;
}

/** Detail payload for `GET /api/planning-contexts/:id`. */
export interface PlanningContextDetailResponse {
  context: PlanningContext;
  counts: PlanningContextFeatureCounts;
}

export type PlanningContextBuildJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed';

/** Full place payload stored on a build job (lat/lng/bbox for the worker). */
export type PlanningContextBuildJobPlace = BuildPlanningContextRequest['place'];

export interface PlanningContextBuildJob {
  id: string;
  planningContextId: string;
  status: PlanningContextBuildJobStatus;
  place: PlanningContextBuildJobPlace;
  counts?: PlanningContextFeatureCounts | null;
  reused?: boolean | null;
  errorMessage?: string | null;
  /** Claim/reclaim count — useful for debugging stuck or retried jobs. */
  attempts?: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

/** Immediate response from `POST /api/planning-contexts/build`. */
export interface BuildPlanningContextJobResponse {
  jobId: string;
  contextId: string;
  status: 'queued' | 'running' | 'succeeded';
  /** True when a fresh ready context was returned without calling Overpass. */
  reused?: boolean;
}

/** Payload for `GET /api/planning-contexts/jobs/:jobId`. */
export interface PlanningContextBuildJobStatusResponse {
  job: PlanningContextBuildJob;
}

/**
 * Payload for `GET /api/planning-contexts/jobs/health`.
 * Recent counts cover the trailing 24 hours.
 */
export interface PlanningContextBuildJobQueueHealthResponse {
  workerEnabled: boolean;
  /** How build jobs are executed: in-process poller, pg-boss worker, or neither. */
  workerMode: 'in-process' | 'pg-boss' | 'disabled';
  /** True when workerMode is pg-boss (API enqueues; separate worker consumes). */
  pgBossEnabled: boolean;
  pollMs: number;
  lockMs: number;
  maxAttempts: number;
  /** Lease heartbeat interval (ms); `0` means heartbeat is disabled. */
  heartbeatMs: number;
  /**
   * Last process-level heartbeat from the pg-boss worker (`null` when missing).
   * ISO-8601 timestamp.
   */
  workerHeartbeatAt: string | null;
  /** Age of `workerHeartbeatAt` in whole seconds (`null` when missing). */
  workerHeartbeatAgeSeconds: number | null;
  /**
   * Where the heartbeat value was read from. Production-shaped deploys should
   * report `redis`; `memory` means same-process fallback only.
   */
  workerHeartbeatSource: 'redis' | 'memory' | 'missing';
  queued: number;
  running: number;
  /** Running jobs whose lease is null or expired (eligible for reclaim). */
  runningExpiredLease: number;
  succeededRecent: number;
  /** Jobs that failed in the trailing 24 hours. */
  failedLast24h: number;
  oldestQueuedAt: string | null;
  oldestRunningAt: string | null;
  /** Best-effort pg-boss queue depths when workerMode is pg-boss. */
  pgBoss?: {
    pending: number;
    active: number;
    retry: number;
    failed: number;
    /**
     * False when workerMode is pg-boss and the process heartbeat is missing
     * or older than 60s. Portfolio health stays HTTP 200; this surfaces
     * degraded worker liveness in JSON.
     */
    workerHealthy: boolean;
  } | null;
}

/** Bundled Sydney portfolio fixture — default / offline fallback context. */
export const LOCAL_DEMO_SYDNEY_CONTEXT_ID = 'local-demo-sydney';

export const LOCAL_DEMO_SYDNEY_DISCLAIMER =
  'Sydney Demo is bundled synthetic portfolio data. It is not official planning or cadastral data.';

export const EXTERNAL_OSM_DISCLAIMER =
  'External context generated from open map data. It is not official zoning, cadastre, or development-application data.';
