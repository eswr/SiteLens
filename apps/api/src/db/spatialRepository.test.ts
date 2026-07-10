import { afterAll, describe, expect, it } from 'vitest';
import {
  getLayers,
  getParcelById,
  getParcels,
  searchFeatures,
} from './spatialRepository';
import { closePool } from './pool';

// Integration tests hit a real Postgres/PostGIS. They are skipped unless
// RUN_DB_TESTS=true (e.g. `npm run test:db`) so the default suite never hangs.
const runDbTests = process.env.RUN_DB_TESTS === 'true';

describe.skipIf(!runDbTests)('spatialRepository (integration)', () => {
  afterAll(async () => {
    await closePool();
  });

  it('getLayers returns five layers with counts', async () => {
    const layers = await getLayers();
    expect(layers).toHaveLength(5);
    const parcels = layers.find((l) => l.id === 'parcels');
    expect(parcels?.featureCount).toBeGreaterThan(0);
  });

  it('getParcels returns a FeatureCollection', async () => {
    const fc = await getParcels();
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features.length).toBeGreaterThan(0);
    expect(fc.features[0].geometry).toBeTruthy();
  });

  it('getParcelById resolves by parcel_id', async () => {
    const feature = await getParcelById('LOT-1-DP1001');
    expect(feature?.type).toBe('Feature');
  });

  it('getParcelById returns null for unknown id', async () => {
    expect(await getParcelById('nope')).toBeNull();
  });

  it('searchFeatures finds matches across layers', async () => {
    const results = await searchFeatures('exchange');
    expect(results.length).toBeGreaterThan(0);
    expect(results.length).toBeLessThanOrEqual(8);
    expect(results[0].geometry).toBeTruthy();
  });
});
