import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PlanningContext } from '@sitelens/shared';

const {
  getPlanningContext,
  countContextFeatures,
  tryAcquireContextBuildLock,
  releaseContextBuildLock,
  markPlanningContextBuilding,
  markPlanningContextFailed,
  commitReadyExternalContext,
  fetchOverpassFeatures,
  osmToPlanningContext,
  getPool,
  loadConfig,
  isCacheEnabled,
} = vi.hoisted(() => ({
  getPlanningContext: vi.fn(),
  countContextFeatures: vi.fn(),
  tryAcquireContextBuildLock: vi.fn(),
  releaseContextBuildLock: vi.fn(),
  markPlanningContextBuilding: vi.fn(),
  markPlanningContextFailed: vi.fn(),
  commitReadyExternalContext: vi.fn(),
  fetchOverpassFeatures: vi.fn(),
  osmToPlanningContext: vi.fn(),
  getPool: vi.fn(),
  loadConfig: vi.fn(),
  isCacheEnabled: vi.fn(() => false),
}));

vi.mock('../config', () => ({ loadConfig }));
vi.mock('../db/pool', () => ({ getPool }));
vi.mock('../cache/cacheClient', () => ({
  isCacheEnabled,
  waitForCacheReady: vi.fn(async () => {}),
}));
vi.mock('../cache/clearCache', () => ({
  clearPlanningCache: vi.fn(async () => {}),
}));
vi.mock('./osmOverpassClient', () => ({
  fetchOverpassFeatures,
  OverpassDisabledError: class OverpassDisabledError extends Error {
    code = 'OVERPASS_DISABLED';
  },
  OverpassRequestError: class OverpassRequestError extends Error {
    code = 'OVERPASS_ERROR';
    status?: number;
    constructor(message: string, status?: number) {
      super(message);
      this.status = status;
    }
  },
}));
vi.mock('./osmToPlanningContext', () => ({ osmToPlanningContext }));
vi.mock('./planningContextRepository', () => ({
  getPlanningContext,
  countContextFeatures,
  tryAcquireContextBuildLock,
  releaseContextBuildLock,
  markPlanningContextBuilding,
  markPlanningContextFailed,
  commitReadyExternalContext,
}));

const { buildExternalPlanningContext, PlanningContextBuildError } =
  await import('./planningContextBuilder');
const { OverpassRequestError } = await import('./osmOverpassClient');

const place = {
  id: 'static-demo-bengaluru',
  label: 'Bengaluru',
  displayName: 'Bengaluru, India',
  latitude: 12.9716,
  longitude: 77.5946,
  provider: 'static-demo',
};

function readyContext(overrides: Partial<PlanningContext> = {}): PlanningContext {
  const now = new Date().toISOString();
  return {
    id: 'external-osm:bengaluru:test',
    label: 'Bengaluru external context',
    source: 'external-osm',
    status: 'ready',
    center: [77.5946, 12.9716],
    bbox: [77.57, 12.95, 77.62, 12.99],
    disclaimer: 'demo',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const emptyCounts = {
  sites: 0,
  landUse: 0,
  constraints: 0,
  transit: 0,
  developmentActivity: 0,
};

describe('buildExternalPlanningContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadConfig.mockReturnValue({
      externalContextMaxBboxAreaDeg2: 0.25,
      externalContextRebuildAfterDays: 7,
    });
    isCacheEnabled.mockReturnValue(false);
    countContextFeatures.mockResolvedValue(emptyCounts);
    getPool.mockReturnValue({
      connect: async () => ({
        release: vi.fn(),
      }),
    });
    osmToPlanningContext.mockReturnValue({
      sites: [],
      landUse: [],
      constraints: [],
      transit: [],
      developmentActivity: [],
      skipped: 0,
    });
  });

  it('reuses a fresh ready context without calling Overpass', async () => {
    const existing = readyContext();
    getPlanningContext.mockResolvedValue(existing);
    countContextFeatures.mockResolvedValue({ ...emptyCounts, sites: 12 });

    const result = await buildExternalPlanningContext({ place });

    expect(result.reused).toBe(true);
    expect(result.counts.sites).toBe(12);
    expect(fetchOverpassFeatures).not.toHaveBeenCalled();
    expect(tryAcquireContextBuildLock).not.toHaveBeenCalled();
    expect(markPlanningContextBuilding).not.toHaveBeenCalled();
  });

  it('returns BUILD_IN_PROGRESS without calling Overpass when lock is held', async () => {
    getPlanningContext
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        ...readyContext(),
        status: 'building',
      });
    tryAcquireContextBuildLock.mockResolvedValue(false);

    await expect(buildExternalPlanningContext({ place })).rejects.toMatchObject({
      name: 'PlanningContextBuildError',
      code: 'BUILD_IN_PROGRESS',
      statusCode: 409,
    });
    expect(fetchOverpassFeatures).not.toHaveBeenCalled();
    expect(markPlanningContextFailed).not.toHaveBeenCalled();
  });

  it('does not call Overpass twice across a successful build then fresh reuse', async () => {
    getPlanningContext.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    tryAcquireContextBuildLock.mockResolvedValue(true);
    releaseContextBuildLock.mockResolvedValue(undefined);
    markPlanningContextBuilding.mockResolvedValue(undefined);
    fetchOverpassFeatures.mockResolvedValue([]);
    const committed = readyContext({ status: 'ready' });
    commitReadyExternalContext.mockResolvedValue({
      ...emptyCounts,
      sites: 3,
      skipped: 0,
      context: committed,
    });

    const first = await buildExternalPlanningContext({ place });
    expect(first.reused).toBe(false);
    expect(fetchOverpassFeatures).toHaveBeenCalledTimes(1);

    getPlanningContext.mockResolvedValue(committed);
    countContextFeatures.mockResolvedValue({ ...emptyCounts, sites: 3 });

    const second = await buildExternalPlanningContext({ place });
    expect(second.reused).toBe(true);
    expect(fetchOverpassFeatures).toHaveBeenCalledTimes(1);
  });

  it('marks the context failed when Overpass errors', async () => {
    getPlanningContext.mockResolvedValue(null);
    tryAcquireContextBuildLock.mockResolvedValue(true);
    releaseContextBuildLock.mockResolvedValue(undefined);
    markPlanningContextBuilding.mockResolvedValue(undefined);
    fetchOverpassFeatures.mockRejectedValue(
      new OverpassRequestError('upstream down', 503),
    );

    await expect(buildExternalPlanningContext({ place })).rejects.toBeInstanceOf(
      PlanningContextBuildError,
    );
    expect(markPlanningContextFailed).toHaveBeenCalled();
    expect(commitReadyExternalContext).not.toHaveBeenCalled();
  });

  it('invokes beforeLiveFetch only when a live Overpass call is required', async () => {
    const beforeLiveFetch = vi.fn(async () => {});
    getPlanningContext.mockResolvedValue(readyContext());

    await buildExternalPlanningContext({ place }, { beforeLiveFetch });
    expect(beforeLiveFetch).not.toHaveBeenCalled();

    getPlanningContext.mockResolvedValue(null);
    tryAcquireContextBuildLock.mockResolvedValue(true);
    releaseContextBuildLock.mockResolvedValue(undefined);
    markPlanningContextBuilding.mockResolvedValue(undefined);
    fetchOverpassFeatures.mockResolvedValue([]);
    commitReadyExternalContext.mockResolvedValue({
      ...emptyCounts,
      skipped: 0,
      context: readyContext(),
    });

    await buildExternalPlanningContext({ place }, { beforeLiveFetch });
    expect(beforeLiveFetch).toHaveBeenCalledTimes(1);
    expect(beforeLiveFetch.mock.invocationCallOrder[0]).toBeLessThan(
      markPlanningContextBuilding.mock.invocationCallOrder[0],
    );
  });

  it('quota exceeded before live fetch does not create or mark a planning context as failed', async () => {
    const { HttpError } = await import('../auth/requireCapability');
    getPlanningContext.mockResolvedValue(null);
    tryAcquireContextBuildLock.mockResolvedValue(true);
    releaseContextBuildLock.mockResolvedValue(undefined);

    const beforeLiveFetch = vi.fn(async () => {
      throw new HttpError(
        429,
        'ENTITLEMENT_LIMIT_EXCEEDED',
        'Monthly limit of 20 for "external-context:build" reached on your plan. Upgrade for more.',
      );
    });

    await expect(
      buildExternalPlanningContext({ place }, { beforeLiveFetch }),
    ).rejects.toMatchObject({
      name: 'HttpError',
      code: 'ENTITLEMENT_LIMIT_EXCEEDED',
      statusCode: 429,
    });

    expect(beforeLiveFetch).toHaveBeenCalledTimes(1);
    expect(markPlanningContextBuilding).not.toHaveBeenCalled();
    expect(markPlanningContextFailed).not.toHaveBeenCalled();
    expect(fetchOverpassFeatures).not.toHaveBeenCalled();
    expect(commitReadyExternalContext).not.toHaveBeenCalled();
  });
});
