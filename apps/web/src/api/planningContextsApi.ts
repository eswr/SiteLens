import type {
  BuildPlanningContextResponse,
  PlanningContext,
  PlanningContextDetailResponse,
} from '@sitelens/shared';
import type { PlaceSearchResult } from './geocodingApi';
import { apiGet, apiPostWithMeta } from './client';

/** List available planning contexts (Sydney demo + any generated external). */
export async function listPlanningContexts(): Promise<PlanningContext[]> {
  return apiGet<PlanningContext[]>('/api/planning-contexts');
}

/** Fetch one planning context plus layer feature counts. */
export async function getPlanningContextDetail(
  id: string,
): Promise<PlanningContextDetailResponse> {
  return apiGet<PlanningContextDetailResponse>(
    `/api/planning-contexts/${encodeURIComponent(id)}`,
  );
}

/**
 * Explicitly build an external planning context for a selected worldwide place.
 * Backend proxies Overpass — the browser never calls the provider.
 */
export async function buildPlanningContext(
  place: PlaceSearchResult,
): Promise<BuildPlanningContextResponse> {
  const { data } = await apiPostWithMeta<BuildPlanningContextResponse>(
    '/api/planning-contexts/build',
    {
      source: 'external-osm',
      place: {
        id: place.id,
        label: place.label,
        displayName: place.displayName,
        latitude: place.latitude,
        longitude: place.longitude,
        boundingBox: place.boundingBox,
        provider: place.provider,
      },
    },
  );
  return data;
}
