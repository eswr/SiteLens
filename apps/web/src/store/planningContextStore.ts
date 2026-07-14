import { create } from 'zustand';
import type {
  BuildPlanningContextResponse,
  PlanningContext,
  PlanningContextFeatureCounts,
} from '@sitelens/shared';
import { LOCAL_DEMO_SYDNEY_CONTEXT_ID } from '@sitelens/shared';
import {
  buildPlanningContext,
  getPlanningContextDetail,
  listPlanningContexts,
} from '../api/planningContextsApi';
import type { PlaceSearchResult } from '../api/geocodingApi';
import { ApiError, isApiConfigured } from '../api/client';
import { useMapStore } from './mapStore';
import { useAnalysisStore } from './analysisStore';
import { useAiSummaryStore } from './aiSummaryStore';
import { useSearchStore } from './searchStore';

const STORAGE_KEY = 'sitelens:selected-planning-context:v1';

export const EMPTY_BUILD_NOTICE =
  'The context was built, but no usable planning features were found in this area. Try a different place or a smaller area.';

function isEmptyBuildCounts(
  counts: BuildPlanningContextResponse['counts'],
): boolean {
  return (
    counts.sites +
      counts.landUse +
      counts.constraints +
      counts.transit +
      counts.developmentActivity ===
    0
  );
}

const SYDNEY_FALLBACK: PlanningContext = {
  id: LOCAL_DEMO_SYDNEY_CONTEXT_ID,
  label: 'Sydney Demo',
  source: 'local-demo',
  status: 'ready',
  center: [151.2093, -33.8688],
  bbox: [151.199, -33.876, 151.22, -33.86],
  disclaimer:
    'Sydney Demo is bundled synthetic portfolio data. It is not official planning or cadastral data.',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

function readStoredId(): string {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value && value.trim().length > 0
      ? value.trim()
      : LOCAL_DEMO_SYDNEY_CONTEXT_ID;
  } catch {
    return LOCAL_DEMO_SYDNEY_CONTEXT_ID;
  }
}

function persistId(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Ignore storage errors.
  }
}

function clearTransientUi(): void {
  useMapStore.getState().setSelectedFeature(null);
  useAnalysisStore.getState().clearAnalysis();
  useAiSummaryStore.getState().clearSummary();
  useSearchStore.getState().clearSearch();
  useSearchStore.getState().invalidateIndex();
}

async function refreshSelectedDetail(contextId: string): Promise<{
  context: PlanningContext;
  counts: PlanningContextFeatureCounts | null;
}> {
  if (!isApiConfigured()) {
    return { context: SYDNEY_FALLBACK, counts: null };
  }
  try {
    const detail = await getPlanningContextDetail(contextId);
    return { context: detail.context, counts: detail.counts };
  } catch {
    const listed = usePlanningContextStore
      .getState()
      .contexts.find((c) => c.id === contextId);
    return { context: listed ?? SYDNEY_FALLBACK, counts: null };
  }
}

interface PlanningContextState {
  contexts: PlanningContext[];
  selectedContextId: string;
  selectedContext: PlanningContext | null;
  selectedCounts: PlanningContextFeatureCounts | null;
  countsLoading: boolean;
  /** Set only for the most recent build in this session. */
  lastBuildReused: boolean | null;
  isLoading: boolean;
  isBuilding: boolean;
  buildError: string | null;
  /** Immediate post-build notice (e.g. empty feature counts). */
  buildNotice: string | null;
  dataRevision: number;
  loadContexts: () => Promise<void>;
  selectContext: (contextId: string) => void;
  buildContextFromSelectedPlace: (
    place: PlaceSearchResult,
  ) => Promise<void>;
  clearBuildError: () => void;
  clearBuildNotice: () => void;
}

export const usePlanningContextStore = create<PlanningContextState>(
  (set, get) => ({
    contexts: [SYDNEY_FALLBACK],
    selectedContextId: readStoredId(),
    selectedContext: SYDNEY_FALLBACK,
    selectedCounts: null,
    countsLoading: false,
    lastBuildReused: null,
    isLoading: false,
    isBuilding: false,
    buildError: null,
    buildNotice: null,
    dataRevision: 0,

    loadContexts: async () => {
      if (!isApiConfigured()) {
        set({
          contexts: [SYDNEY_FALLBACK],
          selectedContextId: LOCAL_DEMO_SYDNEY_CONTEXT_ID,
          selectedContext: SYDNEY_FALLBACK,
          selectedCounts: null,
          countsLoading: false,
          lastBuildReused: null,
        });
        return;
      }
      set({ isLoading: true, countsLoading: true });
      try {
        const contexts = await listPlanningContexts();
        const list = contexts.length > 0 ? contexts : [SYDNEY_FALLBACK];
        const preferred = get().selectedContextId;
        const ready = (c: PlanningContext) => c.status === 'ready';
        const selected =
          list.find((c) => c.id === preferred && ready(c)) ??
          list.find((c) => c.id === LOCAL_DEMO_SYDNEY_CONTEXT_ID && ready(c)) ??
          list.find(ready) ??
          list[0];
        persistId(selected.id);
        set({
          contexts: list,
          selectedContextId: selected.id,
          selectedContext: selected,
          isLoading: false,
          lastBuildReused: null,
        });
        const selectedId = selected.id;
        const detail = await refreshSelectedDetail(selectedId);
        if (get().selectedContextId !== selectedId) {
          return;
        }
        set({
          selectedContext: detail.context,
          selectedCounts: detail.counts,
          countsLoading: false,
          contexts: list.map((c) =>
            c.id === detail.context.id ? detail.context : c,
          ),
        });
      } catch {
        set({
          contexts: [SYDNEY_FALLBACK],
          selectedContextId: LOCAL_DEMO_SYDNEY_CONTEXT_ID,
          selectedContext: SYDNEY_FALLBACK,
          selectedCounts: null,
          countsLoading: false,
          isLoading: false,
          lastBuildReused: null,
        });
      }
    },

    selectContext: (contextId) => {
      const context =
        get().contexts.find((c) => c.id === contextId) ?? SYDNEY_FALLBACK;
      if (context.status !== 'ready') {
        set({
          buildError: `Planning context is ${context.status}.`,
        });
        return;
      }
      persistId(context.id);
      clearTransientUi();
      useMapStore.getState().requestFlyToFeature({
        center: context.center,
        bbox: context.bbox,
        geometryType: 'Polygon',
      });
      set((state) => ({
        selectedContextId: context.id,
        selectedContext: context,
        selectedCounts: null,
        countsLoading: true,
        lastBuildReused: null,
        dataRevision: state.dataRevision + 1,
        buildError: null,
      }));
      void refreshSelectedDetail(context.id).then((detail) => {
        if (get().selectedContextId !== context.id) {
          return;
        }
        set({
          selectedContext: detail.context,
          selectedCounts: detail.counts,
          countsLoading: false,
          contexts: get().contexts.map((c) =>
            c.id === detail.context.id ? detail.context : c,
          ),
        });
      });
    },

    buildContextFromSelectedPlace: async (place) => {
      if (!isApiConfigured()) {
        set({
          buildError:
            'External planning contexts require backend API mode.',
        });
        return;
      }
      set({
        isBuilding: true,
        buildError: null,
        buildNotice: null,
        lastBuildReused: null,
      });
      try {
        const result = await buildPlanningContext(place);
        const contexts = await listPlanningContexts().catch(
          () => get().contexts,
        );
        const merged = contexts.some((c) => c.id === result.context.id)
          ? contexts.map((c) =>
              c.id === result.context.id ? result.context : c,
            )
          : [result.context, ...contexts];
        persistId(result.context.id);
        clearTransientUi();
        // Keep place selected so build UI stays visible, but fly to context.
        useMapStore.getState().requestFlyToFeature({
          center: result.context.center,
          bbox: result.context.bbox,
          geometryType: 'Polygon',
        });
        set((state) => ({
          contexts: merged,
          selectedContextId: result.context.id,
          selectedContext: result.context,
          selectedCounts: result.counts,
          countsLoading: false,
          lastBuildReused: result.reused === true,
          isBuilding: false,
          buildNotice: isEmptyBuildCounts(result.counts)
            ? EMPTY_BUILD_NOTICE
            : null,
          dataRevision: state.dataRevision + 1,
        }));
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : 'External data provider unavailable or bbox too large. Try a smaller city/area or use Sydney Demo.';
        set({
          isBuilding: false,
          buildError: message,
          buildNotice: null,
        });
      }
    },

    clearBuildError: () => set({ buildError: null }),
    clearBuildNotice: () => set({ buildNotice: null }),
  }),
);

/** Convenience accessor used by API clients. */
export function getSelectedPlanningContextId(): string {
  return (
    usePlanningContextStore.getState().selectedContextId ||
    LOCAL_DEMO_SYDNEY_CONTEXT_ID
  );
}
