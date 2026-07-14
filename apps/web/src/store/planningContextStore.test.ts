import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  PlanningContext,
  PlanningContextFeatureCounts,
} from '@sitelens/shared';
import { LOCAL_DEMO_SYDNEY_CONTEXT_ID } from '@sitelens/shared';
import { ApiError } from '../api/client';
import type { PlaceSearchResult } from '../api/geocodingApi';

const {
  isApiConfigured,
  buildPlanningContext,
  getPlanningContextBuildJob,
  getPlanningContextDetail,
  listPlanningContexts,
} = vi.hoisted(() => ({
  isApiConfigured: vi.fn(() => true),
  buildPlanningContext: vi.fn(),
  getPlanningContextBuildJob: vi.fn(),
  getPlanningContextDetail: vi.fn(),
  listPlanningContexts: vi.fn(),
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return {
    ...actual,
    isApiConfigured,
  };
});

vi.mock('../api/planningContextsApi', () => ({
  buildPlanningContext,
  getPlanningContextBuildJob,
  getPlanningContextDetail,
  listPlanningContexts,
}));

// Queries own server reads/mutations; they delegate to the mocked API module.
vi.mock('../query/queryClient', async () => {
  const { QueryClient } = await import('@tanstack/react-query');
  return {
    queryClient: new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    }),
  };
});

const {
  CANCEL_WATCH_NOTICE,
  EMPTY_BUILD_NOTICE,
  usePlanningContextStore,
} = await import('./planningContextStore');

const sydney: PlanningContext = {
  id: LOCAL_DEMO_SYDNEY_CONTEXT_ID,
  label: 'Sydney Demo',
  source: 'local-demo',
  status: 'ready',
  center: [151.2093, -33.8688],
  bbox: [151.199, -33.876, 151.22, -33.86],
  disclaimer: 'Sydney Demo disclaimer',
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
};

const place: PlaceSearchResult = {
  id: 'static-demo-bengaluru',
  label: 'Bengaluru',
  displayName: 'Bengaluru, India',
  latitude: 12.9716,
  longitude: 77.5946,
  provider: 'static-demo',
};

const readyCounts: PlanningContextFeatureCounts = {
  sites: 4,
  landUse: 2,
  constraints: 1,
  transit: 3,
  developmentActivity: 1,
};

const readyContext: PlanningContext = {
  id: 'external-osm:bengaluru:abc',
  label: 'Bengaluru external context',
  source: 'external-osm',
  status: 'ready',
  center: [77.5946, 12.9716],
  bbox: [77.57, 12.95, 77.62, 12.99],
  place: {
    id: place.id,
    label: place.label,
    displayName: place.displayName,
    provider: place.provider,
  },
  disclaimer: 'Open-map disclaimer',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

function resetStore() {
  usePlanningContextStore.setState({
    contexts: [sydney],
    selectedContextId: sydney.id,
    selectedContext: sydney,
    selectedCounts: { ...readyCounts },
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
  });
}

describe('planningContextStore async build jobs', () => {
  beforeEach(() => {
    resetStore();
    isApiConfigured.mockReturnValue(true);
  });

  it('rejects external builds when the API is not configured', async () => {
    isApiConfigured.mockReturnValue(false);
    await usePlanningContextStore
      .getState()
      .buildContextFromSelectedPlace(place);
    expect(usePlanningContextStore.getState().buildError).toMatch(
      /backend API mode/i,
    );
    expect(buildPlanningContext).not.toHaveBeenCalled();
  });

  it('starts watching a queued build with an optimistic building context', async () => {
    buildPlanningContext.mockResolvedValue({
      jobId: 'job-opt',
      contextId: readyContext.id,
      status: 'queued',
    });

    await usePlanningContextStore
      .getState()
      .buildContextFromSelectedPlace(place);

    const optimistic = usePlanningContextStore.getState();
    expect(optimistic.isBuilding).toBe(true);
    expect(optimistic.activeBuildJobId).toBe('job-opt');
    expect(optimistic.watchedBuildJobId).toBe('job-opt');
    expect(optimistic.watchingCancelled).toBe(false);
    expect(optimistic.selectedContextId).toBe(readyContext.id);
    expect(optimistic.selectedContext?.status).toBe('building');
  });

  it('selects the built context when a watched job succeeds', async () => {
    buildPlanningContext.mockResolvedValue({
      jobId: 'job-1',
      contextId: readyContext.id,
      status: 'queued',
    });
    getPlanningContextDetail.mockResolvedValue({
      context: readyContext,
      counts: readyCounts,
    });
    listPlanningContexts.mockResolvedValue([sydney, readyContext]);

    await usePlanningContextStore
      .getState()
      .buildContextFromSelectedPlace(place);

    await usePlanningContextStore.getState().onBuildJobUpdate({
      id: 'job-1',
      planningContextId: readyContext.id,
      status: 'succeeded',
      reused: false,
      place,
      counts: null,
      errorMessage: null,
      attempts: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
    });

    const state = usePlanningContextStore.getState();
    expect(state.isBuilding).toBe(false);
    expect(state.activeBuildJobId).toBeNull();
    expect(state.watchedBuildJobId).toBeNull();
    expect(state.selectedContextId).toBe(readyContext.id);
    expect(state.selectedCounts).toEqual(readyCounts);
    expect(state.lastBuildReused).toBe(false);
  });

  it('rolls back to the prior selection when the job fails while watching', async () => {
    buildPlanningContext.mockResolvedValue({
      jobId: 'job-fail',
      contextId: readyContext.id,
      status: 'queued',
    });

    await usePlanningContextStore
      .getState()
      .buildContextFromSelectedPlace(place);

    await usePlanningContextStore.getState().onBuildJobUpdate({
      id: 'job-fail',
      planningContextId: readyContext.id,
      status: 'failed',
      errorMessage: 'Overpass unavailable',
      place,
      counts: null,
      reused: null,
      attempts: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
    });

    const state = usePlanningContextStore.getState();
    expect(state.selectedContextId).toBe(sydney.id);
    expect(state.selectedContext).toEqual(sydney);
    expect(state.isBuilding).toBe(false);
    expect(state.buildError).toBe('Overpass unavailable');
  });

  it('times out watching with a rollback', async () => {
    buildPlanningContext.mockResolvedValue({
      jobId: 'job-slow',
      contextId: readyContext.id,
      status: 'queued',
    });

    await usePlanningContextStore
      .getState()
      .buildContextFromSelectedPlace(place);
    usePlanningContextStore.getState().onBuildWatchTimeout();

    const state = usePlanningContextStore.getState();
    expect(state.selectedContextId).toBe(sydney.id);
    expect(state.buildError).toMatch(/timed out/i);
    expect(state.isBuilding).toBe(false);
  });

  it('cancel watching stops applying terminal success and does not cancel backend work', async () => {
    buildPlanningContext.mockResolvedValue({
      jobId: 'job-cancel',
      contextId: readyContext.id,
      status: 'queued',
    });
    getPlanningContextDetail.mockResolvedValue({
      context: readyContext,
      counts: readyCounts,
    });
    listPlanningContexts.mockResolvedValue([sydney, readyContext]);

    await usePlanningContextStore
      .getState()
      .buildContextFromSelectedPlace(place);

    usePlanningContextStore.getState().cancelWatchingBuild();
    const cancelled = usePlanningContextStore.getState();
    expect(cancelled.watchingCancelled).toBe(true);
    expect(cancelled.watchNotice).toBe(CANCEL_WATCH_NOTICE);
    expect(cancelled.isBuilding).toBe(false);
    expect(cancelled.watchedBuildJobId).toBe('job-cancel');
    expect(cancelled.activeBuildJobId).toBeNull();

    await usePlanningContextStore.getState().onBuildJobUpdate({
      id: 'job-cancel',
      planningContextId: readyContext.id,
      status: 'succeeded',
      reused: false,
      place,
      counts: null,
      errorMessage: null,
      attempts: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
    });

    // Optimistic building selection may remain; terminal success must not auto-select.
    expect(getPlanningContextDetail).not.toHaveBeenCalled();
    expect(usePlanningContextStore.getState().lastBuildReused).toBeNull();
  });

  it('resume watching restarts applying job updates', async () => {
    buildPlanningContext.mockResolvedValue({
      jobId: 'job-resume',
      contextId: readyContext.id,
      status: 'queued',
    });
    getPlanningContextDetail.mockResolvedValue({
      context: readyContext,
      counts: readyCounts,
    });
    listPlanningContexts.mockResolvedValue([sydney, readyContext]);

    await usePlanningContextStore
      .getState()
      .buildContextFromSelectedPlace(place);
    usePlanningContextStore.getState().cancelWatchingBuild();
    usePlanningContextStore.getState().resumeWatchingBuild();

    const resumed = usePlanningContextStore.getState();
    expect(resumed.watchingCancelled).toBe(false);
    expect(resumed.isBuilding).toBe(true);
    expect(resumed.activeBuildJobId).toBe('job-resume');
    expect(resumed.watchNotice).toBeNull();

    await usePlanningContextStore.getState().onBuildJobUpdate({
      id: 'job-resume',
      planningContextId: readyContext.id,
      status: 'succeeded',
      reused: false,
      place,
      counts: null,
      errorMessage: null,
      attempts: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
    });

    expect(usePlanningContextStore.getState().selectedContextId).toBe(
      readyContext.id,
    );
  });

  it('ignores a superseded build after the user selects another context', async () => {
    buildPlanningContext.mockResolvedValue({
      jobId: 'job-stale',
      contextId: readyContext.id,
      status: 'queued',
    });
    getPlanningContextDetail.mockResolvedValue({
      context: readyContext,
      counts: readyCounts,
    });
    listPlanningContexts.mockResolvedValue([sydney, readyContext]);

    await usePlanningContextStore
      .getState()
      .buildContextFromSelectedPlace(place);
    usePlanningContextStore.getState().selectContext(sydney.id);
    expect(usePlanningContextStore.getState().activeBuildJobId).toBeNull();
    expect(usePlanningContextStore.getState().watchedBuildJobId).toBeNull();

    await usePlanningContextStore.getState().onBuildJobUpdate({
      id: 'job-stale',
      planningContextId: readyContext.id,
      status: 'succeeded',
      reused: false,
      place,
      counts: null,
      errorMessage: null,
      attempts: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      finishedAt: null,
    });

    expect(usePlanningContextStore.getState().selectedContextId).toBe(
      sydney.id,
    );
  });

  it('rolls back on pre-enqueue ApiError', async () => {
    buildPlanningContext.mockRejectedValue(
      new ApiError('Plan does not allow external builds', {
        status: 403,
        code: 'FORBIDDEN',
      }),
    );

    await usePlanningContextStore
      .getState()
      .buildContextFromSelectedPlace(place);

    const state = usePlanningContextStore.getState();
    expect(state.selectedContextId).toBe(sydney.id);
    expect(state.buildError).toBe('Plan does not allow external builds');
    expect(state.isBuilding).toBe(false);
  });

  it('surfaces EMPTY_BUILD_NOTICE when the ready context has zero counts', async () => {
    const emptyCounts: PlanningContextFeatureCounts = {
      sites: 0,
      landUse: 0,
      constraints: 0,
      transit: 0,
      developmentActivity: 0,
    };
    buildPlanningContext.mockResolvedValue({
      jobId: 'job-empty',
      contextId: readyContext.id,
      status: 'succeeded',
      reused: true,
    });
    getPlanningContextBuildJob.mockResolvedValue({
      job: {
        id: 'job-empty',
        planningContextId: readyContext.id,
        status: 'succeeded',
        reused: true,
        place,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    getPlanningContextDetail.mockResolvedValue({
      context: readyContext,
      counts: emptyCounts,
    });
    listPlanningContexts.mockResolvedValue([sydney, readyContext]);

    await usePlanningContextStore
      .getState()
      .buildContextFromSelectedPlace(place);

    const state = usePlanningContextStore.getState();
    expect(state.buildNotice).toBe(EMPTY_BUILD_NOTICE);
    expect(state.lastBuildReused).toBe(true);
    expect(state.selectedContextId).toBe(readyContext.id);
  });
});
