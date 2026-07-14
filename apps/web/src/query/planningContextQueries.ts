import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  PlanningContext,
  PlanningContextBuildJob,
  PlanningContextDetailResponse,
  PlanningContextFeatureCounts,
} from '@sitelens/shared';
import {
  buildPlanningContext,
  getPlanningContextBuildJob,
  getPlanningContextDetail,
  listPlanningContexts,
} from '../api/planningContextsApi';
import type { PlaceSearchResult } from '../api/geocodingApi';
import { isApiConfigured } from '../api/client';
import { queryClient } from './queryClient';

export const planningContextKeys = {
  all: ['planning-contexts'] as const,
  detail: (contextId: string) =>
    ['planning-context', contextId] as const,
  buildJob: (jobId: string) =>
    ['planning-context-build-job', jobId] as const,
};

/** Server read: list planning contexts (TanStack Query / store helpers). */
export async function fetchPlanningContextsList(): Promise<PlanningContext[]> {
  return listPlanningContexts();
}

/** Server read: context detail + counts. */
export async function fetchPlanningContextDetail(
  contextId: string,
): Promise<PlanningContextDetailResponse> {
  return getPlanningContextDetail(contextId);
}

/** Server read: build job status. */
export async function fetchPlanningContextBuildJob(jobId: string): Promise<{
  job: PlanningContextBuildJob;
}> {
  return getPlanningContextBuildJob(jobId);
}

/** Server mutation: enqueue / reuse a planning-context build. */
export async function requestBuildPlanningContext(place: PlaceSearchResult) {
  return buildPlanningContext(place);
}

/** Invalidate list + detail after a terminal successful build. */
export async function invalidatePlanningContextsAfterBuild(
  contextId: string,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: planningContextKeys.all });
  await queryClient.invalidateQueries({
    queryKey: planningContextKeys.detail(contextId),
  });
}

/** Fetch detail after invalidation (used when applying terminal success). */
export async function refetchPlanningContextDetail(
  contextId: string,
): Promise<PlanningContextDetailResponse> {
  return queryClient.fetchQuery({
    queryKey: planningContextKeys.detail(contextId),
    queryFn: () => fetchPlanningContextDetail(contextId),
  });
}

export async function refetchPlanningContextsList(): Promise<PlanningContext[]> {
  return queryClient.fetchQuery({
    queryKey: planningContextKeys.all,
    queryFn: fetchPlanningContextsList,
  });
}

export function usePlanningContexts(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: planningContextKeys.all,
    queryFn: fetchPlanningContextsList,
    staleTime: 10_000,
    enabled: (options?.enabled ?? true) && isApiConfigured(),
  });
}

export function usePlanningContextDetail(
  contextId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: planningContextKeys.detail(contextId ?? ''),
    queryFn: () => fetchPlanningContextDetail(contextId!),
    staleTime: 10_000,
    enabled:
      Boolean(contextId) &&
      (options?.enabled ?? true) &&
      isApiConfigured(),
  });
}

export function useBuildJob(
  jobId: string | null | undefined,
  options?: {
    enabled?: boolean;
    watchActive?: boolean;
  },
) {
  return useQuery({
    queryKey: planningContextKeys.buildJob(jobId ?? ''),
    queryFn: async () => {
      const { job } = await fetchPlanningContextBuildJob(jobId!);
      return job;
    },
    staleTime: 0,
    retry: 0,
    enabled:
      Boolean(jobId) &&
      (options?.enabled ?? true) &&
      isApiConfigured(),
    refetchInterval: (query) => {
      if (!options?.watchActive) {
        return false;
      }
      const job = query.state.data as PlanningContextBuildJob | undefined;
      if (!job) {
        return 2000;
      }
      if (job.status === 'queued' || job.status === 'running') {
        return 2000;
      }
      return false;
    },
  });
}

export function useBuildPlanningContextMutation() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (place: PlaceSearchResult) =>
      requestBuildPlanningContext(place),
    onSuccess: async (data) => {
      await client.invalidateQueries({
        queryKey: planningContextKeys.all,
      });
      if (data.contextId) {
        await client.invalidateQueries({
          queryKey: planningContextKeys.detail(data.contextId),
        });
      }
    },
  });
}

export type { PlanningContextFeatureCounts };
