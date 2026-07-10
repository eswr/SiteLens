import type { BillingFeature, BillingPlan, BillingPlanId } from './billing';

const FREE_FEATURES: BillingFeature[] = [
  'layers:read',
  'parcels:read',
  'search:basic',
];

const PRO_FEATURES: BillingFeature[] = [
  ...FREE_FEATURES,
  'parcels:full',
  'search:full',
  'analysis:run',
  'summary:generate',
];

const ENTERPRISE_FEATURES: BillingFeature[] = [
  ...PRO_FEATURES,
  'ingestion:manage',
  'admin:manage',
];

/** The plan catalog. Prices are illustrative; `stripePriceId` wired later. */
export const PLAN_CATALOG: Record<BillingPlanId, BillingPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    description: 'Explore planning layers with limited search and parcel access.',
    interval: 'month',
    priceCents: 0,
    currency: 'usd',
    features: FREE_FEATURES,
    limits: {
      searchResults: 5,
      parcelLimit: 5,
      analysisRunsPerMonth: 0,
      summaryRunsPerMonth: 0,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    description:
      'Full data access, PostGIS spatial analysis, and AI planning summaries.',
    interval: 'month',
    priceCents: 4900,
    currency: 'usd',
    features: PRO_FEATURES,
    limits: {
      searchResults: 8,
      parcelLimit: null,
      analysisRunsPerMonth: 100,
      summaryRunsPerMonth: 50,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    description:
      'Everything in Pro plus data ingestion, admin management, and unlimited usage.',
    interval: 'month',
    priceCents: null,
    currency: 'usd',
    features: ENTERPRISE_FEATURES,
    limits: {
      searchResults: 20,
      parcelLimit: null,
      analysisRunsPerMonth: null,
      summaryRunsPerMonth: null,
    },
  },
};

/** All plans as an ordered list (free → pro → enterprise). */
export const PLAN_LIST: BillingPlan[] = [
  PLAN_CATALOG.free,
  PLAN_CATALOG.pro,
  PLAN_CATALOG.enterprise,
];

/** Get a plan by id (defaults to `free` for unknown ids). */
export function getPlan(planId: BillingPlanId): BillingPlan {
  return PLAN_CATALOG[planId] ?? PLAN_CATALOG.free;
}

/** Whether a plan includes a feature. */
export function hasFeature(plan: BillingPlan, feature: BillingFeature): boolean {
  return plan.features.includes(feature);
}

/** Type guard for valid plan ids. */
export function isBillingPlanId(value: unknown): value is BillingPlanId {
  return value === 'free' || value === 'pro' || value === 'enterprise';
}
