import { create } from 'zustand';
import type {
  PlanningContext,
  PlanningContextBuildJob,
  PlanningContextFeatureCounts,
} from '@sitelens/shared';
import {
  EXTERNAL_OSM_DISCLAIMER,
  LOCAL_DEMO_SYDNEY_CONTEXT_ID,
} from '@sitelens/shared';
import type { PlaceSearchResult } from '../api/geocodingApi';
import { ApiError, isApiConfigured } from '../api/client';
import {
  fetchPlanningContextBuildJob,
  fetchPlanningContextDetail,
  fetchPlanningContextsList,
  invalidatePlanningContextsAfterBuild,
  refetchPlanningContextDetail,
  refetchPlanningContextsList,
  requestBuildPlanningContext,
} from '../query/planningContextQueries';
import { useMapStore } from './mapStore';
import { useAnalysisStore } from './analysisStore';
import { useAiSummaryStore } from './aiSummaryStore';
import { useSearchStore } from './searchStore';

const STORAGE_KEY = 'sitelens:selected-planning-context:v1';

export const EMPTY_BUILD_NOTICE =
  'The context was built, but no usable planning features were found in this area. Try a different place or a smaller area.';

export const CANCEL_WATCH_NOTICE =
  'Stopped watching this build. The backend job will continue; refresh contexts later to see results.';

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

/** Fit the map to a planning context extent (optional instant duration for cold start). */
function flyToPlanningContext(
  context: PlanningContext,
  duration?: number,
): void {
  useMapStore.getState().requestFlyToFeature({
    center: context.center,
    bbox: context.bbox,
    geometryType: 'Polygon',
    ...(duration !== undefined ? { duration } : {}),
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
    const detail = await fetchPlanningContextDetail(contextId);
    return { context: detail.context, counts: detail.counts };
  } catch {
    const listed = usePlanningContextStore
      .getState()
      .contexts.find((c) => c.id === contextId);
    return { context: listed ?? SYDNEY_FALLBACK, counts: null };
  }
}

interface PriorSelection {
  selectedContextId: string;
  selectedContext: PlanningContext | null;
  selectedCounts: PlanningContextFeatureCounts | null;
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
  /** Job currently associated with watch UI (may remain after cancel for resume). */
  watchedBuildJobId: string | null;
  watchingCancelled: boolean;
  watchStartedAtMs: number | null;
  watchNotice: string | null;
  buildError: string | null;
  /** Immediate post-build notice (e.g. empty feature counts). */
  buildNotice: string | null;
  dataRevision: number;
  priorBuildSelection: PriorSelection | null;
  buildingStub: PlanningContext | null;
  loadContexts: () => Promise<void>;
  selectContext: (contextId: string) => void;
  buildContextFromSelectedPlace: (
    place: PlaceSearchResult,
  ) => Promise<void>;
  cancelWatchingBuild: () => void;
  resumeWatchingBuild: () => void;
  clearWatchedBuild: () => void;
  onBuildJobUpdate: (job: PlanningContextBuildJob) => Promise<void>;
  onBuildWatchTimeout: () => void;
  clearBuildError: () => void;
  clearBuildNotice: () => void;
  clearWatchNotice: () => void;
}

export const usePlanningContextStore = create<PlanningContextState>(
  (set, get) => {
    const clearWatchState = () =>
      set({
        watchedBuildJobId: null,
        watchingCancelled: false,
        watchStartedAtMs: null,
        activeBuildJobId: null,
        isBuilding: false,
        priorBuildSelection: null,
        buildingStub: null,
      });

    const restorePrior = (buildError: string) => {
      const prior = get().priorBuildSelection;
      if (!prior) {
        set({
          isBuilding: false,
          activeBuildJobId: null,
          watchedBuildJobId: null,
          watchingCancelled: false,
          watchStartedAtMs: null,
          buildError,
          buildNotice: null,
          lastBuildReused: null,
          buildingStub: null,
        });
        return;
      }
      set({
        selectedContextId: prior.selectedContextId,
        selectedContext: prior.selectedContext,
        selectedCounts: prior.selectedCounts,
        countsLoading: false,
        isBuilding: false,
        activeBuildJobId: null,
        watchedBuildJobId: null,
        watchingCancelled: false,
        watchStartedAtMs: null,
        priorBuildSelection: null,
        buildingStub: null,
        buildError,
        buildNotice: null,
        lastBuildReused: null,
      });
    };

    const applySuccess = async (
      contextId: string,
      terminalReused: boolean,
    ) => {
      if (get().watchingCancelled) {
        return;
      }
      if (get().watchedBuildJobId == null && get().activeBuildJobId == null) {
        return;
      }

      await invalidatePlanningContextsAfterBuild(contextId);
      const detail = await refetchPlanningContextDetail(contextId).catch(() =>
        fetchPlanningContextDetail(contextId),
      );
      if (get().watchingCancelled) {
        return;
      }
      if (get().watchedBuildJobId == null && get().activeBuildJobId == null) {
        return;
      }

      const contexts = await refetchPlanningContextsList().catch(
        () => get().contexts,
      );
      const merged = contexts.some((c) => c.id === detail.context.id)
        ? contexts.map((c) =>
            c.id === detail.context.id ? detail.context : c,
          )
        : [detail.context, ...contexts];
      persistId(detail.context.id);
      clearTransientUi();
      flyToPlanningContext(detail.context);
      set((state) => ({
        contexts: merged,
        selectedContextId: detail.context.id,
        selectedContext: detail.context,
        selectedCounts: detail.counts,
        countsLoading: false,
        lastBuildReused: terminalReused,
        isBuilding: false,
        activeBuildJobId: null,
        watchedBuildJobId: null,
        watchingCancelled: false,
        watchStartedAtMs: null,
        priorBuildSelection: null,
        buildingStub: null,
        watchNotice: null,
        buildNotice: isEmptyBuildCounts(detail.counts)
          ? EMPTY_BUILD_NOTICE
          : null,
        dataRevision: state.dataRevision + 1,
      }));
    };

    return {
      contexts: [SYDNEY_FALLBACK],
      selectedContextId: readStoredId(),
      selectedContext: SYDNEY_FALLBACK,
      selectedCounts: null,
      countsLoading: false,
      lastBuildReused: null,
      isLoading: false,
      isBuilding: false,
      activeBuildJobId: null,
      watchedBuildJobId: null,
      watchingCancelled: false,
      watchStartedAtMs: null,
      watchNotice: null,
      buildError: null,
      buildNotice: null,
      dataRevision: 0,
      priorBuildSelection: null,
      buildingStub: null,

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
          flyToPlanningContext(SYDNEY_FALLBACK, 0);
          return;
        }
        set({ isLoading: true, countsLoading: true });
        try {
          const contexts = await fetchPlanningContextsList();
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
          flyToPlanningContext(detail.context, 0);
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
          flyToPlanningContext(SYDNEY_FALLBACK, 0);
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
        flyToPlanningContext(context);
        set((state) => ({
          selectedContextId: context.id,
          selectedContext: context,
          selectedCounts: null,
          countsLoading: true,
          lastBuildReused: null,
          activeBuildJobId: null,
          watchedBuildJobId: null,
          watchingCancelled: false,
          watchStartedAtMs: null,
          priorBuildSelection: null,
          buildingStub: null,
          isBuilding: false,
          watchNotice: null,
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

        const prior: PriorSelection = {
          selectedContextId: get().selectedContextId,
          selectedContext: get().selectedContext,
          selectedCounts: get().selectedCounts,
        };

        set({
          isBuilding: true,
          buildError: null,
          buildNotice: null,
          watchNotice: null,
          lastBuildReused: null,
          watchingCancelled: false,
        });

        try {
          const enqueued = await requestBuildPlanningContext(place);
          const jobId = enqueued.jobId;
          const buildingStub = optimisticBuildingContext(
            enqueued.contextId,
            place,
          );

          if (enqueued.status === 'succeeded') {
            set({
              activeBuildJobId: jobId,
              watchedBuildJobId: jobId,
              priorBuildSelection: prior,
              buildingStub,
              watchStartedAtMs: Date.now(),
            });
            let terminalReused = enqueued.reused === true;
            try {
              const { job } = await fetchPlanningContextBuildJob(jobId);
              terminalReused = job.reused === true || enqueued.reused === true;
            } catch {
              // keep enqueue reused flag
            }
            await applySuccess(enqueued.contextId, terminalReused);
            return;
          }

          set({
            activeBuildJobId: jobId,
            watchedBuildJobId: jobId,
            watchingCancelled: false,
            watchStartedAtMs: Date.now(),
            priorBuildSelection: prior,
            buildingStub,
            selectedContextId: enqueued.contextId,
            selectedContext: buildingStub,
            selectedCounts: null,
            countsLoading: true,
            isBuilding: true,
          });
        } catch (error) {
          const message =
            error instanceof ApiError
              ? error.message
              : 'External data provider unavailable or bbox too large. Try a smaller city/area or use Sydney Demo.';
          set({
            selectedContextId: prior.selectedContextId,
            selectedContext: prior.selectedContext,
            selectedCounts: prior.selectedCounts,
            countsLoading: false,
            isBuilding: false,
            activeBuildJobId: null,
            watchedBuildJobId: null,
            watchingCancelled: false,
            watchStartedAtMs: null,
            priorBuildSelection: null,
            buildingStub: null,
            buildError: message,
            buildNotice: null,
            lastBuildReused: null,
          });
        }
      },

      cancelWatchingBuild: () => {
        const jobId = get().watchedBuildJobId;
        if (!jobId || get().watchingCancelled) {
          return;
        }
        set({
          watchingCancelled: true,
          isBuilding: false,
          activeBuildJobId: null,
          watchNotice: CANCEL_WATCH_NOTICE,
          buildError: null,
        });
      },

      resumeWatchingBuild: () => {
        const jobId = get().watchedBuildJobId;
        if (!jobId || !get().watchingCancelled) {
          return;
        }
        set({
          watchingCancelled: false,
          isBuilding: true,
          activeBuildJobId: jobId,
          watchNotice: null,
          watchStartedAtMs: Date.now(),
        });
      },

      clearWatchedBuild: () => {
        clearWatchState();
        set({ watchNotice: null });
      },

      onBuildJobUpdate: async (job) => {
        if (get().watchingCancelled) {
          return;
        }
        if (get().watchedBuildJobId !== job.id) {
          return;
        }
        if (get().activeBuildJobId !== job.id) {
          return;
        }

        const stub = get().buildingStub;
        if (job.status === 'queued' || job.status === 'running') {
          if (stub) {
            set({
              selectedContextId: job.planningContextId,
              selectedContext: {
                ...stub,
                status: 'building',
                updatedAt: new Date().toISOString(),
              },
              selectedCounts: null,
              countsLoading: true,
              isBuilding: true,
            });
          }
          return;
        }

        if (job.status === 'failed') {
          restorePrior(
            job.errorMessage ??
              'External data provider unavailable or bbox too large. Try a smaller city/area or use Sydney Demo.',
          );
          return;
        }

        if (job.status === 'succeeded') {
          await applySuccess(job.planningContextId, job.reused === true);
        }
      },

      onBuildWatchTimeout: () => {
        if (get().watchingCancelled) {
          return;
        }
        if (!get().watchedBuildJobId || !get().isBuilding) {
          return;
        }
        restorePrior(
          'Planning context build timed out. Try again shortly.',
        );
      },

      clearBuildError: () => set({ buildError: null }),
      clearBuildNotice: () => set({ buildNotice: null }),
      clearWatchNotice: () => set({ watchNotice: null }),
    };
  },
);

/** Convenience accessor used by API clients. */
export function getSelectedPlanningContextId(): string {
  return (
    usePlanningContextStore.getState().selectedContextId ||
    LOCAL_DEMO_SYDNEY_CONTEXT_ID
  );
}
