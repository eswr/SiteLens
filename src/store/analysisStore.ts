import { create } from 'zustand';
import type {
  AreaOfInterest,
  AreaPoint,
  SpatialAnalysisResult,
} from '../types/analysis';
import { analyzeArea, pointsToAreaOfInterest } from '../utils/spatialAnalysis';

/** Minimum vertices required to close a polygon. */
export const MIN_AOI_POINTS = 3;

interface AnalysisState {
  isDrawing: boolean;
  draftPoints: AreaPoint[];
  areaOfInterest: AreaOfInterest | null;
  analysisResult: SpatialAnalysisResult | null;
  isAnalyzing: boolean;
  error: string | null;

  startDrawing: () => void;
  addDraftPoint: (point: AreaPoint) => void;
  undoLastPoint: () => void;
  /** Close the draft polygon (needs ≥ 3 points) and run analysis. */
  completeDrawing: () => Promise<void>;
  cancelDrawing: () => void;
  clearAnalysis: () => void;
  setAnalysisResult: (result: SpatialAnalysisResult | null) => void;
  setError: (error: string | null) => void;
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  isDrawing: false,
  draftPoints: [],
  areaOfInterest: null,
  analysisResult: null,
  isAnalyzing: false,
  error: null,

  startDrawing: () =>
    set({
      isDrawing: true,
      draftPoints: [],
      areaOfInterest: null,
      analysisResult: null,
      error: null,
    }),

  addDraftPoint: (point) =>
    set((state) => ({ draftPoints: [...state.draftPoints, point] })),

  undoLastPoint: () =>
    set((state) => ({ draftPoints: state.draftPoints.slice(0, -1) })),

  completeDrawing: async () => {
    const { draftPoints } = get();
    if (draftPoints.length < MIN_AOI_POINTS) {
      set({ error: `Add at least ${MIN_AOI_POINTS} points to complete an area.` });
      return;
    }

    const areaOfInterest = pointsToAreaOfInterest(draftPoints);
    set({
      areaOfInterest,
      isDrawing: false,
      draftPoints: [],
      analysisResult: null,
      error: null,
      isAnalyzing: true,
    });

    try {
      const result = await analyzeArea(areaOfInterest.polygon);
      set({ analysisResult: result, isAnalyzing: false });
    } catch (error) {
      set({
        isAnalyzing: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to analyze the selected area.',
      });
    }
  },

  cancelDrawing: () => set({ isDrawing: false, draftPoints: [], error: null }),

  clearAnalysis: () =>
    set({
      isDrawing: false,
      draftPoints: [],
      areaOfInterest: null,
      analysisResult: null,
      isAnalyzing: false,
      error: null,
    }),

  setAnalysisResult: (result) => set({ analysisResult: result }),
  setError: (error) => set({ error }),
}));
