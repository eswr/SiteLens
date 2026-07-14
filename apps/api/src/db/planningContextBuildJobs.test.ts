import { afterAll, describe, expect, it } from 'vitest';
import { claimNextQueuedBuildJob } from '../externalData/planningContextBuildJobRepository';
import { closePool, getPool } from './pool';

// Integration tests hit a real Postgres. Skipped unless RUN_DB_TESTS=true
// (e.g. `npm run test:db`) so the default suite never hangs.
const runDbTests = process.env.RUN_DB_TESTS === 'true';

/** Isolates this suite from real / other-dev build jobs. */
const SUITE_PREFIX = `external-osm:test-build-jobs:${Date.now()}`;

const placeJson = {
  id: 'static-demo-unique-idx',
  label: 'Unique Index City',
  displayName: 'Unique Index City',
  latitude: 12.97,
  longitude: 77.59,
  provider: 'static-demo',
};

function contextId(suffix: string): string {
  return `${SUITE_PREFIX}:${suffix}`;
}

async function insertContext(
  id: string,
  status = 'building',
): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO planning_contexts (
       id, label, source, status,
       center_lng, center_lat,
       bbox_west, bbox_south, bbox_east, bbox_north,
       disclaimer, created_at, updated_at
     ) VALUES (
       $1, 'Unique Index Test', 'external-osm', $2,
       77.59, 12.97, 77.5, 12.9, 77.7, 13.0,
       'test', now(), now()
     )`,
    [id, status],
  );
}

async function cleanupSuiteRows(): Promise<void> {
  await getPool().query(
    `DELETE FROM planning_contexts WHERE id LIKE $1`,
    [`${SUITE_PREFIX}%`],
  );
}

describe.skipIf(!runDbTests)(
  'planning_context_build_jobs unique active index (integration)',
  () => {
    afterAll(async () => {
      try {
        await cleanupSuiteRows();
      } finally {
        await closePool();
      }
    });

    it('rejects a second queued job for the same planning_context_id', async () => {
      const pool = getPool();
      const id = contextId(`queued-${Date.now()}`);
      try {
        await insertContext(id);

        await pool.query(
          `INSERT INTO planning_context_build_jobs (
             planning_context_id, status, place
           ) VALUES ($1, 'queued', $2::jsonb)`,
          [id, JSON.stringify(placeJson)],
        );

        await expect(
          pool.query(
            `INSERT INTO planning_context_build_jobs (
               planning_context_id, status, place
             ) VALUES ($1, 'queued', $2::jsonb)`,
            [id, JSON.stringify(placeJson)],
          ),
        ).rejects.toMatchObject({ code: '23505' });
      } finally {
        await getPool().query(`DELETE FROM planning_contexts WHERE id = $1`, [
          id,
        ]);
      }
    });

    it('rejects queued + running for the same planning_context_id', async () => {
      const pool = getPool();
      const id = contextId(`mixed-${Date.now()}`);
      try {
        await insertContext(id);

        await pool.query(
          `INSERT INTO planning_context_build_jobs (
             planning_context_id, status, place, locked_until
           ) VALUES ($1, 'running', $2::jsonb, now() + interval '5 minutes')`,
          [id, JSON.stringify(placeJson)],
        );

        await expect(
          pool.query(
            `INSERT INTO planning_context_build_jobs (
               planning_context_id, status, place
             ) VALUES ($1, 'queued', $2::jsonb)`,
            [id, JSON.stringify(placeJson)],
          ),
        ).rejects.toMatchObject({ code: '23505' });
      } finally {
        await getPool().query(`DELETE FROM planning_contexts WHERE id = $1`, [
          id,
        ]);
      }
    });

    it('allows a new queued job after a previous job succeeded', async () => {
      const pool = getPool();
      const id = contextId(`succeeded-${Date.now()}`);
      try {
        await insertContext(id, 'ready');

        await pool.query(
          `INSERT INTO planning_context_build_jobs (
             planning_context_id, status, place, finished_at
           ) VALUES ($1, 'succeeded', $2::jsonb, now())`,
          [id, JSON.stringify(placeJson)],
        );

        const queued = await pool.query<{ id: string }>(
          `INSERT INTO planning_context_build_jobs (
             planning_context_id, status, place
           ) VALUES ($1, 'queued', $2::jsonb)
           RETURNING id`,
          [id, JSON.stringify(placeJson)],
        );
        expect(queued.rows[0]?.id).toBeTruthy();
      } finally {
        await getPool().query(`DELETE FROM planning_contexts WHERE id = $1`, [
          id,
        ]);
      }
    });

    it('allows a new queued job after a previous job failed', async () => {
      const pool = getPool();
      const id = contextId(`failed-${Date.now()}`);
      try {
        await insertContext(id, 'failed');

        await pool.query(
          `INSERT INTO planning_context_build_jobs (
             planning_context_id, status, place, finished_at, error_message
           ) VALUES ($1, 'failed', $2::jsonb, now(), 'boom')`,
          [id, JSON.stringify(placeJson)],
        );

        const queued = await pool.query<{ id: string }>(
          `INSERT INTO planning_context_build_jobs (
             planning_context_id, status, place
           ) VALUES ($1, 'queued', $2::jsonb)
           RETURNING id`,
          [id, JSON.stringify(placeJson)],
        );
        expect(queued.rows[0]?.id).toBeTruthy();
      } finally {
        await getPool().query(`DELETE FROM planning_contexts WHERE id = $1`, [
          id,
        ]);
      }
    });

    it('reclaims an expired running job (locked_until in the past)', async () => {
      const pool = getPool();
      const id = contextId(`reclaim-expired-${Date.now()}`);
      try {
        await insertContext(id);

        const inserted = await pool.query<{ id: string; attempts: number }>(
          `INSERT INTO planning_context_build_jobs (
             planning_context_id, status, place, attempts, locked_until, started_at
           ) VALUES (
             $1, 'running', $2::jsonb, 1, now() - interval '1 minute', now() - interval '10 minutes'
           )
           RETURNING id, attempts`,
          [id, JSON.stringify(placeJson)],
        );
        const jobId = inserted.rows[0]!.id;

        const claimed = await claimNextQueuedBuildJob({
          planningContextIdPrefix: SUITE_PREFIX,
        });
        expect(claimed?.id).toBe(jobId);
        expect(claimed?.attempts).toBe(2);
        expect(claimed?.status).toBe('running');
      } finally {
        await getPool().query(`DELETE FROM planning_contexts WHERE id = $1`, [
          id,
        ]);
      }
    });

    it('reclaims a running job with locked_until IS NULL', async () => {
      const pool = getPool();
      const id = contextId(`reclaim-null-${Date.now()}`);
      try {
        await insertContext(id);

        const inserted = await pool.query<{ id: string }>(
          `INSERT INTO planning_context_build_jobs (
             planning_context_id, status, place, attempts, locked_until, started_at
           ) VALUES (
             $1, 'running', $2::jsonb, 0, NULL, now() - interval '10 minutes'
           )
           RETURNING id`,
          [id, JSON.stringify(placeJson)],
        );
        const jobId = inserted.rows[0]!.id;

        const claimed = await claimNextQueuedBuildJob({
          planningContextIdPrefix: SUITE_PREFIX,
        });
        expect(claimed?.id).toBe(jobId);
        expect(claimed?.attempts).toBe(1);
        expect(claimed?.status).toBe('running');
        expect(claimed?.startedAt).toBeTruthy();
      } finally {
        await getPool().query(`DELETE FROM planning_contexts WHERE id = $1`, [
          id,
        ]);
      }
    });
  },
);
