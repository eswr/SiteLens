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
  canIngestData: boolean;
  canViewAllLayers: boolean;
}

export interface MeResponse {
  user: DemoUser | null;
  capabilities: CapabilityFlags;
}

/** Fetch the current demo user + capabilities from `GET /api/me`. */
export async function fetchMe(): Promise<MeResponse> {
  const { data } = await apiGetWithMeta<MeResponse>('/api/me');
  return data;
}
