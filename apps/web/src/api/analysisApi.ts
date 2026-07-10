import type { AreaOfInterest, SpatialAnalysisResult } from '../types/analysis';
import { apiPost } from './client';

interface AnalyzeAreaApiResponse {
  result: SpatialAnalysisResult;
  engine: 'postgis';
}

/**
 * Run AOI spatial analysis via the backend PostGIS API.
 *
 * Sends the drawn polygon geometry to `POST /api/analyze-area` and returns the
 * `SpatialAnalysisResult`. Throws (via `apiPost`) if the API is unreachable or
 * returns an error, so callers can fall back to local Turf analysis.
 */
export async function analyzeAreaWithApi(
  areaOfInterest: AreaOfInterest,
): Promise<SpatialAnalysisResult> {
  const response = await apiPost<AnalyzeAreaApiResponse>('/api/analyze-area', {
    geometry: areaOfInterest.polygon.geometry,
  });
  return response.result;
}
