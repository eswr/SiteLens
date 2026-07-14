import type { ContextBbox, ExternalFeature } from './externalDataTypes.js';

/**
 * Deterministic open-map-shaped features for portfolio / CI when Overpass is
 * disabled or unavailable and EXTERNAL_CONTEXT_SYNTHETIC_FALLBACK_ENABLED=true.
 * Never silent: callers must only use this when the fallback flag is on.
 */
export function generateSyntheticExternalFeatures(
  bbox: ContextBbox,
): ExternalFeature[] {
  const [west, south, east, north] = bbox;
  const width = Math.max(east - west, 0.0008);
  const height = Math.max(north - south, 0.0008);
  const cx = (west + east) / 2;
  const cy = (south + north) / 2;
  const dx = width * 0.12;
  const dy = height * 0.12;

  const rect = (
    x0: number,
    y0: number,
    x1: number,
    y1: number,
  ): number[][][] => [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ],
  ];

  return [
    {
      id: 'synthetic-building-1',
      source: 'synthetic-fallback',
      kind: 'building',
      name: 'Synthetic Demo Tower',
      tags: { building: 'office' },
      geometry: {
        type: 'Polygon',
        coordinates: rect(cx - dx, cy - dy, cx, cy),
      },
    },
    {
      id: 'synthetic-landuse-1',
      source: 'synthetic-fallback',
      kind: 'landuse',
      tags: { landuse: 'commercial' },
      geometry: {
        type: 'Polygon',
        coordinates: rect(cx, cy, cx + dx, cy + dy),
      },
    },
    {
      id: 'synthetic-park-1',
      source: 'synthetic-fallback',
      kind: 'park',
      name: 'Synthetic Demo Park',
      tags: { leisure: 'park' },
      geometry: {
        type: 'Polygon',
        coordinates: rect(
          west + width * 0.1,
          south + height * 0.1,
          west + width * 0.35,
          south + height * 0.35,
        ),
      },
    },
    {
      id: 'synthetic-transit-1',
      source: 'synthetic-fallback',
      kind: 'transit',
      name: 'Synthetic Demo Station',
      tags: { railway: 'station', public_transport: 'station' },
      geometry: {
        type: 'Point',
        coordinates: [cx + dx * 0.5, cy - dy * 0.5],
      },
    },
    {
      id: 'synthetic-construction-1',
      source: 'synthetic-fallback',
      kind: 'construction',
      name: 'Synthetic Demo Works',
      tags: { construction: 'yes' },
      geometry: {
        type: 'LineString',
        coordinates: [
          [cx - dx * 0.8, cy + dy * 0.4],
          [cx + dx * 0.8, cy + dy * 0.4],
        ],
      },
    },
  ];
}
