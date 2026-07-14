import type {
  PlanningContext,
  PlanningContextBuildJob,
  PlanningContextBuildJobPlace,
  PlanningContextBuildJobQueueHealthResponse,
  PlanningContextBuildJobStatus,
  PlanningContextFeatureCounts,
} from '@sitelens/shared';
import type { PoolClient } from 'pg';
import { loadConfig } from '../config.js';
import { getPool } from '../db/pool.js';
import { markPlanningContextFailedOnClient } from './planningContextRepository.js';
import {
  extendBuildJobLease as extendBuildJobLeaseQuery,
  findActiveBuildJobByContext,
  getBuildJobById,
  getBuildJobQueueHealth as getBuildJobQueueHealthQuery,
  insertBuildJob as insertBuildJobQuery,
  type IGetBuildJobByIdResult,
  type Json,
} from './queries/buildJobs.queries.js';

/** Default max claims/reclaims when env is unset (also used by unit tests). */
export const MAX_BUILD_JOB_ATTEMPTS = 3;

type JobRow = IGetBuildJobByIdResult;

function asJobPlace(value: JobRow['place']): PlanningContextBuildJobPlace {
  return value as PlanningContextBuildJobPlace;
}

function asJobCounts(
  value: JobRow['counts'],
): PlanningContextFeatureCounts | null {
  return (value as PlanningContextFeatureCounts | null) ?? null;
}

function asJobStatus(value: string): PlanningContextBuildJobStatus {
  return value as PlanningContextBuildJobStatus;
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toIsoOrNull(value: Date | string | null): string | null {
  if (value == null) return null;
  return toIso(value);
}

function rowToJob(row: JobRow): PlanningContextBuildJob {
  return {
    id: row.id,
    planningContextId: row.planning_context_id,
    status: asJobStatus(row.status),
    place: asJobPlace(row.place),
    counts: asJobCounts(row.counts),
    reused: row.reused ?? null,
    errorMessage: row.error_message ?? null,
    attempts: Number(row.attempts) || 0,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    startedAt: toIsoOrNull(row.started_at),
    finishedAt: toIsoOrNull(row.finished_at),
  };
}

/** Column list for claim SQL (FOR UPDATE SKIP LOCKED — kept as raw SQL). */
const JOB_RETURNING = `id, planning_context_id, status, place, counts, reused,
                error_message, user_id, attempts, locked_until,
                created_at, updated_at, started_at, finished_at`;

export interface JobRowWithUser extends PlanningContextBuildJob {
  userId: string | null;
  attempts: number;
}

function rowToJobWithUser(row: JobRow): JobRowWithUser {
  return {
    ...rowToJob(row),
    userId: row.user_id,
    attempts: Number(row.attempts) || 0,
  };
}

export type BuildJobLogEvent =
  | 'planning_context_build.claim'
  | 'planning_context_build.retry'
  | 'planning_context_build.success'
  | 'planning_context_build.failure'
  | 'planning_context_build.metering_failure';

/** Structured JSON lifecycle logs (stdout, same style as request logger). */
export function logBuildJobEvent(
  event: BuildJobLogEvent,
  fields: {
    jobId: string;
    planningContextId: string;
    attempts?: number;
    status?: string;
    errorMessage?: string;
    durationMs?: number;
    reused?: boolean;
    counts?: PlanningContextFeatureCounts;
    userId?: string | null;
  },
): void {
  const level =
    event === 'planning_context_build.failure' ||
    event === 'planning_context_build.metering_failure'
      ? 'warn'
      : 'info';
  console.log(
    JSON.stringify({
      level,
      event,
      jobId: fields.jobId,
      planningContextId: fields.planningContextId,
      ...(fields.attempts != null ? { attempts: fields.attempts } : {}),
      ...(fields.status != null ? { status: fields.status } : {}),
      ...(fields.errorMessage != null
        ? { errorMessage: fields.errorMessage }
        : {}),
      ...(fields.durationMs != null ? { durationMs: fields.durationMs } : {}),
      ...(fields.reused != null ? { reused: fields.reused } : {}),
      ...(fields.counts != null ? { counts: fields.counts } : {}),
      ...(fields.userId != null ? { userId: fields.userId } : {}),
    }),
  );
}

function logJobClaim(job: JobRowWithUser): void {
  // attempts is incremented on claim; >1 means this is a reclaim/retry.
  const event: BuildJobLogEvent =
    job.attempts > 1
      ? 'planning_context_build.retry'
      : 'planning_context_build.claim';
  logBuildJobEvent(event, {
    jobId: job.id,
    planningContextId: job.planningContextId,
    attempts: job.attempts,
    status: job.status,
  });
}

/** Postgres unique_violation — used for one-active-job singleflight. */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

export async function getBuildJob(
  jobId: string,
  client?: PoolClient,
): Promise<PlanningContextBuildJob | null> {
  const db = client ?? getPool();
  const rows = await getBuildJobById.run({ jobId }, db);
  const row = rows[0];
  return row ? rowToJob(row) : null;
}

export async function findActiveBuildJob(
  planningContextId: string,
  client?: PoolClient,
): Promise<PlanningContextBuildJob | null> {
  const db = client ?? getPool();
  const rows = await findActiveBuildJobByContext.run({ planningContextId }, db);
  const row = rows[0];
  return row ? rowToJob(row) : null;
}

export async function insertBuildJob(
  input: {
    planningContextId: string;
    status: PlanningContextBuildJobStatus;
    place: PlanningContextBuildJobPlace;
    counts?: PlanningContextFeatureCounts | null;
    reused?: boolean | null;
    errorMessage?: string | null;
    userId?: string | null;
    startedAt?: string | null;
    finishedAt?: string | null;
  },
  client?: PoolClient,
): Promise<PlanningContextBuildJob> {
  const db = client ?? getPool();
  const now = new Date().toISOString();
  const rows = await insertBuildJobQuery.run(
    {
      planningContextId: input.planningContextId,
      status: input.status,
      place: input.place as unknown as Json,
      counts:
        input.counts != null ? (input.counts as unknown as Json) : null,
      reused: input.reused ?? null,
      errorMessage: input.errorMessage ?? null,
      userId: input.userId ?? null,
      createdAt: now,
      updatedAt: now,
      startedAt: input.startedAt ?? null,
      finishedAt: input.finishedAt ?? null,
    },
    db,
  );
  return rowToJob(rows[0]!);
}

export interface ClaimBuildJobOptions {
  /**
   * Test-only narrowing hook for DB integration tests.
   * Production callers should not pass this.
   */
  planningContextIdPrefix?: string;
}

/**
 * Claim the next claimable job → running with a lease (SKIP LOCKED).
 * Claims queued jobs, or running jobs whose lease is null/expired.
 */
export async function claimNextQueuedBuildJob(
  options: ClaimBuildJobOptions = {},
): Promise<JobRowWithUser | null> {
  const pool = getPool();
  const lockMs = loadConfig().planningContextJobLockMs;
  const prefix = options.planningContextIdPrefix?.trim();
  const result = prefix
    ? await pool.query<JobRow>(
        `UPDATE planning_context_build_jobs
            SET status = 'running',
                attempts = attempts + 1,
                started_at = COALESCE(started_at, now()),
                locked_until = now() + ($1::double precision * interval '1 millisecond'),
                updated_at = now()
          WHERE id = (
            SELECT id FROM planning_context_build_jobs
             WHERE (
                 status = 'queued'
                 OR (
                   status = 'running'
                   AND (locked_until IS NULL OR locked_until < now())
                 )
               )
               AND planning_context_id LIKE $2
             ORDER BY created_at ASC
             FOR UPDATE SKIP LOCKED
             LIMIT 1
          )
          RETURNING ${JOB_RETURNING}`,
        [lockMs, `${prefix}%`],
      )
    : await pool.query<JobRow>(
        `UPDATE planning_context_build_jobs
            SET status = 'running',
                attempts = attempts + 1,
                started_at = COALESCE(started_at, now()),
                locked_until = now() + ($1::double precision * interval '1 millisecond'),
                updated_at = now()
          WHERE id = (
            SELECT id FROM planning_context_build_jobs
             WHERE status = 'queued'
                OR (
                  status = 'running'
                  AND (locked_until IS NULL OR locked_until < now())
                )
             ORDER BY created_at ASC
             FOR UPDATE SKIP LOCKED
             LIMIT 1
          )
          RETURNING ${JOB_RETURNING}`,
        [lockMs],
      );
  const row = result.rows[0];
  if (!row) return null;
  const claimed = rowToJobWithUser(row);
  logJobClaim(claimed);
  return claimed;
}

/**
 * Claim a specific queued ledger job for the pg-boss worker.
 * Returns null when the job is missing, terminal, or already claimed.
 * If attempts exceed max after claim, marks the job failed and returns null.
 */
export async function claimBuildJobByIdForWorker(
  jobId: string,
): Promise<JobRowWithUser | null> {
  const pool = getPool();
  const lockMs = loadConfig().planningContextJobLockMs;
  const maxAttempts = loadConfig().planningContextJobMaxAttempts;

  const existingRows = await getBuildJobById.run({ jobId }, pool);
  const existing = existingRows[0];
  if (!existing) {
    return null;
  }
  if (existing.status === 'succeeded' || existing.status === 'failed') {
    return null;
  }
  if (existing.status !== 'queued') {
    // Already running (or unexpected) — another worker owns it.
    return null;
  }

  const result = await pool.query<JobRow>(
    `UPDATE planning_context_build_jobs
        SET status = 'running',
            attempts = attempts + 1,
            started_at = COALESCE(started_at, now()),
            locked_until = now() + ($2::double precision * interval '1 millisecond'),
            updated_at = now()
      WHERE id = $1
        AND status = 'queued'
      RETURNING ${JOB_RETURNING}`,
    [jobId, lockMs],
  );
  const row = result.rows[0];
  if (!row) {
    return null;
  }
  const claimed = rowToJobWithUser(row);
  if (claimed.attempts > maxAttempts) {
    const buildingPlaceholder: PlanningContext = {
      id: claimed.planningContextId,
      label: claimed.planningContextId,
      source: 'external-osm',
      status: 'building',
      center: [claimed.place.longitude, claimed.place.latitude],
      bbox: [0, 0, 0, 0],
      place: {
        id: claimed.place.id,
        label: claimed.place.label,
        displayName: claimed.place.displayName,
        provider: claimed.place.provider,
      },
      disclaimer: '',
      createdAt: claimed.createdAt,
      updatedAt: claimed.updatedAt,
    };
    await markBuildJobAndContextFailed(
      claimed.id,
      buildingPlaceholder,
      `Build exceeded ${maxAttempts} attempts after worker interruption. Try again.`,
    );
    return null;
  }
  logJobClaim(claimed);
  return claimed;
}

/**
 * Extend the lease on a running build job (heartbeat).
 * Returns false if the job is no longer running (succeeded/failed/stolen).
 */
export async function extendBuildJobLease(jobId: string): Promise<boolean> {
  const lockMs = loadConfig().planningContextJobLockMs;
  const rows = await extendBuildJobLeaseQuery.run(
    { jobId, lockMs },
    getPool(),
  );
  return rows.length > 0;
}

/** Aggregate queue depths and recent outcomes for the health endpoint. */
export async function getBuildJobQueueHealth(): Promise<PlanningContextBuildJobQueueHealthResponse> {
  const config = loadConfig();
  const rows = await getBuildJobQueueHealthQuery.run(undefined, getPool());
  const row = rows[0];

  let pgBoss: PlanningContextBuildJobQueueHealthResponse['pgBoss'] = null;
  if (config.planningContextWorkerMode === 'pg-boss') {
    try {
      const { getPgBossQueueStats } = await import('../worker/bossClient.js');
      pgBoss = await getPgBossQueueStats();
    } catch {
      pgBoss = null;
    }
  }

  return {
    workerEnabled: config.planningContextWorkerEnabled,
    workerMode: config.planningContextWorkerMode,
    pgBossEnabled: config.planningContextWorkerMode === 'pg-boss',
    pollMs: config.planningContextWorkerPollMs,
    lockMs: config.planningContextJobLockMs,
    maxAttempts: config.planningContextJobMaxAttempts,
    heartbeatMs: config.planningContextJobHeartbeatMs,
    queued: Number(row?.queued ?? 0),
    running: Number(row?.running ?? 0),
    runningExpiredLease: Number(row?.running_expired_lease ?? 0),
    succeededRecent: Number(row?.succeeded_recent ?? 0),
    failedLast24h: Number(row?.failed_recent ?? 0),
    oldestQueuedAt: toIsoOrNull(row?.oldest_queued_at ?? null),
    oldestRunningAt: toIsoOrNull(row?.oldest_running_at ?? null),
    pgBoss,
  };
}

/**
 * Mark a running job succeeded. Returns null when the job is no longer
 * `running` (lease lost / already terminal) so the caller can roll back.
 */
export async function markBuildJobSucceeded(
  client: PoolClient,
  jobId: string,
  counts: PlanningContextFeatureCounts,
  reused = false,
): Promise<PlanningContextBuildJob | null> {
  const now = new Date().toISOString();
  const result = await client.query<JobRow>(
    `UPDATE planning_context_build_jobs
        SET status = 'succeeded',
            counts = $2::jsonb,
            reused = $3,
            error_message = NULL,
            locked_until = NULL,
            finished_at = $4::timestamptz,
            updated_at = $4::timestamptz
      WHERE id = $1
        AND status = 'running'
      RETURNING ${JOB_RETURNING}`,
    [jobId, JSON.stringify(counts), reused, now],
  );
  const row = result.rows[0];
  return row ? rowToJob(row) : null;
}

/**
 * Mark a running job failed. Returns null when the job is already terminal
 * (or was reclaimed) so a late failure cannot overwrite success.
 */
export async function markBuildJobFailedOnClient(
  client: PoolClient,
  jobId: string,
  errorMessage: string,
): Promise<PlanningContextBuildJob | null> {
  const now = new Date().toISOString();
  const result = await client.query<JobRow>(
    `UPDATE planning_context_build_jobs
        SET status = 'failed',
            error_message = $2,
            locked_until = NULL,
            finished_at = $3::timestamptz,
            updated_at = $3::timestamptz
      WHERE id = $1
        AND status = 'running'
      RETURNING ${JOB_RETURNING}`,
    [jobId, errorMessage, now],
  );
  const row = result.rows[0];
  return row ? rowToJob(row) : null;
}

/**
 * Mark job + planning context failed in one short transaction.
 * Returns false when the job was no longer `running` (skip context update).
 */
export async function markBuildJobAndContextFailed(
  jobId: string,
  context: PlanningContext,
  errorMessage: string,
): Promise<boolean> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const failed = await markBuildJobFailedOnClient(client, jobId, errorMessage);
    if (!failed) {
      await client.query('ROLLBACK');
      return false;
    }
    await markPlanningContextFailedOnClient(client, context, errorMessage);
    await client.query('COMMIT');
    return true;
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
}
