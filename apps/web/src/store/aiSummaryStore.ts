import { create } from 'zustand';
import type { SpatialAnalysisResult } from '../types/analysis';
import type { PlanningSummary } from '../types/aiSummary';
import { generateMockPlanningSummary } from '../utils/mockPlanningSummary';
import { ApiError, isApiConfigured, type CacheStatus } from '../api/client';
import {
  generatePlanningSummaryWithApi,
  type PlanningSummarySourceEngine,
} from '../api/planningSummaryApi';

/** Simulated "thinking" delay for local generation only (feels realistic). */
const GENERATION_DELAY_MS = 550;

const BACKEND_GATED_WARNING =
  'Backend planning summary requires Pro or Enterprise; using local demo summary.';
const BACKEND_UNAVAILABLE_WARNING =
  'Backend planning summary unavailable; using local demo summary.';

/** Which generator produced the current summary. */
export type SummaryEngine =
  | 'deterministic-backend'
  | 'local'
  | 'local-fallback'
  | null;

interface AiSummaryState {
  summary: PlanningSummary | null;
  isGenerating: boolean;
  error: string | null;
  summaryEngine: SummaryEngine;
  summaryCacheStatus: CacheStatus | null;
  summaryComputedAt: string | null;
  summaryWarning: string | null;
  /**
   * Generate a summary from an analysis result. Uses the backend
   * (`/api/planning-summary`) when the API is configured, falling back to the
   * local deterministic generator on 403 / failure / no API.
   */
  generateSummary: (
    analysisResult: SpatialAnalysisResult | null,
    sourceEngine?: PlanningSummarySourceEngine,
  ) => Promise<void>;
  clearSummary: () => void;
}

const CLEARED = {
  summary: null,
  isGenerating: false,
  error: null,
  summaryEngine: null,
  summaryCacheStatus: null,
  summaryComputedAt: null,
  summaryWarning: null,
} as const;

export const useAiSummaryStore = create<AiSummaryState>((set) => ({
  ...CLEARED,

  generateSummary: async (analysisResult, sourceEngine) => {
    if (!analysisResult) {
      set({
        error:
          'Draw and analyze an area of interest before generating a summary.',
      });
      return;
    }

    set({ isGenerating: true, error: null, summaryWarning: null });

    // Backend-owned generation when the API is configured.
    if (isApiConfigured()) {
      try {
        const res = await generatePlanningSummaryWithApi({
          analysisResult,
          context: sourceEngine ? { sourceEngine } : undefined,
        });
        set({
          summary: res.summary,
          isGenerating: false,
          summaryEngine: 'deterministic-backend',
          summaryCacheStatus: res.meta?.cache ?? null,
          summaryComputedAt: res.meta?.computedAt ?? res.summary.generatedAt,
          summaryWarning: null,
        });
        return;
      } catch (apiError) {
        const forbidden =
          apiError instanceof ApiError && apiError.status === 403;
        const summary = generateMockPlanningSummary(analysisResult);
        set({
          summary,
          isGenerating: false,
          summaryEngine: 'local-fallback',
          summaryCacheStatus: null,
          summaryComputedAt: summary.generatedAt,
          summaryWarning: forbidden
            ? BACKEND_GATED_WARNING
            : BACKEND_UNAVAILABLE_WARNING,
        });
        return;
      }
    }

    // Fully local mode (no API configured): simulated delay + local generator.
    await new Promise((resolve) => setTimeout(resolve, GENERATION_DELAY_MS));
    try {
      const summary = generateMockPlanningSummary(analysisResult);
      set({
        summary,
        isGenerating: false,
        summaryEngine: 'local',
        summaryCacheStatus: null,
        summaryComputedAt: summary.generatedAt,
        summaryWarning: null,
      });
    } catch (error) {
      set({
        isGenerating: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to generate the planning summary.',
      });
    }
  },

  clearSummary: () => set({ ...CLEARED }),
}));
