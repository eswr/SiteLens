/** Minimal GeoJSON Polygon geometry (kept dependency-free on purpose). */
export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

/** Request body for `POST /api/analyze-area`. */
export interface AnalyzeAreaRequest {
  geometry: GeoJsonPolygon;
}

/**
 * Response for `POST /api/analyze-area`.
 *
 * Placeholder for Step 8 — backend spatial analysis (PostGIS) arrives later.
 */
export interface AnalyzeAreaResponse {
  status: 'not_implemented';
  message: string;
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
 * Placeholder for Step 8 — backend summary wiring arrives later.
 */
export interface PlanningSummaryResponse {
  status: 'not_implemented';
  message: string;
}
