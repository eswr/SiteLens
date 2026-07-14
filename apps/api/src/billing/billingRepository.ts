import type {
  BillingContext,
  BillingFeature,
  BillingPlanId,
  SubscriptionState,
} from '@sitelens/shared';
import { getPlan, isBillingPlanId } from '@sitelens/shared';
import { getPool } from '../db/pool.js';
import { getUserById } from '../auth/demoUsers.js';
import {
  getBillingContextForAccount,
  getUsageCount,
  incrementUsageCounter,
  upsertDemoAccount,
  upsertDemoSubscription,
  upsertStripeSubscription,
} from './queries/billing.queries.js';

let loggedFallback = false;

function logFallback(context: string, error: unknown): void {
  if (loggedFallback) {
    return;
  }
  loggedFallback = true;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(
    `[billing] ${context}: falling back to demo plan (${message}) (further billing fallback logs suppressed)`,
  );
}

function periodStart(date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}-01`;
}

/**
 * Deterministic, DB-free billing context from the demo user's default plan.
 * Used as a fallback when the billing DB is unavailable or unseeded.
 */
export function demoFallbackContext(userId: string | null): BillingContext {
  const user = getUserById(userId ?? undefined);
  const planId: BillingPlanId = user?.plan ?? 'free';
  const plan = getPlan(planId);
  const subscription: SubscriptionState = {
    plan: plan.id,
    status: user ? 'active' : 'none',
  };
  return { plan, subscription, features: plan.features };
}

function contextForPlan(
  planId: BillingPlanId,
  subscription: SubscriptionState,
): BillingContext {
  const plan = getPlan(planId);
  return { plan, subscription, features: plan.features };
}

async function ensureAccount(userId: string): Promise<void> {
  const user = getUserById(userId);
  await upsertDemoAccount.run(
    {
      id: userId,
      userId,
      name: user?.name ?? userId,
      role: user?.role ?? 'viewer',
    },
    getPool(),
  );
}

function isSubscriptionStatus(
  value: string,
): value is SubscriptionState['status'] {
  return (
    value === 'none' ||
    value === 'active' ||
    value === 'canceled' ||
    value === 'past_due' ||
    value === 'trialing'
  );
}

/** Resolve billing context for a user (DB subscription, else demo fallback). */
export async function getBillingContextForUser(
  userId: string | null,
): Promise<BillingContext> {
  if (!userId) {
    return demoFallbackContext(null);
  }
  try {
    const rows = await getBillingContextForAccount.run(
      { accountId: userId },
      getPool(),
    );
    const row = rows[0];
    if (
      row &&
      isBillingPlanId(row.plan) &&
      isSubscriptionStatus(row.status)
    ) {
      return contextForPlan(row.plan, {
        plan: row.plan,
        status: row.status,
        currentPeriodEnd: row.current_period_end
          ? row.current_period_end.toISOString()
          : null,
        stripeSubscriptionId: row.stripe_subscription_id,
        stripeCustomerId: row.stripe_customer_id,
      });
    }
    return demoFallbackContext(userId);
  } catch (error) {
    logFallback('getBillingContextForUser', error);
    return demoFallbackContext(userId);
  }
}

/** Update a demo user's subscription plan (persisted). */
export async function setDemoPlanForUser(
  userId: string,
  plan: BillingPlanId,
): Promise<BillingContext> {
  await ensureAccount(userId);
  await upsertDemoSubscription.run(
    { accountId: userId, plan },
    getPool(),
  );
  return getBillingContextForUser(userId);
}

export interface StripeSubscriptionUpdate {
  accountId: string;
  plan?: BillingPlanId;
  status: SubscriptionState['status'];
  stripeSubscriptionId?: string | null;
}

/** Apply a (Stripe-shaped) subscription event to the DB. Best-effort. */
export async function applyStripeSubscriptionEvent(
  update: StripeSubscriptionUpdate,
): Promise<void> {
  await ensureAccount(update.accountId);
  await upsertStripeSubscription.run(
    {
      accountId: update.accountId,
      plan: update.plan ?? 'free',
      status: update.status,
      stripeSubscriptionId: update.stripeSubscriptionId ?? null,
    },
    getPool(),
  );
}

/** Increment a usage counter for the current month. Never throws. */
export async function recordUsage(
  userId: string,
  feature: BillingFeature,
): Promise<void> {
  try {
    await ensureAccount(userId);
    await incrementUsageCounter.run(
      {
        accountId: userId,
        feature,
        periodStart: periodStart(),
      },
      getPool(),
    );
  } catch (error) {
    console.warn(
      `[billing] recordUsage skipped for ${feature}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

/** Read a usage counter for the current month (0 on any error). */
export async function getUsage(
  userId: string,
  feature: BillingFeature,
): Promise<number> {
  try {
    const rows = await getUsageCount.run(
      {
        accountId: userId,
        feature,
        periodStart: periodStart(),
      },
      getPool(),
    );
    return rows[0]?.count ?? 0;
  } catch {
    return 0;
  }
}
