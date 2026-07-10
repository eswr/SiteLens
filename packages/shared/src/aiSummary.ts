import type { SpatialAnalysisResult } from './analysis';

/**
 * Types for the deterministic planning summary.
 *
 * No external LLM is used: the summary is generated deterministically from the
 * spatial analysis metrics. In Step 14 generation is owned by the backend
 * (`POST /api/planning-summary`), with a frontend local fallback.
 */

export type PlanningSummarySeverity =
  | 'positive'
  | 'neutral'
  | 'warning'
  | 'risk';

export interface PlanningSummarySection {
  title: string;
  body: string;
  severity?: PlanningSummarySeverity;
}

export interface PlanningSummarySourceMetrics {
  areaHectares: number;
  parcelCount: number;
  averageDevelopmentScore: number | null;
  constraintCount: number;
  nearbyTransitCount: number;
  developmentActivityCount: number;
}

export interface PlanningSummary {
  generatedAt: string;
  siteContext: string;
  executiveSummary: string;
  sections: PlanningSummarySection[];
  recommendedNextChecks: string[];
  dataCaveats: string[];
  sourceMetrics: PlanningSummarySourceMetrics;
}

export type PlanningSummarySourceEngine =
  | 'postgis'
  | 'turf-local'
  | 'turf-fallback';

/** Request body for `POST /api/planning-summary`. */
export interface PlanningSummaryRequest {
  analysisResult: SpatialAnalysisResult;
  context?: {
    label?: string;
    sourceEngine?: PlanningSummarySourceEngine;
  };
}

/** Response body for `POST /api/planning-summary`. */
export interface PlanningSummaryResponse {
  summary: PlanningSummary;
  engine: 'deterministic-backend';
}
