/**
 * Stripe-style billing + entitlement types (demo-safe, no live checkout).
 * Production would map these to Stripe Products/Prices/Subscriptions.
 */

export type BillingPlanId = 'free' | 'pro' | 'enterprise';
export type BillingInterval = 'month' | 'year';

export type BillingFeature =
  | 'layers:read'
  | 'parcels:read'
  | 'parcels:full'
  | 'search:basic'
  | 'search:full'
  | 'analysis:run'
  | 'summary:generate'
  | 'external-context:build'
  | 'ingestion:manage'
  | 'admin:manage';

export interface BillingPlan {
  id: BillingPlanId;
  name: string;
  description: string;
  interval: BillingInterval;
  priceCents: number | null;
  currency: 'usd';
  stripePriceId?: string;
  features: BillingFeature[];
  limits: {
    searchResults: number;
    parcelLimit: number | null;
    analysisRunsPerMonth: number | null;
    summaryRunsPerMonth: number | null;
    /** Monthly external planning-context builds; `null` = unlimited. */
    externalContextBuildsPerMonth: number | null;
  };
}

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'none';

export interface SubscriptionState {
  plan: BillingPlanId;
  status: SubscriptionStatus;
  currentPeriodEnd?: string | null;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
}

export interface BillingContext {
  plan: BillingPlan;
  subscription: SubscriptionState;
  features: BillingFeature[];
}
