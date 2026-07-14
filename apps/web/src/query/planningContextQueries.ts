import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PlanningContextBuildJob } from '@sitelens/shared';
import {
  buildPlanningContext,
  getPlanningContextBuildJob,
  getPlanningContextDetail,
  listPlanningContexts,
} from '../api/planningContextsApi';
import type { PlaceSearchResult } from '../api/geocodingApi';
import { isApiConfigured } from '../api/client';

export const planningContextKeys = {
  all: ['planning-contexts'] as const,
  detail: (contextId: string) =>
    ['planning-context', contextId] as const,
  buildJob: (jobId: string) =>
    ['planning-context-build-job', jobId] as const,
};

export function usePlanningContexts(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: planningContextKeys.all,
    queryFn: listPlanningContexts,
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
    queryFn: () => getPlanningContextDetail(contextId!),
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
      const { job } = await getPlanningContextBuildJob(jobId!);
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
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (place: PlaceSearchResult) => buildPlanningContext(place),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: planningContextKeys.all,
      });
    },
  });
}
