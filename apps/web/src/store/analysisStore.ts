import { create } from 'zustand';
import type {
  AreaOfInterest,
  AreaPoint,
  SpatialAnalysisResult,
} from '../types/analysis';
import { LOCAL_DEMO_SYDNEY_CONTEXT_ID } from '@sitelens/shared';
import { analyzeArea, pointsToAreaOfInterest } from '../utils/spatialAnalysis';
import { analyzeAreaWithApi } from '../api/analysisApi';
import { ApiError, isApiConfigured, type CacheStatus } from '../api/client';
import { useAiSummaryStore } from './aiSummaryStore';
import { useMapStore } from './mapStore';
import { getSelectedPlanningContextId } from './planningContextStore';

/** Minimum vertices required to close a polygon. */
export const MIN_AOI_POINTS = 3;

/** Which engine produced the current analysis result. */
export type AnalysisEngine = 'postgis' | 'turf-local' | 'turf-fallback' | null;

const FALLBACK_WARNING =
  'Backend analysis unavailable; using local Turf.js demo analysis.';
const ENTITLEMENT_WARNING =
  'Backend PostGIS analysis is gated by the Pro plan; using local demo analysis.';

interface AnalysisState {
  isDrawing: boolean;
  draftPoints: AreaPoint[];
  areaOfInterest: AreaOfInterest | null;
  analysisResult: SpatialAnalysisResult | null;
  isAnalyzing: boolean;
  error: string | null;
  /** Which engine produced `analysisResult`. */
  analysisEngine: AnalysisEngine;
  /** Cache outcome reported by the backend (when engine is `postgis`). */
  analysisCacheStatus: CacheStatus | null;
  /** When the result was computed (ISO string), when known. */
  analysisComputedAt: string | null;
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
  analysisCacheStatus: null,
  analysisComputedAt: null,
  analysisWarning: undefined,

  startDrawing: () => {
    // A new drawing invalidates any previous AI summary and feature selection
    // so the Details panel can show AOI analysis when drawing completes.
    useAiSummaryStore.getState().clearSummary();
    useMapStore.getState().setSelectedFeature(null);
    set({
      isDrawing: true,
      draftPoints: [],
      areaOfInterest: null,
      analysisResult: null,
      error: null,
      analysisEngine: null,
      analysisCacheStatus: null,
      analysisComputedAt: null,
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
    // Keep Details on the AOI panel (not a previously selected feature).
    useMapStore.getState().setSelectedFeature(null);
    set({
      areaOfInterest,
      isDrawing: false,
      draftPoints: [],
      analysisResult: null,
      error: null,
      isAnalyzing: true,
      analysisEngine: null,
      analysisCacheStatus: null,
      analysisComputedAt: null,
      analysisWarning: undefined,
    });

    try {
      const planningContextId = getSelectedPlanningContextId();
      const canUseLocalTurf =
        planningContextId === LOCAL_DEMO_SYDNEY_CONTEXT_ID;

      if (isApiConfigured()) {
        // Prefer the backend PostGIS analysis; Turf fallback only for Sydney demo.
        try {
          const api = await analyzeAreaWithApi(areaOfInterest);
          set({
            analysisResult: api.result,
            isAnalyzing: false,
            analysisEngine: 'postgis',
            analysisCacheStatus: api.cache ?? null,
            analysisComputedAt: api.computedAt ?? null,
            analysisWarning: undefined,
          });
        } catch (apiError) {
          if (!canUseLocalTurf) {
            throw apiError instanceof Error
              ? apiError
              : new Error(
                  'External planning context analysis requires the backend API.',
                );
          }
          const forbidden =
            apiError instanceof ApiError && apiError.status === 403;
          const result = await analyzeArea(areaOfInterest.polygon);
          set({
            analysisResult: {
              ...result,
              planningContextId: LOCAL_DEMO_SYDNEY_CONTEXT_ID,
            },
            isAnalyzing: false,
            analysisEngine: 'turf-fallback',
            analysisCacheStatus: 'none',
            analysisComputedAt: new Date().toISOString(),
            analysisWarning: forbidden ? ENTITLEMENT_WARNING : FALLBACK_WARNING,
          });
        }
      } else if (canUseLocalTurf) {
        const result = await analyzeArea(areaOfInterest.polygon);
        set({
          analysisResult: {
            ...result,
            planningContextId: LOCAL_DEMO_SYDNEY_CONTEXT_ID,
          },
          isAnalyzing: false,
          analysisEngine: 'turf-local',
          analysisCacheStatus: 'none',
          analysisComputedAt: new Date().toISOString(),
          analysisWarning: undefined,
        });
      } else {
        throw new Error(
          'External planning contexts require backend API mode for AOI analysis.',
        );
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
      analysisCacheStatus: null,
      analysisComputedAt: null,
      analysisWarning: undefined,
    });
  },

  setAnalysisResult: (result) => set({ analysisResult: result }),
  setError: (error) => set({ error }),
}));
