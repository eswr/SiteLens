import { afterAll, describe, expect, it } from 'vitest';
import { LOCAL_DEMO_SYDNEY_CONTEXT_ID } from '@sitelens/shared';
import {
  getLayers,
  getParcelById,
  getParcels,
  searchFeatures,
} from './spatialRepository.js';
import { closePool } from './pool.js';

// Integration tests hit a real Postgres/PostGIS. They are skipped unless
// RUN_DB_TESTS=true (e.g. `npm run test:db`) so the default suite never hangs.
const runDbTests = process.env.RUN_DB_TESTS === 'true';

describe.skipIf(!runDbTests)('spatialRepository (integration)', () => {
  afterAll(async () => {
    await closePool();
  });

  it('getLayers returns five layers with counts for Sydney demo', async () => {
    const layers = await getLayers(LOCAL_DEMO_SYDNEY_CONTEXT_ID);
    expect(layers).toHaveLength(5);
    const parcels = layers.find((l) => l.id === 'parcels');
    expect(parcels?.featureCount).toBeGreaterThan(0);
  });

  it('getParcels returns a FeatureCollection', async () => {
    const fc = await getParcels(LOCAL_DEMO_SYDNEY_CONTEXT_ID);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features.length).toBeGreaterThan(0);
    expect(fc.features[0].geometry).toBeTruthy();
  });

  it('getParcelById resolves by parcel_id within the context', async () => {
    const feature = await getParcelById(
      LOCAL_DEMO_SYDNEY_CONTEXT_ID,
      'LOT-1-DP1001',
    );
    expect(feature?.type).toBe('Feature');
  });

  it('getParcelById returns null for unknown id', async () => {
    expect(
      await getParcelById(LOCAL_DEMO_SYDNEY_CONTEXT_ID, 'nope'),
    ).toBeNull();
  });

  it('searchFeatures finds matches across layers in the context', async () => {
    const results = await searchFeatures(
      LOCAL_DEMO_SYDNEY_CONTEXT_ID,
      'exchange',
    );
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(8);
    expect(results[0].geometry).toBeTruthy();
  });

  it('searchFeatures returns only rows from the selected planning context', async () => {
    const { getPool } = await import('./pool.js');
    const pool = getPool();
    const contextId = 'external-osm:test-isolation:ctx';
    const uniqueName = `Isolation Parcel ${Date.now()}`;

    await pool.query(
      `INSERT INTO planning_contexts (
         id, label, source, status,
         center_lng, center_lat,
         bbox_west, bbox_south, bbox_east, bbox_north,
         disclaimer, created_at, updated_at
       ) VALUES (
         $1, 'Isolation Test', 'external-osm', 'ready',
         77.6, 12.97, 77.5, 12.9, 77.7, 13.0,
         'test', now(), now()
       )
       ON CONFLICT (id) DO UPDATE SET status = 'ready', updated_at = now()`,
      [contextId],
    );
    await pool.query(
      `INSERT INTO parcels (
         planning_context_id, id, parcel_id, name, zoning, current_use,
         development_score, area_sqm, status, properties, geom, updated_at
       ) VALUES (
         $1, 'isolation-parcel-1', 'ISO-1', $2, 'MU', 'vacant',
         50, 1000, 'active',
         jsonb_build_object('name', $2::text, 'parcelId', 'ISO-1'),
         ST_Multi(ST_SetSRID(ST_GeomFromText('POLYGON((77.59 12.97,77.591 12.97,77.591 12.971,77.59 12.971,77.59 12.97))'), 4326)),
         now()
       )
       ON CONFLICT (planning_context_id, id) DO UPDATE SET
         name = EXCLUDED.name,
         properties = EXCLUDED.properties`,
      [contextId, uniqueName],
    );

    try {
      const inOther = await searchFeatures(contextId, uniqueName);
      expect(inOther.some((r) => r.id === 'isolation-parcel-1')).toBe(true);
      expect(inOther.some((r) => r.label === uniqueName)).toBe(true);

      const inSydney = await searchFeatures(
        LOCAL_DEMO_SYDNEY_CONTEXT_ID,
        uniqueName,
      );
      expect(inSydney.some((r) => r.id === 'isolation-parcel-1')).toBe(false);
    } finally {
      await pool.query(`DELETE FROM planning_contexts WHERE id = $1`, [
        contextId,
      ]);
    }
  });
});
