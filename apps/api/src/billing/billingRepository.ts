import type {
  BillingContext,
  BillingFeature,
  BillingPlanId,
  SubscriptionState,
} from '@sitelens/shared';
import { getPlan, isBillingPlanId } from '@sitelens/shared';
import { getPool } from '../db/pool';
import { getUserById } from '../auth/demoUsers';

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
  await getPool().query(
    `INSERT INTO demo_accounts (id, user_id, name, role)
     VALUES ($1, $1, $2, $3)
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, updated_at = now()`,
    [userId, user?.name ?? userId, user?.role ?? 'viewer'],
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
    const result = await getPool().query<{
      plan: string;
      status: SubscriptionState['status'];
      stripe_subscription_id: string | null;
      stripe_customer_id: string | null;
      current_period_end: Date | null;
    }>(
      `SELECT s.plan, s.status, s.stripe_subscription_id, s.current_period_end,
              c.stripe_customer_id
         FROM subscriptions s
         LEFT JOIN billing_customers c ON c.account_id = s.account_id
        WHERE s.account_id = $1
        LIMIT 1`,
      [userId],
    );
    const row = result.rows[0];
    if (row && isBillingPlanId(row.plan)) {
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
  await getPool().query(
    `INSERT INTO subscriptions (account_id, plan, status)
     VALUES ($1, $2, 'active')
     ON CONFLICT (account_id)
       DO UPDATE SET plan = EXCLUDED.plan, status = 'active', updated_at = now()`,
    [userId, plan],
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
  await getPool().query(
    `INSERT INTO subscriptions (account_id, plan, status, stripe_subscription_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (account_id) DO UPDATE SET
       plan = COALESCE(EXCLUDED.plan, subscriptions.plan),
       status = EXCLUDED.status,
       stripe_subscription_id = COALESCE(EXCLUDED.stripe_subscription_id, subscriptions.stripe_subscription_id),
       updated_at = now()`,
    [
      update.accountId,
      update.plan ?? 'free',
      update.status,
      update.stripeSubscriptionId ?? null,
    ],
  );
}

/** Increment a usage counter for the current month. Never throws. */
export async function recordUsage(
  userId: string,
  feature: BillingFeature,
): Promise<void> {
  try {
    await ensureAccount(userId);
    await getPool().query(
      `INSERT INTO usage_counters (account_id, feature, period_start, count)
       VALUES ($1, $2, $3, 1)
       ON CONFLICT (account_id, feature, period_start)
         DO UPDATE SET count = usage_counters.count + 1, updated_at = now()`,
      [userId, feature, periodStart()],
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
    const result = await getPool().query<{ count: number }>(
      `SELECT count FROM usage_counters
        WHERE account_id = $1 AND feature = $2 AND period_start = $3`,
      [userId, feature, periodStart()],
    );
    return result.rows[0]?.count ?? 0;
  } catch {
    return 0;
  }
}
