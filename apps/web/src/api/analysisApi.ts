import type { AreaOfInterest, SpatialAnalysisResult } from '../types/analysis';
import { apiPostWithMeta, type CacheStatus } from './client';

interface AnalyzeAreaApiData {
  result: SpatialAnalysisResult;
  engine: 'postgis';
}

export interface AnalyzeAreaApiResult {
  result: SpatialAnalysisResult;
  engine: 'postgis';
  cache?: CacheStatus;
  computedAt?: string;
}

/**
 * Run AOI spatial analysis via the backend PostGIS API.
 *
 * Sends the drawn polygon geometry to `POST /api/analyze-area` and returns the
 * result plus cache metadata. Throws (via `apiPostWithMeta`) if the API is
 * unreachable or errors, so callers can fall back to local Turf analysis.
 */
export async function analyzeAreaWithApi(
  areaOfInterest: AreaOfInterest,
): Promise<AnalyzeAreaApiResult> {
  const { data, meta } = await apiPostWithMeta<AnalyzeAreaApiData>(
    '/api/analyze-area',
    { geometry: areaOfInterest.polygon.geometry },
  );
  return {
    result: data.result,
    engine: data.engine,
    cache: meta?.cache,
    computedAt: meta?.computedAt,
  };
}
