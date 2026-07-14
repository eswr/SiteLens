import { apiGetWithMeta } from './client';

export type UserRole = 'viewer' | 'planner' | 'admin';
export type PlanTier = 'free' | 'pro' | 'enterprise';

export interface DemoUser {
  id: string;
  name: string;
  role: UserRole;
  plan: PlanTier;
}

export interface CapabilityFlags {
  canReadLayers: boolean;
  canReadParcels: boolean;
  canRunAnalysis: boolean;
  canGenerateSummary: boolean;
  canBuildExternalContext: boolean;
  canIngestData: boolean;
  canViewAllLayers: boolean;
}

export interface BillingPlanSummary {
  id: PlanTier;
  name: string;
  description: string;
  priceCents: number | null;
  features: string[];
}

export interface BillingSubscription {
  plan: PlanTier;
  status: string;
  currentPeriodEnd?: string | null;
}

export interface BillingContext {
  plan: BillingPlanSummary;
  subscription: BillingSubscription;
  features: string[];
}

export interface MeResponse {
  user: DemoUser | null;
  capabilities: CapabilityFlags;
  billing: BillingContext;
}

/** Fetch the current demo user + capabilities + billing from `GET /api/me`. */
export async function fetchMe(): Promise<MeResponse> {
  const { data } = await apiGetWithMeta<MeResponse>('/api/me');
  return data;
}
