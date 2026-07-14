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

/** Default max claims/reclaims when env is unset (also used by unit tests). */
export const MAX_BUILD_JOB_ATTEMPTS = 3;

interface JobRow {
  id: string;
  planning_context_id: string;
  status: PlanningContextBuildJobStatus;
  place: PlanningContextBuildJobPlace;
  counts: PlanningContextFeatureCounts | null;
  reused: boolean | null;
  error_message: string | null;
  user_id: string | null;
  attempts: number;
  locked_until: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  started_at: Date | string | null;
  finished_at: Date | string | null;
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
    status: row.status,
    place: row.place,
    counts: row.counts ?? null,
    reused: row.reused ?? null,
    errorMessage: row.error_message ?? null,
    attempts: Number(row.attempts) || 0,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
    startedAt: toIsoOrNull(row.started_at),
    finishedAt: toIsoOrNull(row.finished_at),
  };
}

const JOB_RETURNING = `id, planning_context_id, status, place, counts, reused,
                error_message, user_id, attempts, locked_until,
                created_at, updated_at, started_at, finished_at`;

const JOB_SELECT = `SELECT ${JOB_RETURNING}
       FROM planning_context_build_jobs`;

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
  const result = await db.query<JobRow>(`${JOB_SELECT} WHERE id = $1`, [jobId]);
  const row = result.rows[0];
  return row ? rowToJob(row) : null;
}

export async function findActiveBuildJob(
  planningContextId: string,
  client?: PoolClient,
): Promise<PlanningContextBuildJob | null> {
  const db = client ?? getPool();
  const result = await db.query<JobRow>(
    `${JOB_SELECT}
      WHERE planning_context_id = $1
        AND status IN ('queued', 'running')
      ORDER BY created_at DESC
      LIMIT 1`,
    [planningContextId],
  );
  const row = result.rows[0];
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
  const result = await db.query<JobRow>(
    `INSERT INTO planning_context_build_jobs (
       planning_context_id, status, place, counts, reused, error_message, user_id,
       created_at, updated_at, started_at, finished_at
     ) VALUES (
       $1, $2, $3::jsonb, $4::jsonb, $5, $6, $7,
       $8::timestamptz, $9::timestamptz, $10::timestamptz, $11::timestamptz
     )
     RETURNING ${JOB_RETURNING}`,
    [
      input.planningContextId,
      input.status,
      JSON.stringify(input.place),
      input.counts != null ? JSON.stringify(input.counts) : null,
      input.reused ?? null,
      input.errorMessage ?? null,
      input.userId ?? null,
      now,
      now,
      input.startedAt ?? null,
      input.finishedAt ?? null,
    ],
  );
  return rowToJob(result.rows[0]!);
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
 * Extend the lease on a running build job (heartbeat).
 * Returns false if the job is no longer running (succeeded/failed/stolen).
 */
export async function extendBuildJobLease(jobId: string): Promise<boolean> {
  const pool = getPool();
  const lockMs = loadConfig().planningContextJobLockMs;
  const result = await pool.query<{ id: string }>(
    `UPDATE planning_context_build_jobs
        SET locked_until = now() + ($2::double precision * interval '1 millisecond'),
            updated_at = now()
      WHERE id = $1
        AND status = 'running'
      RETURNING id`,
    [jobId, lockMs],
  );
  return result.rowCount != null && result.rowCount > 0;
}

interface QueueHealthRow {
  queued: string | number;
  running: string | number;
  running_expired_lease: string | number;
  succeeded_recent: string | number;
  failed_recent: string | number;
  oldest_queued_at: Date | string | null;
  oldest_running_at: Date | string | null;
}

/** Aggregate queue depths and recent outcomes for the health endpoint. */
export async function getBuildJobQueueHealth(): Promise<PlanningContextBuildJobQueueHealthResponse> {
  const config = loadConfig();
  const pool = getPool();
  const result = await pool.query<QueueHealthRow>(
    `SELECT
       COUNT(*) FILTER (WHERE status = 'queued')::int AS queued,
       COUNT(*) FILTER (WHERE status = 'running')::int AS running,
       COUNT(*) FILTER (
         WHERE status = 'running'
           AND (locked_until IS NULL OR locked_until < now())
       )::int AS running_expired_lease,
       COUNT(*) FILTER (
         WHERE status = 'succeeded'
           AND finished_at >= now() - interval '24 hours'
       )::int AS succeeded_recent,
       COUNT(*) FILTER (
         WHERE status = 'failed'
           AND finished_at >= now() - interval '24 hours'
       )::int AS failed_recent,
       MIN(created_at) FILTER (WHERE status = 'queued') AS oldest_queued_at,
       MIN(started_at) FILTER (WHERE status = 'running') AS oldest_running_at
     FROM planning_context_build_jobs`,
  );
  const row = result.rows[0];
  return {
    workerEnabled: config.planningContextWorkerEnabled,
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
