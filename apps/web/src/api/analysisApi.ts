import type { AreaOfInterest, SpatialAnalysisResult } from '../types/analysis';
import { apiPostWithMeta, type CacheStatus } from './client';
import { getSelectedPlanningContextId } from '../store/planningContextStore';

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
 * Sends the drawn polygon geometry to `POST /api/analyze-area` scoped to the
 * selected planning context. Throws if the API is unreachable or errors.
 */
export async function analyzeAreaWithApi(
  areaOfInterest: AreaOfInterest,
): Promise<AnalyzeAreaApiResult> {
  const planningContextId = getSelectedPlanningContextId();
  const { data, meta } = await apiPostWithMeta<AnalyzeAreaApiData>(
    '/api/analyze-area',
    {
      geometry: areaOfInterest.polygon.geometry,
      planningContextId,
    },
  );
  return {
    result: data.result,
    engine: data.engine,
    cache: meta?.cache,
    computedAt: meta?.computedAt,
  };
}
