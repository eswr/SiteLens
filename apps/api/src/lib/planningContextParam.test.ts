import { describe, expect, it, vi } from 'vitest';

const { getPlanningContext } = vi.hoisted(() => ({
  getPlanningContext: vi.fn(),
}));

vi.mock('../externalData/planningContextRepository', () => ({
  getPlanningContext,
}));

const {
  assertPlanningContextExists,
  resolvePlanningContextIdParam,
} = await import('./planningContextParam');

describe('resolvePlanningContextIdParam', () => {
  it('defaults omitted values to Sydney Demo', () => {
    expect(resolvePlanningContextIdParam(undefined)).toEqual({
      ok: true,
      planningContextId: 'local-demo-sydney',
    });
  });

  it('rejects invalid formats', () => {
    expect(resolvePlanningContextIdParam('bad id!')).toMatchObject({
      ok: false,
    });
  });
});

describe('assertPlanningContextExists', () => {
  it('returns a clear error for an unknown planningContextId', async () => {
    getPlanningContext.mockResolvedValueOnce(null);
    await expect(
      assertPlanningContextExists('external-osm:unknown:zzz'),
    ).resolves.toEqual({
      ok: false,
      status: 404,
      message: 'Planning context not found: external-osm:unknown:zzz',
    });
  });

  it('rejects failed contexts so they cannot be selected for analysis', async () => {
    getPlanningContext.mockResolvedValueOnce({
      id: 'external-osm:failed:1',
      status: 'failed',
    });
    await expect(
      assertPlanningContextExists('external-osm:failed:1'),
    ).resolves.toMatchObject({
      ok: false,
      status: 400,
      message: expect.stringContaining('failed to build'),
    });
  });

  it('allows ready contexts', async () => {
    getPlanningContext.mockResolvedValueOnce({
      id: 'local-demo-sydney',
      status: 'ready',
    });
    await expect(
      assertPlanningContextExists('local-demo-sydney'),
    ).resolves.toEqual({ ok: true });
  });
});
