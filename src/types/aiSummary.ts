/**
 * Types for the deterministic, on-device mock "AI planning summary".
 *
 * No external LLM is used; a summary is generated locally from the spatial
 * analysis metrics. These types describe that generated structure.
 */

export type PlanningSummarySeverity = 'positive' | 'neutral' | 'warning' | 'risk';

export interface PlanningSummarySection {
  title: string;
  body: string;
  severity?: PlanningSummarySeverity;
}

export interface PlanningSummary {
  generatedAt: string;
  siteContext: string;
  executiveSummary: string;
  sections: PlanningSummarySection[];
  recommendedNextChecks: string[];
  dataCaveats: string[];
  sourceMetrics: {
    areaHectares: number;
    parcelCount: number;
    averageDevelopmentScore: number | null;
    constraintCount: number;
    nearbyTransitCount: number;
    developmentActivityCount: number;
  };
}
