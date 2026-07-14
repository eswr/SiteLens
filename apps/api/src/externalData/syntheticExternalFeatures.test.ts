import { describe, expect, it } from 'vitest';
import { generateSyntheticExternalFeatures } from './syntheticExternalFeatures.js';
import { osmToPlanningContext } from './osmToPlanningContext.js';

describe('generateSyntheticExternalFeatures', () => {
  it('produces layers that osmToPlanningContext can normalize', () => {
    const features = generateSyntheticExternalFeatures([
      77.58, 12.96, 77.61, 12.99,
    ]);
    expect(features.every((f) => f.source === 'synthetic-fallback')).toBe(true);
    expect(features.length).toBeGreaterThanOrEqual(4);

    const normalized = osmToPlanningContext(features);
    expect(normalized.sites.length).toBeGreaterThan(0);
    expect(normalized.landUse.length).toBeGreaterThan(0);
    expect(normalized.transit.length).toBeGreaterThan(0);
  });
});
