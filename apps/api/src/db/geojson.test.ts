import { describe, expect, it } from 'vitest';
import {
  assertFeatureCollection,
  resolveFeatureId,
  validateFeature,
  type IngestFeature,
} from './geojson.js';

const polygonFeature: IngestFeature = {
  type: 'Feature',
  id: 'parcel-001',
  geometry: { type: 'Polygon', coordinates: [[[0, 0]]] },
  properties: { parcelId: 'LOT-1', name: 'A', zoning: 'B1', currentUse: 'X', status: 'Active' },
};

describe('assertFeatureCollection', () => {
  it('accepts a valid FeatureCollection', () => {
    const fc = assertFeatureCollection(
      { type: 'FeatureCollection', features: [] },
      'test',
    );
    expect(fc.features).toEqual([]);
  });

  it('throws on a non-object', () => {
    expect(() => assertFeatureCollection(null, 'test')).toThrow();
  });

  it('throws when type is wrong', () => {
    expect(() =>
      assertFeatureCollection({ type: 'Feature', features: [] }, 'test'),
    ).toThrow(/FeatureCollection/);
  });

  it('throws when features is not an array', () => {
    expect(() =>
      assertFeatureCollection({ type: 'FeatureCollection', features: {} }, 'test'),
    ).toThrow(/features/);
  });
});

describe('validateFeature', () => {
  it('passes for a valid feature with required props', () => {
    expect(
      validateFeature(polygonFeature, ['parcelId', 'name', 'status']).ok,
    ).toBe(true);
  });

  it('fails when geometry is missing', () => {
    const result = validateFeature({ ...polygonFeature, geometry: null }, []);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/geometry/);
  });

  it('fails when a required property is missing', () => {
    const result = validateFeature(polygonFeature, ['missingProp']);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/missingProp/);
  });
});

describe('resolveFeatureId', () => {
  it('prefers the feature id', () => {
    expect(resolveFeatureId(polygonFeature)).toBe('parcel-001');
  });

  it('falls back to properties.id', () => {
    expect(
      resolveFeatureId({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: { id: 'from-props' },
      }),
    ).toBe('from-props');
  });

  it('returns empty string when no id exists', () => {
    expect(
      resolveFeatureId({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: {},
      }),
    ).toBe('');
  });
});
