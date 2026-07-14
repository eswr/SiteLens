import { describe, expect, it } from 'vitest';
import {
  STATIC_DEMO_ATTRIBUTION,
  searchStaticDemoPlaces,
} from './staticPlaceProvider';

describe('searchStaticDemoPlaces', () => {
  it('matches Bengaluru by substring and labels provider as static-demo', () => {
    const results = searchStaticDemoPlaces('bengaluru', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]).toMatchObject({
      id: 'static-demo-bengaluru',
      provider: 'static-demo',
      latitude: 12.9716,
      longitude: 77.5946,
    });
  });

  it('ranks exact/startsWith matches ahead of looser contains matches', () => {
    const results = searchStaticDemoPlaces('paris', 5);
    expect(results[0]?.label.toLowerCase().startsWith('paris')).toBe(true);
  });

  it('respects the limit', () => {
    expect(searchStaticDemoPlaces('a', 2)).toHaveLength(2);
  });

  it('returns an empty list for unknown queries', () => {
    expect(searchStaticDemoPlaces('zzzz-unknown-place', 5)).toEqual([]);
  });

  it('exposes offline portfolio attribution copy', () => {
    expect(STATIC_DEMO_ATTRIBUTION).toContain('Static demo place dataset');
    expect(STATIC_DEMO_ATTRIBUTION).toContain('OpenStreetMap');
  });
});
