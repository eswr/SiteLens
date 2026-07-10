import { create } from 'zustand';
import type { SpatialAnalysisResult } from '../types/analysis';
import type { PlanningSummary } from '../types/aiSummary';
import { generateMockPlanningSummary } from '../utils/mockPlanningSummary';

/** Simulated "thinking" delay to make generation feel realistic (400–700ms). */
const GENERATION_DELAY_MS = 550;

interface AiSummaryState {
  summary: PlanningSummary | null;
  isGenerating: boolean;
  error: string | null;
  /** Generate a summary from an analysis result (deterministic, on-device). */
  generateSummary: (
    analysisResult: SpatialAnalysisResult | null,
  ) => Promise<void>;
  clearSummary: () => void;
}

export const useAiSummaryStore = create<AiSummaryState>((set) => ({
  summary: null,
  isGenerating: false,
  error: null,

  generateSummary: async (analysisResult) => {
    if (!analysisResult) {
      set({
        error: 'Draw and analyze an area of interest before generating a summary.',
      });
      return;
    }

    set({ isGenerating: true, error: null });
    await new Promise((resolve) => setTimeout(resolve, GENERATION_DELAY_MS));

    try {
      const summary = generateMockPlanningSummary(analysisResult);
      set({ summary, isGenerating: false });
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

  clearSummary: () => set({ summary: null, isGenerating: false, error: null }),
}));
