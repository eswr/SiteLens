import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

// Stateful in-memory billing so demo-plan changes are observable, no DB.
const { billingState } = vi.hoisted(() => ({
  billingState: { plans: new Map<string, string>() },
}));

vi.mock('../billing/billingRepository', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../billing/billingRepository')>();
  const { getPlan } = await import('@sitelens/shared');
  const ctx = (planId: 'free' | 'pro' | 'enterprise') => {
    const plan = getPlan(planId);
    return { plan, subscription: { plan: planId, status: 'active' as const }, features: plan.features };
  };
  return {
    ...actual,
    getBillingContextForUser: async (userId: string | null) => {
      if (!userId) return actual.demoFallbackContext(null);
      const override = billingState.plans.get(userId);
      return override
        ? ctx(override as 'free' | 'pro' | 'enterprise')
        : actual.demoFallbackContext(userId);
    },
    setDemoPlanForUser: async (userId: string, plan: 'free' | 'pro' | 'enterprise') => {
      billingState.plans.set(userId, plan);
      return ctx(plan);
    },
    applyStripeSubscriptionEvent: async () => {},
    recordUsage: async () => {},
    getUsage: async () => 0,
  };
});

const { buildApp } = await import('../app');

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp();
  await app.ready();
});

beforeEach(() => {
  billingState.plans.clear();
  delete process.env.STRIPE_WEBHOOK_SECRET;
});

afterAll(async () => {
  delete process.env.STRIPE_WEBHOOK_SECRET;
  await app.close();
});

describe('GET /api/billing/plans', () => {
  it('returns the plan catalog', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/billing/plans' });
    expect(res.statusCode).toBe(200);
    const ids = res.json().data.map((p: { id: string }) => p.id);
    expect(ids).toEqual(['free', 'pro', 'enterprise']);
  });
});

describe('GET /api/billing/current', () => {
  it('anonymous → free', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/billing/current' });
    expect(res.json().data.plan.id).toBe('free');
    expect(res.json().data.capabilities.canRunAnalysis).toBe(false);
  });

  it('planner → pro', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/billing/current',
      headers: { 'x-api-key': 'demo-planner-key' },
    });
    expect(res.json().data.plan.id).toBe('pro');
    expect(res.json().data.capabilities.canRunAnalysis).toBe(true);
  });
});

describe('POST /api/billing/demo-plan', () => {
  it('changes the plan and updated capabilities', async () => {
    // Planner downgrades to free → loses analysis.
    const res = await app.inject({
      method: 'POST',
      url: '/api/billing/demo-plan',
      headers: { 'x-api-key': 'demo-planner-key' },
      payload: { plan: 'free' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.plan.id).toBe('free');
    expect(res.json().data.capabilities.canRunAnalysis).toBe(false);

    // The change persists on the next read.
    const current = await app.inject({
      method: 'GET',
      url: '/api/billing/current',
      headers: { 'x-api-key': 'demo-planner-key' },
    });
    expect(current.json().data.plan.id).toBe('free');
  });

  it('anonymous cannot switch plans (401)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/billing/demo-plan',
      payload: { plan: 'pro' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/billing/webhook', () => {
  it('accepts a demo payload in non-production (no secret)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/billing/webhook',
      payload: {
        type: 'customer.subscription.updated',
        data: { object: { account_id: 'user_planner', plan: 'enterprise', status: 'active', id: 'sub_demo' } },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.received).toBe(true);
  });

  it('rejects an invalid signature when a webhook secret is configured', async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
    const res = await app.inject({
      method: 'POST',
      url: '/api/billing/webhook',
      headers: { 'stripe-signature': 't=123,v1=deadbeef' },
      payload: { type: 'customer.subscription.updated', data: { object: {} } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('INVALID_SIGNATURE');
  });
});
