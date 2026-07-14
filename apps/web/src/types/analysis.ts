/**
 * Types for the Area of Interest (AOI) spatial-analysis workflow.
 *
 * Everything here is frontend-only: an AOI is drawn on the map and analyzed
 * against the mock planning GeoJSON with Turf.js.
 */
import type { Feature, Polygon } from 'geojson';

/** A single drawn vertex, in WGS84 degrees. */
export interface AreaPoint {
  lng: number;
  lat: number;
}

/** A completed area of interest: its vertices and the closed polygon. */
export interface AreaOfInterest {
  points: AreaPoint[];
  polygon: Feature<Polygon>;
}

/** One row of the zoning breakdown (zones intersecting the AOI). */
export interface ZoningBreakdownItem {
  zoneCode: string;
  zoneName: string;
  count: number;
}

/** A planning constraint that intersects the AOI. */
export interface ConstraintIntersection {
  id: string;
  constraintType: string;
  riskLevel: string;
  description: string;
}

/** A transit stop within the search radius of the AOI centroid. */
export interface NearbyTransitItem {
  id: string;
  name: string;
  mode: string;
  distanceMeters: number;
}

/** Count of development-activity points by status. */
export interface DevelopmentActivitySummary {
  status: string;
  count: number;
}

/** Parcel-focused rollup used while assembling the result. */
export interface ParcelAnalysisSummary {
  parcelCount: number;
  averageDevelopmentScore: number | null;
  totalAreaSqm: number;
}

/** The full result of analyzing an AOI against the planning layers. */
export interface SpatialAnalysisResult {
  areaSqm: number;
  areaHectares: number;
  parcelCount: number;
  averageDevelopmentScore: number | null;
  zoningBreakdown: ZoningBreakdownItem[];
  intersectingConstraints: ConstraintIntersection[];
  nearbyTransit: NearbyTransitItem[];
  developmentActivityCount: number;
  developmentActivityByStatus: DevelopmentActivitySummary[];
  planningContextId?: string;
}
