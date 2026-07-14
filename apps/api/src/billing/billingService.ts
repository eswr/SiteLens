import type { FastifyRequest } from 'fastify';
import type {
  BillingContext,
  BillingFeature,
  CapabilityFlags,
  DemoUser,
} from '@sitelens/shared';
import { hasFeature } from '@sitelens/shared';
import { getBillingContextForUser, getUsage } from './billingRepository.js';
import { getCapabilities } from '../auth/capabilities.js';
import { HttpError } from '../auth/requireCapability.js';

export interface RequestBilling {
  user: DemoUser | null;
  billing: BillingContext;
  capabilities: CapabilityFlags;
}

/** Resolve the billing context + capabilities for a request. */
export async function resolveBilling(
  request: FastifyRequest,
): Promise<RequestBilling> {
  const user = request.auth?.user ?? null;
  const billing = await getBillingContextForUser(user?.id ?? null);
  const capabilities = getCapabilities(user, billing);
  return { user, billing, capabilities };
}

const FEATURE_MESSAGES: Partial<Record<BillingFeature, string>> = {
  'analysis:run': 'Spatial analysis requires the Pro or Enterprise plan.',
  'summary:generate':
    'AI planning summaries require the Pro or Enterprise plan.',
  'external-context:build':
    'Building external planning contexts requires the Pro or Enterprise plan (and available monthly build quota).',
  'ingestion:manage': 'Data ingestion requires an Enterprise admin account.',
  'parcels:full': 'Full parcel access requires the Pro or Enterprise plan.',
};

/** Throw `403 FORBIDDEN` if the plan lacks a feature. */
export function assertFeature(
  billing: BillingContext,
  feature: BillingFeature,
): void {
  if (!hasFeature(billing.plan, feature)) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      FEATURE_MESSAGES[feature] ?? `Your plan does not include "${feature}".`,
    );
  }
}

/**
 * Throw `429 ENTITLEMENT_LIMIT_EXCEEDED` if the user has exhausted a metered
 * feature this period. `null` limit = unlimited.
 */
export async function assertUsageWithinLimit(
  userId: string,
  feature: BillingFeature,
  limit: number | null,
): Promise<void> {
  if (limit === null) {
    return;
  }
  const used = await getUsage(userId, feature);
  if (used >= limit) {
    throw new HttpError(
      429,
      'ENTITLEMENT_LIMIT_EXCEEDED',
      `Monthly limit of ${limit} for "${feature}" reached on your plan. Upgrade for more.`,
    );
  }
}
