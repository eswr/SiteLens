import type {
  PlanningContext,
  PlanningContextBuildJob,
  PlanningContextBuildJobPlace,
  PlanningContextBuildJobStatus,
  PlanningContextFeatureCounts,
} from '@sitelens/shared';
import type { PoolClient } from 'pg';
import { loadConfig } from '../config';
import { getPool } from '../db/pool';
import { markPlanningContextFailedOnClient } from './planningContextRepository';

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

function logJobClaim(job: JobRowWithUser): void {
  console.info(
    `[planning-context-build] claimed job=${job.id} context=${job.planningContextId} attempts=${job.attempts} status=${job.status}`,
  );
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

export async function markBuildJobSucceeded(
  client: PoolClient,
  jobId: string,
  counts: PlanningContextFeatureCounts,
  reused = false,
): Promise<PlanningContextBuildJob> {
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
      RETURNING ${JOB_RETURNING}`,
    [jobId, JSON.stringify(counts), reused, now],
  );
  return rowToJob(result.rows[0]!);
}

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
      RETURNING ${JOB_RETURNING}`,
    [jobId, errorMessage, now],
  );
  const row = result.rows[0];
  return row ? rowToJob(row) : null;
}

/** Mark job + planning context failed in one short transaction. */
export async function markBuildJobAndContextFailed(
  jobId: string,
  context: PlanningContext,
  errorMessage: string,
): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await markBuildJobFailedOnClient(client, jobId, errorMessage);
    await markPlanningContextFailedOnClient(client, context, errorMessage);
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
}
