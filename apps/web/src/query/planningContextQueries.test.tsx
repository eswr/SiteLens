import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getPlanningContextBuildJob, isApiConfigured } = vi.hoisted(() => ({
  getPlanningContextBuildJob: vi.fn(),
  isApiConfigured: vi.fn(() => true),
}));

vi.mock('../api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/client')>();
  return { ...actual, isApiConfigured };
});

vi.mock('../api/planningContextsApi', () => ({
  getPlanningContextBuildJob,
  getPlanningContextDetail: vi.fn(),
  listPlanningContexts: vi.fn(),
  buildPlanningContext: vi.fn(),
}));

const { useBuildJob } = await import('./planningContextQueries');

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

describe('useBuildJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isApiConfigured.mockReturnValue(true);
  });

  it('stops refetching after a terminal status', async () => {
    getPlanningContextBuildJob.mockResolvedValue({
      job: {
        id: 'job-1',
        planningContextId: 'ctx-1',
        status: 'succeeded',
        place: {
          id: 'p',
          label: 'P',
          displayName: 'P',
          latitude: 1,
          longitude: 2,
          provider: 'static-demo',
        },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });

    const { result } = renderHook(
      () => useBuildJob('job-1', { enabled: true, watchActive: true }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.status).toBe('succeeded');
    expect(result.current.isFetching).toBe(false);
  });

  it('does not fetch when polling is disabled (cancel watching)', async () => {
    const { result } = renderHook(
      () => useBuildJob('job-1', { enabled: false, watchActive: false }),
      { wrapper: createWrapper() },
    );
    expect(result.current.fetchStatus).toBe('idle');
    expect(getPlanningContextBuildJob).not.toHaveBeenCalled();
  });
});
