import { apiGetWithMeta, apiPostWithMeta } from './client';
import type {
  BillingContext,
  BillingPlanSummary,
  CapabilityFlags,
  PlanTier,
} from './meApi';

export interface BillingCurrent extends BillingContext {
  capabilities: CapabilityFlags;
}

/** `GET /api/billing/plans` — the public plan catalog. */
export async function getPlans(): Promise<BillingPlanSummary[]> {
  const { data } = await apiGetWithMeta<BillingPlanSummary[]>(
    '/api/billing/plans',
  );
  return data;
}

/** `GET /api/billing/current` — the current user's billing context. */
export async function getCurrentBilling(): Promise<BillingCurrent> {
  const { data } = await apiGetWithMeta<BillingCurrent>('/api/billing/current');
  return data;
}

/** `POST /api/billing/demo-plan` — switch the demo user's plan. */
export async function setDemoPlan(plan: PlanTier): Promise<BillingCurrent> {
  const { data } = await apiPostWithMeta<BillingCurrent>(
    '/api/billing/demo-plan',
    { plan },
  );
  return data;
}
