import { apiPostWithMeta, type CacheStatus } from './client';
import type { PlanningSummary } from '../types/aiSummary';
import type { SpatialAnalysisResult } from '../types/analysis';

export type PlanningSummarySourceEngine =
  | 'postgis'
  | 'turf-local'
  | 'turf-fallback';

export interface PlanningSummaryApiInput {
  analysisResult: SpatialAnalysisResult;
  context?: {
    label?: string;
    sourceEngine?: PlanningSummarySourceEngine;
  };
}

export interface PlanningSummaryApiResult {
  summary: PlanningSummary;
  engine: 'deterministic-backend';
  meta?: {
    cache?: CacheStatus;
    computedAt?: string;
  };
}

interface PlanningSummaryData {
  summary: PlanningSummary;
  engine: 'deterministic-backend';
}

/** Call the backend deterministic planning summary service. */
export async function generatePlanningSummaryWithApi(
  input: PlanningSummaryApiInput,
): Promise<PlanningSummaryApiResult> {
  const { data, meta } = await apiPostWithMeta<PlanningSummaryData>(
    '/api/planning-summary',
    input,
  );
  return {
    summary: data.summary,
    engine: data.engine,
    meta: { cache: meta?.cache, computedAt: meta?.computedAt },
  };
}
