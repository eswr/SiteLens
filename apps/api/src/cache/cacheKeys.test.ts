import { describe, expect, it } from 'vitest';
import {
  analysisKey,
  layersKey,
  parcelDetailKey,
  placeSearchKey,
  planningSummaryKey,
  searchKey,
} from './cacheKeys';

describe('cacheKeys', () => {
  it('layersKey includes planningContextId', () => {
    expect(layersKey('local-demo-sydney')).toBe(
      'sitelens:layers:v1:local-demo-sydney',
    );
    expect(layersKey('external-osm:bengaluru:abc')).not.toBe(
      layersKey('local-demo-sydney'),
    );
  });

  it('parcelDetailKey includes context and id', () => {
    expect(parcelDetailKey('local-demo-sydney', 'parcel-001')).toBe(
      'sitelens:parcel:v1:local-demo-sydney:parcel-001',
    );
  });

  it('searchKey normalizes case and differs by context/scope', () => {
    expect(searchKey('local-demo-sydney', ' Central ', 'free')).toBe(
      searchKey('local-demo-sydney', 'central', 'free'),
    );
    expect(searchKey('local-demo-sydney', 'metro', 'free')).not.toBe(
      searchKey('external-osm:x:1', 'metro', 'free'),
    );
    expect(searchKey('local-demo-sydney', 'x', 'free')).not.toBe(
      searchKey('local-demo-sydney', 'x', 'pro'),
    );
  });

  it('analysisKey differs by planning context for the same AOI polygon', () => {
    const geometry = {
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
    };
    const key = analysisKey('local-demo-sydney', geometry, 'pro');
    expect(key).toBe(analysisKey('local-demo-sydney', structuredClone(geometry), 'pro'));
    expect(key.startsWith('sitelens:analysis:v1:local-demo-sydney:pro:')).toBe(
      true,
    );
    expect(key).not.toContain('151');
    expect(analysisKey('ctx-a', geometry, 'pro')).not.toBe(
      analysisKey('ctx-b', geometry, 'pro'),
    );
  });

  it('planningSummaryKey is scoped by planning context', () => {
    const analysisResult = {
      areaSqm: 1000,
      parcelCount: 2,
      averageDevelopmentScore: 70,
      zoningBreakdown: [],
      intersectingConstraints: [],
      nearbyTransit: [],
      developmentActivityCount: 0,
    };
    expect(
      planningSummaryKey('local-demo-sydney', 'pro', analysisResult),
    ).not.toBe(
      planningSummaryKey('external-osm:city:1', 'pro', analysisResult),
    );
  });

  it('placeSearchKey remains independent from planning context', () => {
    const nominatim = placeSearchKey('nominatim', 'Bengaluru', 5);
    const staticDemo = placeSearchKey('static-demo', 'Bengaluru', 5);
    expect(nominatim).toContain(':nominatim:');
    expect(staticDemo).toContain(':static-demo:');
    expect(nominatim).not.toBe(staticDemo);
  });
});
