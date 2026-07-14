-- Singleflight + crash recovery for planning-context build jobs.
-- Order: add columns → clean duplicates → backfill null leases → unique index.

ALTER TABLE planning_context_build_jobs
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Keep newest active job per context; fail older active jobs so the unique
-- index can be created on databases that already have duplicates.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY planning_context_id
           ORDER BY created_at DESC
         ) AS rn
  FROM planning_context_build_jobs
  WHERE status IN ('queued', 'running')
)
UPDATE planning_context_build_jobs
SET status = 'failed',
    error_message = 'Superseded by a newer active build job during migration.',
    finished_at = now(),
    updated_at = now(),
    locked_until = NULL
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- Old running rows without a lease are treated as immediately reclaimable.
UPDATE planning_context_build_jobs
SET locked_until = now() - interval '1 second'
WHERE status = 'running'
  AND locked_until IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS planning_context_build_jobs_one_active_uidx
  ON planning_context_build_jobs (planning_context_id)
  WHERE status IN ('queued', 'running');
