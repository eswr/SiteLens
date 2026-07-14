import { describe, expect, it } from 'vitest';
import {
  bboxAreaDeg2,
  BboxTooLargeError,
  buildExternalContextId,
  deriveContextBbox,
  fallbackBboxAroundCenter,
  nominatimBoxToContextBbox,
} from './bbox';

describe('bbox helpers', () => {
  it('converts Nominatim box to west/south/east/north', () => {
    expect(nominatimBoxToContextBbox([12.7, 13.2, 77.3, 77.9])).toEqual([
      77.3, 12.7, 77.9, 13.2,
    ]);
  });

  it('clamps huge place bboxes to a city-center box', () => {
    const bbox = deriveContextBbox({
      longitude: 77.5946,
      latitude: 12.9716,
      boundingBox: [12.7, 13.2, 77.3, 77.9],
      maxAreaDeg2: 0.01,
    });
    expect(bboxAreaDeg2(bbox)).toBeLessThanOrEqual(0.01);
    expect(bbox[0]).toBeLessThan(77.5946);
    expect(bbox[2]).toBeGreaterThan(77.5946);
  });

  it('builds a stable external context id', () => {
    const bbox = fallbackBboxAroundCenter(55.27, 25.2);
    const a = buildExternalContextId({
      label: 'Dubai, UAE',
      provider: 'static-demo',
      placeId: 'static-demo-dubai',
      bbox,
    });
    const b = buildExternalContextId({
      label: 'Dubai, UAE',
      provider: 'static-demo',
      placeId: 'static-demo-dubai',
      bbox,
    });
    expect(a).toBe(b);
    expect(a.startsWith('external-osm:dubai')).toBe(true);
  });

  it('throws when even the clamped bbox is too large', () => {
    expect(() =>
      deriveContextBbox({
        longitude: 0,
        latitude: 0,
        maxAreaDeg2: 0.0000001,
      }),
    ).toThrow(BboxTooLargeError);
  });
});
