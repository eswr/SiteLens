import type { CapabilityFlags, DemoUser } from '@sitelens/shared';

/**
 * Derive capability flags from a user's role and plan.
 *
 * - Entitlement (plan): analysis, summary, and full-data access require a
 *   `pro`/`enterprise` plan.
 * - Access control (role): data ingestion requires the `admin` role.
 * - Anonymous users get read-only, limited access.
 */
export function getCapabilities(user: DemoUser | null): CapabilityFlags {
  const paidPlan = user?.plan === 'pro' || user?.plan === 'enterprise';
  const isAdmin = user?.role === 'admin';

  return {
    canReadLayers: true,
    canReadParcels: true,
    canRunAnalysis: paidPlan,
    canGenerateSummary: paidPlan,
    canIngestData: isAdmin,
    canViewAllLayers: paidPlan,
  };
}

/** Coarse cache scope for entitlement-limited responses (`free` vs `pro`). */
export function accessScope(capabilities: CapabilityFlags): 'free' | 'pro' {
  return capabilities.canViewAllLayers ? 'pro' : 'free';
}
