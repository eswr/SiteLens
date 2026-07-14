/** Types generated for queries found in "src/billing/queries/billing.sql" */
import { PreparedQuery } from '@pgtyped/runtime';

export type DateOrString = Date | string;

/** 'UpsertDemoAccount' parameters type */
export interface IUpsertDemoAccountParams {
  id: string;
  name: string;
  role: string;
  userId: string;
}

/** 'UpsertDemoAccount' return type */
export type IUpsertDemoAccountResult = void;

/** 'UpsertDemoAccount' query type */
export interface IUpsertDemoAccountQuery {
  params: IUpsertDemoAccountParams;
  result: IUpsertDemoAccountResult;
}

const upsertDemoAccountIR: any = {"usedParamSet":{"id":true,"userId":true,"name":true,"role":true},"params":[{"name":"id","required":true,"transform":{"type":"scalar"},"locs":[{"a":60,"b":63}]},{"name":"userId","required":true,"transform":{"type":"scalar"},"locs":[{"a":66,"b":73}]},{"name":"name","required":true,"transform":{"type":"scalar"},"locs":[{"a":76,"b":81}]},{"name":"role","required":true,"transform":{"type":"scalar"},"locs":[{"a":84,"b":89}]}],"statement":"INSERT INTO demo_accounts (id, user_id, name, role)\nVALUES (:id!, :userId!, :name!, :role!)\nON CONFLICT (id) DO UPDATE SET\n  name = EXCLUDED.name,\n  role = EXCLUDED.role,\n  updated_at = now()"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO demo_accounts (id, user_id, name, role)
 * VALUES (:id!, :userId!, :name!, :role!)
 * ON CONFLICT (id) DO UPDATE SET
 *   name = EXCLUDED.name,
 *   role = EXCLUDED.role,
 *   updated_at = now()
 * ```
 */
export const upsertDemoAccount = new PreparedQuery<IUpsertDemoAccountParams,IUpsertDemoAccountResult>(upsertDemoAccountIR);


/** 'GetBillingContextForAccount' parameters type */
export interface IGetBillingContextForAccountParams {
  accountId: string;
}

/** 'GetBillingContextForAccount' return type */
export interface IGetBillingContextForAccountResult {
  current_period_end: Date | null;
  plan: string;
  status: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

/** 'GetBillingContextForAccount' query type */
export interface IGetBillingContextForAccountQuery {
  params: IGetBillingContextForAccountParams;
  result: IGetBillingContextForAccountResult;
}

const getBillingContextForAccountIR: any = {"usedParamSet":{"accountId":true},"params":[{"name":"accountId","required":true,"transform":{"type":"scalar"},"locs":[{"a":230,"b":240}]}],"statement":"SELECT s.plan,\n       s.status,\n       s.stripe_subscription_id,\n       s.current_period_end,\n       c.stripe_customer_id\n  FROM subscriptions s\n  LEFT JOIN billing_customers c ON c.account_id = s.account_id\n WHERE s.account_id = :accountId!\n LIMIT 1"};

/**
 * Query generated from SQL:
 * ```
 * SELECT s.plan,
 *        s.status,
 *        s.stripe_subscription_id,
 *        s.current_period_end,
 *        c.stripe_customer_id
 *   FROM subscriptions s
 *   LEFT JOIN billing_customers c ON c.account_id = s.account_id
 *  WHERE s.account_id = :accountId!
 *  LIMIT 1
 * ```
 */
export const getBillingContextForAccount = new PreparedQuery<IGetBillingContextForAccountParams,IGetBillingContextForAccountResult>(getBillingContextForAccountIR);


/** 'UpsertDemoSubscription' parameters type */
export interface IUpsertDemoSubscriptionParams {
  accountId: string;
  plan: string;
}

/** 'UpsertDemoSubscription' return type */
export type IUpsertDemoSubscriptionResult = void;

/** 'UpsertDemoSubscription' query type */
export interface IUpsertDemoSubscriptionQuery {
  params: IUpsertDemoSubscriptionParams;
  result: IUpsertDemoSubscriptionResult;
}

const upsertDemoSubscriptionIR: any = {"usedParamSet":{"accountId":true,"plan":true},"params":[{"name":"accountId","required":true,"transform":{"type":"scalar"},"locs":[{"a":61,"b":71}]},{"name":"plan","required":true,"transform":{"type":"scalar"},"locs":[{"a":74,"b":79}]}],"statement":"INSERT INTO subscriptions (account_id, plan, status)\nVALUES (:accountId!, :plan!, 'active')\nON CONFLICT (account_id)\n  DO UPDATE SET plan = EXCLUDED.plan, status = 'active', updated_at = now()"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO subscriptions (account_id, plan, status)
 * VALUES (:accountId!, :plan!, 'active')
 * ON CONFLICT (account_id)
 *   DO UPDATE SET plan = EXCLUDED.plan, status = 'active', updated_at = now()
 * ```
 */
export const upsertDemoSubscription = new PreparedQuery<IUpsertDemoSubscriptionParams,IUpsertDemoSubscriptionResult>(upsertDemoSubscriptionIR);


/** 'UpsertStripeSubscription' parameters type */
export interface IUpsertStripeSubscriptionParams {
  accountId: string;
  plan: string;
  status: string;
  stripeSubscriptionId?: string | null | void;
}

/** 'UpsertStripeSubscription' return type */
export type IUpsertStripeSubscriptionResult = void;

/** 'UpsertStripeSubscription' query type */
export interface IUpsertStripeSubscriptionQuery {
  params: IUpsertStripeSubscriptionParams;
  result: IUpsertStripeSubscriptionResult;
}

const upsertStripeSubscriptionIR: any = {"usedParamSet":{"accountId":true,"plan":true,"status":true,"stripeSubscriptionId":true},"params":[{"name":"accountId","required":true,"transform":{"type":"scalar"},"locs":[{"a":85,"b":95}]},{"name":"plan","required":true,"transform":{"type":"scalar"},"locs":[{"a":98,"b":103}]},{"name":"status","required":true,"transform":{"type":"scalar"},"locs":[{"a":106,"b":113}]},{"name":"stripeSubscriptionId","required":false,"transform":{"type":"scalar"},"locs":[{"a":116,"b":136}]}],"statement":"INSERT INTO subscriptions (account_id, plan, status, stripe_subscription_id)\nVALUES (:accountId!, :plan!, :status!, :stripeSubscriptionId)\nON CONFLICT (account_id) DO UPDATE SET\n  plan = COALESCE(EXCLUDED.plan, subscriptions.plan),\n  status = EXCLUDED.status,\n  stripe_subscription_id = COALESCE(\n    EXCLUDED.stripe_subscription_id,\n    subscriptions.stripe_subscription_id\n  ),\n  updated_at = now()"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO subscriptions (account_id, plan, status, stripe_subscription_id)
 * VALUES (:accountId!, :plan!, :status!, :stripeSubscriptionId)
 * ON CONFLICT (account_id) DO UPDATE SET
 *   plan = COALESCE(EXCLUDED.plan, subscriptions.plan),
 *   status = EXCLUDED.status,
 *   stripe_subscription_id = COALESCE(
 *     EXCLUDED.stripe_subscription_id,
 *     subscriptions.stripe_subscription_id
 *   ),
 *   updated_at = now()
 * ```
 */
export const upsertStripeSubscription = new PreparedQuery<IUpsertStripeSubscriptionParams,IUpsertStripeSubscriptionResult>(upsertStripeSubscriptionIR);


/** 'IncrementUsageCounter' parameters type */
export interface IIncrementUsageCounterParams {
  accountId: string;
  feature: string;
  periodStart: DateOrString;
}

/** 'IncrementUsageCounter' return type */
export type IIncrementUsageCounterResult = void;

/** 'IncrementUsageCounter' query type */
export interface IIncrementUsageCounterQuery {
  params: IIncrementUsageCounterParams;
  result: IIncrementUsageCounterResult;
}

const incrementUsageCounterIR: any = {"usedParamSet":{"accountId":true,"feature":true,"periodStart":true},"params":[{"name":"accountId","required":true,"transform":{"type":"scalar"},"locs":[{"a":78,"b":88}]},{"name":"feature","required":true,"transform":{"type":"scalar"},"locs":[{"a":91,"b":99}]},{"name":"periodStart","required":true,"transform":{"type":"scalar"},"locs":[{"a":102,"b":114}]}],"statement":"INSERT INTO usage_counters (account_id, feature, period_start, count)\nVALUES (:accountId!, :feature!, :periodStart!, 1)\nON CONFLICT (account_id, feature, period_start)\n  DO UPDATE SET count = usage_counters.count + 1, updated_at = now()"};

/**
 * Query generated from SQL:
 * ```
 * INSERT INTO usage_counters (account_id, feature, period_start, count)
 * VALUES (:accountId!, :feature!, :periodStart!, 1)
 * ON CONFLICT (account_id, feature, period_start)
 *   DO UPDATE SET count = usage_counters.count + 1, updated_at = now()
 * ```
 */
export const incrementUsageCounter = new PreparedQuery<IIncrementUsageCounterParams,IIncrementUsageCounterResult>(incrementUsageCounterIR);


/** 'GetUsageCount' parameters type */
export interface IGetUsageCountParams {
  accountId: string;
  feature: string;
  periodStart: DateOrString;
}

/** 'GetUsageCount' return type */
export interface IGetUsageCountResult {
  count: number;
}

/** 'GetUsageCount' query type */
export interface IGetUsageCountQuery {
  params: IGetUsageCountParams;
  result: IGetUsageCountResult;
}

const getUsageCountIR: any = {"usedParamSet":{"accountId":true,"feature":true,"periodStart":true},"params":[{"name":"accountId","required":true,"transform":{"type":"scalar"},"locs":[{"a":55,"b":65}]},{"name":"feature","required":true,"transform":{"type":"scalar"},"locs":[{"a":84,"b":92}]},{"name":"periodStart","required":true,"transform":{"type":"scalar"},"locs":[{"a":116,"b":128}]}],"statement":"SELECT count\n  FROM usage_counters\n WHERE account_id = :accountId!\n   AND feature = :feature!\n   AND period_start = :periodStart!"};

/**
 * Query generated from SQL:
 * ```
 * SELECT count
 *   FROM usage_counters
 *  WHERE account_id = :accountId!
 *    AND feature = :feature!
 *    AND period_start = :periodStart!
 * ```
 */
export const getUsageCount = new PreparedQuery<IGetUsageCountParams,IGetUsageCountResult>(getUsageCountIR);


