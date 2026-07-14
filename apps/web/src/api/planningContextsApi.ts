import type {
  BuildPlanningContextJobResponse,
  PlanningContext,
  PlanningContextBuildJobStatusResponse,
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

/** Poll status for an async planning-context build job. */
export async function getPlanningContextBuildJob(
  jobId: string,
): Promise<PlanningContextBuildJobStatusResponse> {
  return apiGet<PlanningContextBuildJobStatusResponse>(
    `/api/planning-contexts/jobs/${encodeURIComponent(jobId)}`,
  );
}

/**
 * Explicitly enqueue an external planning context build for a selected place.
 * Backend proxies Overpass — the browser never calls the provider.
 * Returns a job id; poll GET /jobs/:jobId until terminal.
 */
export async function buildPlanningContext(
  place: PlaceSearchResult,
): Promise<BuildPlanningContextJobResponse> {
  const { data } = await apiPostWithMeta<BuildPlanningContextJobResponse>(
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
