-- Async planning-context build jobs (Overpass fetch off the DB pool client).

CREATE TABLE IF NOT EXISTS planning_context_build_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  planning_context_id TEXT NOT NULL REFERENCES planning_contexts(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  place JSONB NOT NULL,
  counts JSONB,
  reused BOOLEAN,
  error_message TEXT,
  user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  CONSTRAINT planning_context_build_jobs_status_check
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed'))
);

CREATE INDEX IF NOT EXISTS idx_planning_context_build_jobs_status_created
  ON planning_context_build_jobs (status, created_at);

CREATE INDEX IF NOT EXISTS idx_planning_context_build_jobs_context_created
  ON planning_context_build_jobs (planning_context_id, created_at DESC);
