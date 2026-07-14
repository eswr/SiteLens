/*
  Non-spatial planning_context_build_jobs queries.
  Claim (FOR UPDATE SKIP LOCKED) stays as raw SQL in the repository.
*/

/* @name GetBuildJobById */
SELECT id,
       planning_context_id,
       status,
       place,
       counts,
       reused,
       error_message,
       user_id,
       attempts,
       locked_until,
       created_at,
       updated_at,
       started_at,
       finished_at
  FROM planning_context_build_jobs
 WHERE id = :jobId!;

/* @name FindActiveBuildJobByContext */
SELECT id,
       planning_context_id,
       status,
       place,
       counts,
       reused,
       error_message,
       user_id,
       attempts,
       locked_until,
       created_at,
       updated_at,
       started_at,
       finished_at
  FROM planning_context_build_jobs
 WHERE planning_context_id = :planningContextId!
   AND status IN ('queued', 'running')
 ORDER BY created_at DESC
 LIMIT 1;

/* @name InsertBuildJob */
INSERT INTO planning_context_build_jobs (
  planning_context_id,
  status,
  place,
  counts,
  reused,
  error_message,
  user_id,
  created_at,
  updated_at,
  started_at,
  finished_at
) VALUES (
  :planningContextId!,
  :status!,
  :place!::jsonb,
  :counts::jsonb,
  :reused,
  :errorMessage,
  :userId,
  :createdAt!::timestamptz,
  :updatedAt!::timestamptz,
  :startedAt::timestamptz,
  :finishedAt::timestamptz
)
RETURNING id,
          planning_context_id,
          status,
          place,
          counts,
          reused,
          error_message,
          user_id,
          attempts,
          locked_until,
          created_at,
          updated_at,
          started_at,
          finished_at;

/* @name ExtendBuildJobLease */
UPDATE planning_context_build_jobs
   SET locked_until = now() + (:lockMs!::double precision * interval '1 millisecond'),
       updated_at = now()
 WHERE id = :jobId!
   AND status = 'running'
RETURNING id;

/* @name GetBuildJobQueueHealth */
SELECT
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
FROM planning_context_build_jobs;
