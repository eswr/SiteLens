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

const {
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
    buildError: null,
    buildNotice: null,
    dataRevision: 0,
  });
}

describe('planningContextStore async build jobs', () => {
  beforeEach(() => {
    vi.useRealTimers();
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

  it('shows an optimistic building context while the job is queued/running', async () => {
    vi.useFakeTimers();
    buildPlanningContext.mockResolvedValue({
      jobId: 'job-opt',
      contextId: readyContext.id,
      status: 'queued',
    });
    getPlanningContextBuildJob.mockResolvedValue({
      job: {
        id: 'job-opt',
        planningContextId: readyContext.id,
        status: 'running',
        place,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    const buildPromise = usePlanningContextStore
      .getState()
      .buildContextFromSelectedPlace(place);
    await Promise.resolve();

    const optimistic = usePlanningContextStore.getState();
    expect(optimistic.isBuilding).toBe(true);
    expect(optimistic.activeBuildJobId).toBe('job-opt');
    expect(optimistic.selectedContextId).toBe(readyContext.id);
    expect(optimistic.selectedContext?.status).toBe('building');
    expect(optimistic.selectedContext?.source).toBe('external-osm');

    // Abort before long timeout by superseding the job id.
    usePlanningContextStore.setState({ activeBuildJobId: null });
    await vi.advanceTimersByTimeAsync(1000);
    await buildPromise;
  });

  it('polls until the job succeeds and selects the built context', async () => {
    vi.useFakeTimers();
    buildPlanningContext.mockResolvedValue({
      jobId: 'job-1',
      contextId: readyContext.id,
      status: 'queued',
    });
    getPlanningContextBuildJob
      .mockResolvedValueOnce({
        job: {
          id: 'job-1',
          planningContextId: readyContext.id,
          status: 'running',
          place,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      })
      .mockResolvedValueOnce({
        job: {
          id: 'job-1',
          planningContextId: readyContext.id,
          status: 'succeeded',
          reused: false,
          place,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      });
    getPlanningContextDetail.mockResolvedValue({
      context: readyContext,
      counts: readyCounts,
    });
    listPlanningContexts.mockResolvedValue([sydney, readyContext]);

    const buildPromise = usePlanningContextStore
      .getState()
      .buildContextFromSelectedPlace(place);

    await vi.advanceTimersByTimeAsync(1000);
    expect(usePlanningContextStore.getState().isBuilding).toBe(true);
    expect(usePlanningContextStore.getState().selectedContext?.status).toBe(
      'building',
    );

    await vi.advanceTimersByTimeAsync(1000);
    await buildPromise;

    const state = usePlanningContextStore.getState();
    expect(state.isBuilding).toBe(false);
    expect(state.activeBuildJobId).toBeNull();
    expect(state.selectedContextId).toBe(readyContext.id);
    expect(state.selectedCounts).toEqual(readyCounts);
    expect(state.lastBuildReused).toBe(false);
    expect(state.buildError).toBeNull();
  });

  it('rolls back to the prior selection when the job fails', async () => {
    vi.useFakeTimers();
    buildPlanningContext.mockResolvedValue({
      jobId: 'job-fail',
      contextId: readyContext.id,
      status: 'queued',
    });
    getPlanningContextBuildJob.mockResolvedValue({
      job: {
        id: 'job-fail',
        planningContextId: readyContext.id,
        status: 'failed',
        errorMessage: 'Overpass unavailable',
        place,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    const buildPromise = usePlanningContextStore
      .getState()
      .buildContextFromSelectedPlace(place);
    await vi.advanceTimersByTimeAsync(1000);
    await buildPromise;

    const state = usePlanningContextStore.getState();
    expect(state.selectedContextId).toBe(sydney.id);
    expect(state.selectedContext).toEqual(sydney);
    expect(state.isBuilding).toBe(false);
    expect(state.activeBuildJobId).toBeNull();
    expect(state.buildError).toBe('Overpass unavailable');
  });

  it('rolls back with a timeout error when polling never finishes', async () => {
    vi.useFakeTimers();
    buildPlanningContext.mockResolvedValue({
      jobId: 'job-slow',
      contextId: readyContext.id,
      status: 'queued',
    });
    getPlanningContextBuildJob.mockResolvedValue({
      job: {
        id: 'job-slow',
        planningContextId: readyContext.id,
        status: 'running',
        place,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    const buildPromise = usePlanningContextStore
      .getState()
      .buildContextFromSelectedPlace(place);
    await vi.advanceTimersByTimeAsync(121_000);
    await buildPromise;

    const state = usePlanningContextStore.getState();
    expect(state.selectedContextId).toBe(sydney.id);
    expect(state.buildError).toMatch(/timed out/i);
    expect(state.isBuilding).toBe(false);
    expect(state.activeBuildJobId).toBeNull();
  });

  it('ignores a superseded build after the user selects another context', async () => {
    vi.useFakeTimers();
    buildPlanningContext.mockResolvedValue({
      jobId: 'job-stale',
      contextId: readyContext.id,
      status: 'queued',
    });
    getPlanningContextBuildJob.mockResolvedValue({
      job: {
        id: 'job-stale',
        planningContextId: readyContext.id,
        status: 'succeeded',
        reused: false,
        place,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    getPlanningContextDetail.mockImplementation(async (id: string) => {
      if (id === readyContext.id) {
        return { context: readyContext, counts: readyCounts };
      }
      return { context: sydney, counts: readyCounts };
    });
    listPlanningContexts.mockResolvedValue([sydney, readyContext]);

    const buildPromise = usePlanningContextStore
      .getState()
      .buildContextFromSelectedPlace(place);

    // Let enqueue + optimistic building stub apply, then switch away.
    await Promise.resolve();
    expect(usePlanningContextStore.getState().selectedContext?.status).toBe(
      'building',
    );
    usePlanningContextStore.getState().selectContext(sydney.id);
    expect(usePlanningContextStore.getState().activeBuildJobId).toBeNull();

    await vi.advanceTimersByTimeAsync(1000);
    await buildPromise;

    const state = usePlanningContextStore.getState();
    expect(state.selectedContextId).toBe(sydney.id);
    // Success path for the stale job must not re-select the external context.
    expect(
      getPlanningContextDetail.mock.calls.some(
        ([id]) => id === readyContext.id,
      ),
    ).toBe(false);
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
    vi.useFakeTimers();
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
