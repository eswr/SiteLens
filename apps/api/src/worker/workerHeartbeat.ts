import { getRedisClient } from '../cache/cacheClient.js';
import { loadConfig } from '../config.js';

/** Process-level heartbeat interval for the pg-boss worker. */
export const WORKER_HEARTBEAT_INTERVAL_MS = 10_000;

/** pg-boss worker considered unhealthy when heartbeat is older than this. */
export const WORKER_HEARTBEAT_STALE_MS = 60_000;

export type WorkerHeartbeatSource = 'redis' | 'memory' | 'missing';

const HEARTBEAT_KEY_SUFFIX = 'planning-context-worker:heartbeat';

/** In-memory fallback for tests / single-process (not shared across machines). */
let memoryHeartbeatAtMs: number | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

function heartbeatKey(): string {
  const namespace = loadConfig().providerRateLimitNamespace;
  return `${namespace}:${HEARTBEAT_KEY_SUFFIX}`;
}

/** Format heartbeat fields for the jobs/health payload (pure; testable). */
export function formatWorkerHeartbeatFields(
  heartbeatAtMs: number | null | undefined,
  nowMs: number = Date.now(),
  source: WorkerHeartbeatSource = heartbeatAtMs == null ? 'missing' : 'memory',
): {
  workerHeartbeatAt: string | null;
  workerHeartbeatAgeSeconds: number | null;
  workerHeartbeatSource: WorkerHeartbeatSource;
} {
  if (heartbeatAtMs == null || !Number.isFinite(heartbeatAtMs)) {
    return {
      workerHeartbeatAt: null,
      workerHeartbeatAgeSeconds: null,
      workerHeartbeatSource: 'missing',
    };
  }
  const ageMs = Math.max(0, nowMs - heartbeatAtMs);
  return {
    workerHeartbeatAt: new Date(heartbeatAtMs).toISOString(),
    workerHeartbeatAgeSeconds: Math.floor(ageMs / 1000),
    workerHeartbeatSource: source === 'missing' ? 'memory' : source,
  };
}

export function isWorkerHeartbeatHealthy(
  heartbeatAtMs: number | null | undefined,
  nowMs: number = Date.now(),
  staleMs: number = WORKER_HEARTBEAT_STALE_MS,
): boolean {
  if (heartbeatAtMs == null || !Number.isFinite(heartbeatAtMs)) {
    return false;
  }
  return nowMs - heartbeatAtMs <= staleMs;
}

/** Persist a worker liveness pulse (Redis when ready, else memory). */
export async function writeWorkerHeartbeat(
  atMs: number = Date.now(),
): Promise<WorkerHeartbeatSource> {
  memoryHeartbeatAtMs = atMs;
  const redis = getRedisClient();
  if (!redis || redis.status !== 'ready') {
    return 'memory';
  }
  try {
    // Keep keys around long enough for stale detection + a grace window.
    await redis.set(
      heartbeatKey(),
      String(atMs),
      'PX',
      WORKER_HEARTBEAT_STALE_MS * 3,
    );
    return 'redis';
  } catch {
    // Memory still holds the pulse for same-process reads.
    return 'memory';
  }
}

/** Read the latest worker heartbeat timestamp (ms since epoch) + source. */
export async function readWorkerHeartbeat(): Promise<{
  atMs: number | null;
  source: WorkerHeartbeatSource;
}> {
  const redis = getRedisClient();
  if (redis && redis.status === 'ready') {
    try {
      const raw = await redis.get(heartbeatKey());
      if (raw != null) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) {
          memoryHeartbeatAtMs = parsed;
          return { atMs: parsed, source: 'redis' };
        }
      }
    } catch {
      // Fall through to memory.
    }
  }
  if (memoryHeartbeatAtMs != null) {
    return { atMs: memoryHeartbeatAtMs, source: 'memory' };
  }
  return { atMs: null, source: 'missing' };
}

/** @deprecated Prefer readWorkerHeartbeat(); kept for callers that only need ms. */
export async function readWorkerHeartbeatMs(): Promise<number | null> {
  const { atMs } = await readWorkerHeartbeat();
  return atMs;
}

/** Start the 10s heartbeat loop (pg-boss worker process). */
export function startWorkerHeartbeat(
  intervalMs: number = WORKER_HEARTBEAT_INTERVAL_MS,
): void {
  if (heartbeatTimer) {
    return;
  }
  void writeWorkerHeartbeat();
  heartbeatTimer = setInterval(() => {
    void writeWorkerHeartbeat();
  }, intervalMs);
  if (
    typeof heartbeatTimer === 'object' &&
    heartbeatTimer !== null &&
    'unref' in heartbeatTimer
  ) {
    heartbeatTimer.unref();
  }
}

export function stopWorkerHeartbeat(): void {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

/** Reset in-memory heartbeat (tests). */
export function resetWorkerHeartbeatForTests(): void {
  stopWorkerHeartbeat();
  memoryHeartbeatAtMs = null;
}
