/* @name UpsertDemoAccount */
INSERT INTO demo_accounts (id, user_id, name, role)
VALUES (:id!, :userId!, :name!, :role!)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  updated_at = now();

/* @name GetBillingContextForAccount */
SELECT s.plan,
       s.status,
       s.stripe_subscription_id,
       s.current_period_end,
       c.stripe_customer_id
  FROM subscriptions s
  LEFT JOIN billing_customers c ON c.account_id = s.account_id
 WHERE s.account_id = :accountId!
 LIMIT 1;

/* @name UpsertDemoSubscription */
INSERT INTO subscriptions (account_id, plan, status)
VALUES (:accountId!, :plan!, 'active')
ON CONFLICT (account_id)
  DO UPDATE SET plan = EXCLUDED.plan, status = 'active', updated_at = now();

/* @name UpsertStripeSubscription */
INSERT INTO subscriptions (account_id, plan, status, stripe_subscription_id)
VALUES (:accountId!, :plan!, :status!, :stripeSubscriptionId)
ON CONFLICT (account_id) DO UPDATE SET
  plan = COALESCE(EXCLUDED.plan, subscriptions.plan),
  status = EXCLUDED.status,
  stripe_subscription_id = COALESCE(
    EXCLUDED.stripe_subscription_id,
    subscriptions.stripe_subscription_id
  ),
  updated_at = now();

/* @name IncrementUsageCounter */
INSERT INTO usage_counters (account_id, feature, period_start, count)
VALUES (:accountId!, :feature!, :periodStart!, 1)
ON CONFLICT (account_id, feature, period_start)
  DO UPDATE SET count = usage_counters.count + 1, updated_at = now();

/* @name GetUsageCount */
SELECT count
  FROM usage_counters
 WHERE account_id = :accountId!
   AND feature = :feature!
   AND period_start = :periodStart!;
