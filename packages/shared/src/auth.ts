/**
 * Auth + entitlement types shared by the API and web app.
 *
 * This is a lightweight, demo-only model (API keys mapped to fixed demo users).
 * Production would use OAuth/SSO, JWT/session cookies, and org/team membership.
 */

export type UserRole = 'viewer' | 'planner' | 'admin';
export type PlanTier = 'free' | 'pro' | 'enterprise';

export interface DemoUser {
  id: string;
  name: string;
  role: UserRole;
  plan: PlanTier;
}

export interface AuthContext {
  user: DemoUser | null;
  isAuthenticated: boolean;
}

/** Boolean capability flags derived from a user's role + plan. */
export interface CapabilityFlags {
  canReadLayers: boolean;
  canReadParcels: boolean;
  canRunAnalysis: boolean;
  canGenerateSummary: boolean;
  canBuildExternalContext: boolean;
  canIngestData: boolean;
  canViewAllLayers: boolean;
}
