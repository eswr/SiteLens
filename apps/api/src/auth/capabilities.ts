import type {
  BillingContext,
  BillingPlanId,
  CapabilityFlags,
  DemoUser,
} from '@sitelens/shared';

/**
 * Derive capability flags from billing plan features + the user's role.
 *
 * - Product access (analysis, summary, full data) comes from **billing plan
 *   features**.
 * - Administrative access (ingestion/admin) also requires the **admin role**,
 *   so a lower-role user on an enterprise plan still can't manage ingestion.
 */
export function getCapabilities(
  user: DemoUser | null,
  billing: BillingContext,
): CapabilityFlags {
  const has = (feature: string): boolean => billing.features.includes(feature as never);
  const isAdmin = user?.role === 'admin';

  return {
    canReadLayers: has('layers:read'),
    canReadParcels: has('parcels:read'),
    canRunAnalysis: has('analysis:run'),
    canGenerateSummary: has('summary:generate'),
    canIngestData: isAdmin && has('ingestion:manage'),
    canViewAllLayers: has('parcels:full'),
  };
}

/** Cache scope derived from the billing plan (`free` / `pro` / `enterprise`). */
export function accessScope(billing: BillingContext): BillingPlanId {
  return billing.plan.id;
}
