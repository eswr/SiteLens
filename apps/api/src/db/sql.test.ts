import { describe, expect, it } from 'vitest';
import { rowToFeature, rowsToFeatureCollection, isDbConnectionError } from './sql.js';

describe('rowToFeature', () => {
  it('maps a row to a GeoJSON Feature', () => {
    const feature = rowToFeature({
      id: 'parcel-001',
      geometry: { type: 'Polygon', coordinates: [] },
      properties: { parcelId: 'LOT-1' },
    });
    expect(feature).toEqual({
      type: 'Feature',
      id: 'parcel-001',
      geometry: { type: 'Polygon', coordinates: [] },
      properties: { parcelId: 'LOT-1' },
    });
  });

  it('defaults null properties to an empty object', () => {
    const feature = rowToFeature({ id: 'x', geometry: null, properties: null });
    expect(feature.properties).toEqual({});
  });
});

describe('rowsToFeatureCollection', () => {
  it('wraps rows in a FeatureCollection', () => {
    const fc = rowsToFeatureCollection([
      { id: 'a', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
    ]);
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].id).toBe('a');
  });
});

describe('isDbConnectionError', () => {
  it('detects connection-refused', () => {
    expect(isDbConnectionError({ code: 'ECONNREFUSED' })).toBe(true);
  });

  it('is false for unrelated errors', () => {
    expect(isDbConnectionError(new Error('boom'))).toBe(false);
    expect(isDbConnectionError(null)).toBe(false);
  });
});
