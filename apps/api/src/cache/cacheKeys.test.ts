import { describe, expect, it } from 'vitest';
import { analysisKey, layersKey, parcelDetailKey, searchKey } from './cacheKeys';

describe('cacheKeys', () => {
  it('layersKey is a stable, namespaced, versioned key', () => {
    expect(layersKey()).toBe('sitelens:layers:v1');
  });

  it('parcelDetailKey includes the id', () => {
    expect(parcelDetailKey('parcel-001')).toBe('sitelens:parcel:v1:parcel-001');
  });

  it('searchKey normalizes case and whitespace', () => {
    expect(searchKey(' Central ')).toBe(searchKey('central'));
    expect(searchKey('exchange')).not.toBe(searchKey('foundry'));
  });

  it('analysisKey is stable for equivalent geometry and never contains raw coords', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    };
    const key = analysisKey(geometry);
    expect(key).toBe(analysisKey(structuredClone(geometry)));
    expect(key.startsWith('sitelens:analysis:v1:')).toBe(true);
    // The hash must not leak coordinates.
    expect(key).not.toContain('151');
    expect(key).not.toContain('[');
  });

  it('analysisKey differs for different geometry', () => {
    const a = { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] };
    const b = { type: 'Polygon', coordinates: [[[0, 0], [2, 0], [2, 2], [0, 0]]] };
    expect(analysisKey(a)).not.toBe(analysisKey(b));
  });
});
