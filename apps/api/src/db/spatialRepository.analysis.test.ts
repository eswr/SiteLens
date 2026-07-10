import { afterAll, describe, expect, it } from 'vitest';
import { analyzeArea, InvalidGeometryError } from './spatialRepository';
import { closePool } from './pool';
import type { GeoJsonPolygon } from '@sitelens/shared';

// Live PostGIS analysis tests. Skipped unless RUN_DB_TESTS=true so the default
// suite never requires Docker. Assumes migrations + ingestion have run.
const runDbTests = process.env.RUN_DB_TESTS === 'true';

// A polygon covering the Sydney CBD sample data.
const cbdPolygon: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [151.199, -33.876],
      [151.22, -33.876],
      [151.22, -33.86],
      [151.199, -33.86],
      [151.199, -33.876],
    ],
  ],
};

describe.skipIf(!runDbTests)('analyzeArea (integration)', () => {
  afterAll(async () => {
    await closePool();
  });

  it('returns a full spatial analysis over the sample data', async () => {
    const result = await analyzeArea(cbdPolygon);

    expect(result.areaSqm).toBeGreaterThan(0);
    expect(Number.isNaN(result.areaSqm)).toBe(false);
    expect(result.areaHectares).toBeGreaterThan(0);
    expect(result.parcelCount).toBeGreaterThanOrEqual(0);

    expect(Array.isArray(result.zoningBreakdown)).toBe(true);
    expect(Array.isArray(result.intersectingConstraints)).toBe(true);
    expect(Array.isArray(result.nearbyTransit)).toBe(true);
    expect(Array.isArray(result.developmentActivityByStatus)).toBe(true);

    if (result.averageDevelopmentScore !== null) {
      expect(Number.isNaN(result.averageDevelopmentScore)).toBe(false);
    }
    for (const stop of result.nearbyTransit) {
      expect(typeof stop.distanceMeters).toBe('number');
      expect(Number.isNaN(stop.distanceMeters)).toBe(false);
    }
  });

  it('covers the sample parcels for a CBD-wide polygon', async () => {
    const result = await analyzeArea(cbdPolygon);
    expect(result.parcelCount).toBeGreaterThan(0);
  });

  it('rejects self-intersecting (invalid) geometry', async () => {
    const bowtie: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [1, 1],
          [0, 1],
          [1, 0],
          [0, 0],
        ],
      ],
    };
    await expect(analyzeArea(bowtie)).rejects.toBeInstanceOf(InvalidGeometryError);
  });
});
