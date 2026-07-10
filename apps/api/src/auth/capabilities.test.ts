import { describe, expect, it } from 'vitest';
import type { BillingContext, BillingPlanId, DemoUser } from '@sitelens/shared';
import { getPlan } from '@sitelens/shared';
import { accessScope, getCapabilities } from './capabilities';
import { getUserById, getUserForApiKey } from './demoUsers';

function contextFor(planId: BillingPlanId): BillingContext {
  const plan = getPlan(planId);
  return { plan, subscription: { plan: planId, status: 'active' }, features: plan.features };
}

describe('getUserForApiKey / getUserById', () => {
  it('resolves known keys and ids', () => {
    expect(getUserForApiKey('demo-planner-key')?.role).toBe('planner');
    expect(getUserById('user_admin')?.plan).toBe('enterprise');
  });

  it('returns null for unknown', () => {
    expect(getUserForApiKey('nope')).toBeNull();
    expect(getUserById('nope')).toBeNull();
  });
});

describe('getCapabilities (billing-driven)', () => {
  it('anonymous (free): read-only, limited', () => {
    const caps = getCapabilities(null, contextFor('free'));
    expect(caps.canReadLayers).toBe(true);
    expect(caps.canRunAnalysis).toBe(false);
    expect(caps.canViewAllLayers).toBe(false);
    expect(caps.canIngestData).toBe(false);
  });

  it('planner on pro: analysis + full data, no ingestion', () => {
    const caps = getCapabilities(getUserById('user_planner'), contextFor('pro'));
    expect(caps.canRunAnalysis).toBe(true);
    expect(caps.canGenerateSummary).toBe(true);
    expect(caps.canViewAllLayers).toBe(true);
    expect(caps.canIngestData).toBe(false);
  });

  it('admin on enterprise: can ingest', () => {
    const caps = getCapabilities(
      getUserById('user_admin'),
      contextFor('enterprise'),
    );
    expect(caps.canRunAnalysis).toBe(true);
    expect(caps.canIngestData).toBe(true);
  });

  it('admin on free plan cannot run paid analysis (plan wins)', () => {
    const caps = getCapabilities(getUserById('user_admin'), contextFor('free'));
    expect(caps.canRunAnalysis).toBe(false);
    expect(caps.canIngestData).toBe(false);
  });

  it('viewer on enterprise plan gets analysis but not ingestion (role wins for admin)', () => {
    const viewer = getUserById('user_viewer') as DemoUser;
    const caps = getCapabilities(viewer, contextFor('enterprise'));
    expect(caps.canRunAnalysis).toBe(true);
    expect(caps.canIngestData).toBe(false);
  });
});

describe('accessScope', () => {
  it('is the billing plan id', () => {
    expect(accessScope(contextFor('free'))).toBe('free');
    expect(accessScope(contextFor('pro'))).toBe('pro');
    expect(accessScope(contextFor('enterprise'))).toBe('enterprise');
  });
});
