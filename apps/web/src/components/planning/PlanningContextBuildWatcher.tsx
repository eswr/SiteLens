import { useEffect, useRef } from 'react';
import { useBuildJob } from '../../query/planningContextQueries';
import { usePlanningContextStore } from '../../store/planningContextStore';

const BUILD_WATCH_MAX_MS = 120_000;

/**
 * Polls the active build job via TanStack Query while the user is watching.
 * Cancel watching disables polling without cancelling the backend job.
 */
export default function PlanningContextBuildWatcher() {
  const watchedBuildJobId = usePlanningContextStore(
    (state) => state.watchedBuildJobId,
  );
  const watchingCancelled = usePlanningContextStore(
    (state) => state.watchingCancelled,
  );
  const watchStartedAtMs = usePlanningContextStore(
    (state) => state.watchStartedAtMs,
  );
  const onBuildJobUpdate = usePlanningContextStore(
    (state) => state.onBuildJobUpdate,
  );
  const onBuildWatchTimeout = usePlanningContextStore(
    (state) => state.onBuildWatchTimeout,
  );

  const watchActive = Boolean(watchedBuildJobId) && !watchingCancelled;
  const { data: job } = useBuildJob(watchedBuildJobId, {
    enabled: watchActive,
    watchActive,
  });

  const lastHandledKey = useRef<string | null>(null);

  useEffect(() => {
    if (!watchActive || !job) {
      return;
    }
    const key = `${job.id}:${job.status}:${job.updatedAt}`;
    if (lastHandledKey.current === key) {
      return;
    }
    lastHandledKey.current = key;
    void onBuildJobUpdate(job);
  }, [job, onBuildJobUpdate, watchActive]);

  useEffect(() => {
    if (!watchActive || watchStartedAtMs == null) {
      return;
    }
    const remaining = BUILD_WATCH_MAX_MS - (Date.now() - watchStartedAtMs);
    if (remaining <= 0) {
      onBuildWatchTimeout();
      return;
    }
    const timer = window.setTimeout(() => {
      onBuildWatchTimeout();
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [onBuildWatchTimeout, watchActive, watchStartedAtMs, watchedBuildJobId]);

  return null;
}
