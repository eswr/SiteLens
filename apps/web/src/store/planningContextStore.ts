import { create } from 'zustand';
import type {
  PlanningContext,
  PlanningContextFeatureCounts,
} from '@sitelens/shared';
import {
  EXTERNAL_OSM_DISCLAIMER,
  LOCAL_DEMO_SYDNEY_CONTEXT_ID,
} from '@sitelens/shared';
import {
  buildPlanningContext,
  getPlanningContextBuildJob,
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
const BUILD_POLL_MS = 1000;
const BUILD_POLL_MAX_MS = 120_000;

export const EMPTY_BUILD_NOTICE =
  'The context was built, but no usable planning features were found in this area. Try a different place or a smaller area.';

function isEmptyBuildCounts(counts: PlanningContextFeatureCounts): boolean {
  return (
    counts.sites +
      counts.landUse +
      counts.constraints +
      counts.transit +
      counts.developmentActivity ===
    0
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function optimisticBuildingContext(
  contextId: string,
  place: PlaceSearchResult,
): PlanningContext {
  const now = new Date().toISOString();
  const labelBase =
    place.label.split(',')[0]?.trim() ||
    place.displayName.split(',')[0]?.trim() ||
    'Place';
  return {
    id: contextId,
    label: `${labelBase} external context`,
    source: 'external-osm',
    status: 'building',
    center: [place.longitude, place.latitude],
    bbox: place.boundingBox
      ? [
          place.boundingBox[2],
          place.boundingBox[0],
          place.boundingBox[3],
          place.boundingBox[1],
        ]
      : [
          place.longitude - 0.02,
          place.latitude - 0.02,
          place.longitude + 0.02,
          place.latitude + 0.02,
        ],
    place: {
      id: place.id,
      label: place.label,
      displayName: place.displayName,
      provider: place.provider,
    },
    disclaimer: EXTERNAL_OSM_DISCLAIMER,
    createdAt: now,
    updatedAt: now,
  };
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
  /** Job id for the in-flight build; stale polls must not overwrite selection. */
  activeBuildJobId: string | null;
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
    activeBuildJobId: null,
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
        activeBuildJobId: null,
        isBuilding: false,
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

      const prior = {
        selectedContextId: get().selectedContextId,
        selectedContext: get().selectedContext,
        selectedCounts: get().selectedCounts,
      };

      set({
        isBuilding: true,
        buildError: null,
        buildNotice: null,
        lastBuildReused: null,
      });

      let jobId: string | null = null;

      try {
        const enqueued = await buildPlanningContext(place);
        jobId = enqueued.jobId;
        const stillActive = () => get().activeBuildJobId === jobId;

        set({ activeBuildJobId: jobId });

        const restorePrior = (buildError: string) => {
          if (!stillActive()) return;
          set({
            selectedContextId: prior.selectedContextId,
            selectedContext: prior.selectedContext,
            selectedCounts: prior.selectedCounts,
            countsLoading: false,
            isBuilding: false,
            activeBuildJobId: null,
            buildError,
            buildNotice: null,
            lastBuildReused: null,
          });
        };

        const buildingStub = optimisticBuildingContext(
          enqueued.contextId,
          place,
        );

        if (enqueued.status !== 'succeeded') {
          if (!stillActive()) return;
          set({
            selectedContextId: enqueued.contextId,
            selectedContext: buildingStub,
            selectedCounts: null,
            countsLoading: true,
            isBuilding: true,
          });
        }

        let terminalStatus: 'queued' | 'running' | 'succeeded' | 'failed' =
          enqueued.status;
        let terminalReused = enqueued.reused === true;
        let terminalError: string | null = null;

        if (enqueued.status === 'queued' || enqueued.status === 'running') {
          const deadline = Date.now() + BUILD_POLL_MAX_MS;
          while (Date.now() < deadline) {
            await sleep(BUILD_POLL_MS);
            if (!stillActive()) return;
            const { job } = await getPlanningContextBuildJob(enqueued.jobId);
            if (!stillActive()) return;
            if (job.status === 'succeeded' || job.status === 'failed') {
              terminalStatus = job.status;
              terminalReused = job.reused === true;
              terminalError = job.errorMessage ?? null;
              break;
            }
            set({
              selectedContextId: enqueued.contextId,
              selectedContext: {
                ...buildingStub,
                status: 'building',
                updatedAt: new Date().toISOString(),
              },
              selectedCounts: null,
              countsLoading: true,
              isBuilding: true,
            });
          }
          if (!stillActive()) return;
          if (terminalStatus === 'queued' || terminalStatus === 'running') {
            restorePrior(
              'Planning context build timed out. Try again shortly.',
            );
            return;
          }
        } else if (enqueued.status === 'succeeded') {
          try {
            const { job } = await getPlanningContextBuildJob(enqueued.jobId);
            terminalReused = job.reused === true || enqueued.reused === true;
          } catch {
            terminalReused = enqueued.reused === true;
          }
        }

        if (!stillActive()) return;

        if (terminalStatus === 'failed') {
          restorePrior(
            terminalError ??
              'External data provider unavailable or bbox too large. Try a smaller city/area or use Sydney Demo.',
          );
          return;
        }

        const detail = await getPlanningContextDetail(enqueued.contextId);
        if (!stillActive()) return;

        const contexts = await listPlanningContexts().catch(
          () => get().contexts,
        );
        if (!stillActive()) return;

        const merged = contexts.some((c) => c.id === detail.context.id)
          ? contexts.map((c) =>
              c.id === detail.context.id ? detail.context : c,
            )
          : [detail.context, ...contexts];
        persistId(detail.context.id);
        clearTransientUi();
        useMapStore.getState().requestFlyToFeature({
          center: detail.context.center,
          bbox: detail.context.bbox,
          geometryType: 'Polygon',
        });
        set((state) => ({
          contexts: merged,
          selectedContextId: detail.context.id,
          selectedContext: detail.context,
          selectedCounts: detail.counts,
          countsLoading: false,
          lastBuildReused: terminalReused,
          isBuilding: false,
          activeBuildJobId: null,
          buildNotice: isEmptyBuildCounts(detail.counts)
            ? EMPTY_BUILD_NOTICE
            : null,
          dataRevision: state.dataRevision + 1,
        }));
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : 'External data provider unavailable or bbox too large. Try a smaller city/area or use Sydney Demo.';
        // Ignore failures from superseded builds (user selected another context
        // or started a newer build). Pre-enqueue failures have jobId == null.
        if (jobId == null || get().activeBuildJobId === jobId) {
          set({
            selectedContextId: prior.selectedContextId,
            selectedContext: prior.selectedContext,
            selectedCounts: prior.selectedCounts,
            countsLoading: false,
            isBuilding: false,
            activeBuildJobId: null,
            buildError: message,
            buildNotice: null,
            lastBuildReused: null,
          });
        }
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
