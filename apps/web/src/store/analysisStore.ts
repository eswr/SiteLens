import { create } from 'zustand';
import type {
  AreaOfInterest,
  AreaPoint,
  SpatialAnalysisResult,
} from '../types/analysis';
import { analyzeArea, pointsToAreaOfInterest } from '../utils/spatialAnalysis';
import { analyzeAreaWithApi } from '../api/analysisApi';
import { isApiConfigured } from '../api/client';
import { useAiSummaryStore } from './aiSummaryStore';
import { useMapStore } from './mapStore';

/** Minimum vertices required to close a polygon. */
export const MIN_AOI_POINTS = 3;

/** Which engine produced the current analysis result. */
export type AnalysisEngine = 'postgis' | 'turf-local' | 'turf-fallback' | null;

const FALLBACK_WARNING =
  'Backend analysis unavailable; using local Turf.js demo analysis.';

interface AnalysisState {
  isDrawing: boolean;
  draftPoints: AreaPoint[];
  areaOfInterest: AreaOfInterest | null;
  analysisResult: SpatialAnalysisResult | null;
  isAnalyzing: boolean;
  error: string | null;
  /** Which engine produced `analysisResult`. */
  analysisEngine: AnalysisEngine;
  /** Non-fatal warning (e.g. when the backend was unavailable). */
  analysisWarning?: string;

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
  analysisEngine: null,
  analysisWarning: undefined,

  startDrawing: () => {
    // A new drawing invalidates any previous AI summary.
    useAiSummaryStore.getState().clearSummary();
    set({
      isDrawing: true,
      draftPoints: [],
      areaOfInterest: null,
      analysisResult: null,
      error: null,
      analysisEngine: null,
      analysisWarning: undefined,
    });
  },

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
      analysisEngine: null,
      analysisWarning: undefined,
    });

    try {
      if (isApiConfigured()) {
        // Prefer the backend PostGIS analysis; fall back to local Turf.
        try {
          const result = await analyzeAreaWithApi(areaOfInterest);
          set({
            analysisResult: result,
            isAnalyzing: false,
            analysisEngine: 'postgis',
            analysisWarning: undefined,
          });
        } catch {
          const result = await analyzeArea(areaOfInterest.polygon);
          set({
            analysisResult: result,
            isAnalyzing: false,
            analysisEngine: 'turf-fallback',
            analysisWarning: FALLBACK_WARNING,
          });
        }
      } else {
        const result = await analyzeArea(areaOfInterest.polygon);
        set({
          analysisResult: result,
          isAnalyzing: false,
          analysisEngine: 'turf-local',
          analysisWarning: undefined,
        });
      }
    } catch (error) {
      set({
        isAnalyzing: false,
        analysisEngine: null,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to analyze the selected area.',
      });
    }
  },

  cancelDrawing: () => set({ isDrawing: false, draftPoints: [], error: null }),

  clearAnalysis: () => {
    // Clearing the AOI also clears the derived AI summary and any selection.
    useAiSummaryStore.getState().clearSummary();
    useMapStore.getState().setSelectedFeature(null);
    set({
      isDrawing: false,
      draftPoints: [],
      areaOfInterest: null,
      analysisResult: null,
      isAnalyzing: false,
      error: null,
      analysisEngine: null,
      analysisWarning: undefined,
    });
  },

  setAnalysisResult: (result) => set({ analysisResult: result }),
  setError: (error) => set({ error }),
}));
