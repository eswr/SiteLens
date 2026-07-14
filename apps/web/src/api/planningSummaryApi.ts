import type { PlanningContextSource } from '@sitelens/shared';
import { apiPostWithMeta, type CacheStatus } from './client';
import type { PlanningSummary } from '../types/aiSummary';
import type { SpatialAnalysisResult } from '../types/analysis';
import {
  getSelectedPlanningContextId,
  usePlanningContextStore,
} from '../store/planningContextStore';

export type PlanningSummarySourceEngine =
  | 'postgis'
  | 'turf-local'
  | 'turf-fallback';

export interface PlanningSummaryApiInput {
  analysisResult: SpatialAnalysisResult;
  context?: {
    label?: string;
    sourceEngine?: PlanningSummarySourceEngine;
    planningContextId?: string;
    planningContextSource?: PlanningContextSource;
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
  const selected = usePlanningContextStore.getState().selectedContext;
  const planningContextId =
    input.context?.planningContextId ?? getSelectedPlanningContextId();
  const payload: PlanningSummaryApiInput = {
    analysisResult: input.analysisResult,
    context: {
      ...input.context,
      planningContextId,
      label: input.context?.label ?? selected?.label,
      planningContextSource:
        input.context?.planningContextSource ?? selected?.source,
    },
  };
  const { data, meta } = await apiPostWithMeta<PlanningSummaryData>(
    '/api/planning-summary',
    payload,
  );
  return {
    summary: data.summary,
    engine: data.engine,
    meta: { cache: meta?.cache, computedAt: meta?.computedAt },
  };
}
