/** Minimal GeoJSON polygon geometries (kept dependency-free on purpose). */
export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface GeoJsonMultiPolygon {
  type: 'MultiPolygon';
  coordinates: number[][][][];
}

/** Request body for `POST /api/analyze-area`. */
export interface AnalyzeAreaRequest {
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: unknown;
  };
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
}

/** Response body for `POST /api/analyze-area`. */
export interface AnalyzeAreaResponse {
  result: SpatialAnalysisResult;
  engine: 'postgis';
}

/** Request body for `POST /api/planning-summary`. */
export interface PlanningSummaryRequest {
  /** Optional identifier of a previously analyzed area. */
  areaId?: string;
  /** Optional metrics the client already computed. */
  metrics?: Record<string, unknown>;
}

/**
 * Response for `POST /api/planning-summary`.
 *
 * Placeholder — backend summary wiring arrives in a later step.
 */
export interface PlanningSummaryResponse {
  status: 'not_implemented';
  message: string;
}
