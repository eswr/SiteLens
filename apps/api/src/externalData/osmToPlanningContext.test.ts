import { describe, expect, it } from 'vitest';
import { osmToPlanningContext } from './osmToPlanningContext';
import type { ExternalFeature } from './externalDataTypes';

const features: ExternalFeature[] = [
  {
    id: 'osm-way-1',
    source: 'osm-overpass',
    kind: 'building',
    name: 'Demo Tower',
    tags: { building: 'office' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [77.59, 12.97],
          [77.591, 12.97],
          [77.591, 12.971],
          [77.59, 12.971],
          [77.59, 12.97],
        ],
      ],
    },
  },
  {
    id: 'osm-way-2',
    source: 'osm-overpass',
    kind: 'landuse',
    tags: { landuse: 'commercial' },
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [77.592, 12.972],
          [77.593, 12.972],
          [77.593, 12.973],
          [77.592, 12.973],
          [77.592, 12.972],
        ],
      ],
    },
  },
  {
    id: 'osm-node-3',
    source: 'osm-overpass',
    kind: 'transit',
    name: 'MG Road Metro',
    tags: { railway: 'station', public_transport: 'station' },
    geometry: { type: 'Point', coordinates: [77.607, 12.975] },
  },
  {
    id: 'osm-way-4',
    source: 'osm-overpass',
    kind: 'construction',
    name: 'Site works',
    tags: { construction: 'yes' },
    geometry: {
      type: 'LineString',
      coordinates: [
        [77.594, 12.974],
        [77.595, 12.974],
      ],
    },
  },
];

describe('osmToPlanningContext', () => {
  it('normalizes buildings, landuse, transit, and construction proxies', () => {
    const normalized = osmToPlanningContext(features);
    expect(normalized.sites.length).toBe(1);
    expect(normalized.sites[0]?.parcelId).toContain('OSM-');
    expect(normalized.sites[0]?.status).toBe('External Context');

    expect(normalized.landUse.length).toBe(1);
    expect(normalized.landUse[0]?.zoneName).toBe('Commercial Context');

    expect(normalized.transit.length).toBe(1);
    expect(normalized.transit[0]?.name).toBe('MG Road Metro');

    expect(normalized.constraints.length).toBeGreaterThan(0);
    expect(normalized.developmentActivity.length).toBeGreaterThan(0);
    expect(normalized.developmentActivity[0]?.status).toBe('External Proxy');
  });
});
