import {
  area as turfArea,
  booleanIntersects,
  booleanPointInPolygon,
  centroid as turfCentroid,
  distance as turfDistance,
} from '@turf/turf';
import type { Feature, FeatureCollection, Point, Polygon } from 'geojson';
import { LAYER_BY_ID } from '../data/layers';
import type {
  AreaOfInterest,
  AreaPoint,
  ConstraintIntersection,
  DevelopmentActivitySummary,
  NearbyTransitItem,
  ParcelAnalysisSummary,
  SpatialAnalysisResult,
  ZoningBreakdownItem,
} from '../types/analysis';

/** Transit stops within this distance of the AOI centroid are "nearby". */
export const TRANSIT_RADIUS_METERS = 1500;

/** Build a closed GeoJSON polygon (and AOI wrapper) from drawn vertices. */
export function pointsToAreaOfInterest(points: AreaPoint[]): AreaOfInterest {
  const ring = points.map((point) => [point.lng, point.lat] as [number, number]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last || first[0] !== last[0] || first[1] !== last[1]) {
    if (first) {
      ring.push([first[0], first[1]]);
    }
  }
  const polygon: Feature<Polygon> = {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
  return { points, polygon };
}

async function loadCollection(url: string, label: string): Promise<FeatureCollection> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${label} (${response.status})`);
  }
  return (await response.json()) as FeatureCollection;
}

function prop(feature: Feature, key: string): string | undefined {
  const value = feature.properties?.[key];
  return value === null || value === undefined ? undefined : String(value);
}

function analyzeParcels(
  parcels: FeatureCollection,
  aoi: Feature<Polygon>,
): ParcelAnalysisSummary {
  const intersecting = parcels.features.filter((feature) =>
    booleanIntersects(feature, aoi),
  );
  const scores = intersecting
    .map((feature) => Number(feature.properties?.developmentScore))
    .filter((value) => Number.isFinite(value));
  const averageDevelopmentScore =
    scores.length > 0
      ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length)
      : null;
  const totalAreaSqm = intersecting.reduce(
    (sum, feature) => sum + turfArea(feature),
    0,
  );
  return {
    parcelCount: intersecting.length,
    averageDevelopmentScore,
    totalAreaSqm: Math.round(totalAreaSqm),
  };
}

function analyzeZoning(
  zoning: FeatureCollection,
  aoi: Feature<Polygon>,
): ZoningBreakdownItem[] {
  const byCode = new Map<string, ZoningBreakdownItem>();
  for (const feature of zoning.features) {
    if (!booleanIntersects(feature, aoi)) {
      continue;
    }
    const zoneCode = prop(feature, 'zoneCode') ?? 'Unknown';
    const zoneName = prop(feature, 'zoneName') ?? 'Unknown zone';
    const existing = byCode.get(zoneCode);
    if (existing) {
      existing.count += 1;
    } else {
      byCode.set(zoneCode, { zoneCode, zoneName, count: 1 });
    }
  }
  return [...byCode.values()].sort((a, b) => b.count - a.count);
}

function analyzeConstraints(
  constraints: FeatureCollection,
  aoi: Feature<Polygon>,
): ConstraintIntersection[] {
  return constraints.features
    .filter((feature) => booleanIntersects(feature, aoi))
    .map((feature) => ({
      id: prop(feature, 'id') ?? '',
      constraintType: prop(feature, 'constraintType') ?? 'Constraint',
      riskLevel: prop(feature, 'riskLevel') ?? 'Unknown',
      description: prop(feature, 'description') ?? '',
    }));
}

function analyzeTransit(
  transit: FeatureCollection,
  aoi: Feature<Polygon>,
): NearbyTransitItem[] {
  const center = turfCentroid(aoi);
  return transit.features
    .filter((feature): feature is Feature<Point> => feature.geometry.type === 'Point')
    .map((feature) => ({
      id: prop(feature, 'id') ?? '',
      name: prop(feature, 'name') ?? 'Transit stop',
      mode: prop(feature, 'mode') ?? 'Unknown',
      distanceMeters: Math.round(
        turfDistance(center, feature, { units: 'kilometers' }) * 1000,
      ),
    }))
    .filter((item) => item.distanceMeters <= TRANSIT_RADIUS_METERS)
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}

function analyzeDevelopmentActivity(
  development: FeatureCollection,
  aoi: Feature<Polygon>,
): { count: number; byStatus: DevelopmentActivitySummary[] } {
  const inside = development.features.filter(
    (feature) =>
      feature.geometry.type === 'Point' &&
      booleanPointInPolygon(feature as Feature<Point>, aoi),
  );
  const byStatusMap = new Map<string, number>();
  for (const feature of inside) {
    const status = prop(feature, 'status') ?? 'Unknown';
    byStatusMap.set(status, (byStatusMap.get(status) ?? 0) + 1);
  }
  const byStatus = [...byStatusMap.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);
  return { count: inside.length, byStatus };
}

/**
 * Analyze an AOI polygon against every mock planning layer with Turf.js.
 *
 * Frontend-only: reads `/data/*.geojson`. Throws a descriptive error if any
 * dataset fails to load so callers can show a clean error state.
 */
export async function analyzeArea(
  aoi: Feature<Polygon>,
): Promise<SpatialAnalysisResult> {
  const [parcels, zoning, constraints, transit, development] = await Promise.all(
    [
      loadCollection(LAYER_BY_ID.parcels.sourceUrl, 'parcels'),
      loadCollection(LAYER_BY_ID.zoning.sourceUrl, 'zoning'),
      loadCollection(LAYER_BY_ID.constraints.sourceUrl, 'constraints'),
      loadCollection(LAYER_BY_ID.transit.sourceUrl, 'transit'),
      loadCollection(
        LAYER_BY_ID.developmentActivity.sourceUrl,
        'development activity',
      ),
    ],
  );

  const areaSqm = turfArea(aoi);
  const parcelSummary = analyzeParcels(parcels, aoi);
  const devActivity = analyzeDevelopmentActivity(development, aoi);

  return {
    areaSqm: Math.round(areaSqm),
    areaHectares: Math.round((areaSqm / 10000) * 100) / 100,
    parcelCount: parcelSummary.parcelCount,
    averageDevelopmentScore: parcelSummary.averageDevelopmentScore,
    zoningBreakdown: analyzeZoning(zoning, aoi),
    intersectingConstraints: analyzeConstraints(constraints, aoi),
    nearbyTransit: analyzeTransit(transit, aoi),
    developmentActivityCount: devActivity.count,
    developmentActivityByStatus: devActivity.byStatus,
  };
}
