import Redis from 'ioredis';
import { loadConfig } from '../config';

let client: Redis | null = null;
let initialized = false;
let enabled = false;
let loggedError = false;

/** Whether caching is configured (Redis URL present and not disabled). */
export function isCacheEnabled(): boolean {
  // Ensure init has run so `enabled` reflects config.
  getRedisClient();
  return enabled;
}

/** Safe, throttled logging for cache errors (never throws). */
export function logCacheError(context: string, error: unknown): void {
  if (loggedError) {
    return;
  }
  loggedError = true;
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[cache] ${context}: ${message} (further cache errors suppressed)`);
}

/**
 * Get the Redis client, creating it lazily. Returns `null` when caching is
 * disabled or unconfigured. Never throws — connection errors are logged and the
 * app continues to work without a cache.
 */
export function getRedisClient(): Redis | null {
  if (initialized) {
    return client;
  }
  initialized = true;

  const config = loadConfig();
  if (!config.cacheEnabled || !config.redisUrl) {
    enabled = false;
    return null;
  }

  try {
    client = new Redis(config.redisUrl, {
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      // Fail fast (no command hang) when Redis is down so routes fall back to
      // the DB result; keep reconnecting so caching resumes when Redis returns.
      enableOfflineQueue: false,
      connectTimeout: 1000,
      retryStrategy: (times) => Math.min(times * 200, 2000),
    });
    client.on('error', (error) => logCacheError('connection', error));
    enabled = true;
    return client;
  } catch (error) {
    logCacheError('init', error);
    enabled = false;
    client = null;
    return null;
  }
}

/**
 * Wait until the client is `ready` (or times out). Useful for eager startup
 * connection and one-shot scripts so their first command doesn't race the
 * connection handshake.
 */
export async function waitForCacheReady(timeoutMs = 2000): Promise<boolean> {
  const active = getRedisClient();
  if (!active) {
    return false;
  }
  if (active.status === 'ready') {
    return true;
  }
  return new Promise((resolve) => {
    const cleanup = () => {
      clearTimeout(timer);
      active.off('ready', onReady);
    };
    const onReady = () => {
      cleanup();
      resolve(true);
    };
    const timer = setTimeout(() => {
      cleanup();
      resolve(active.status === 'ready');
    }, timeoutMs);
    active.once('ready', onReady);
  });
}

/** Close the Redis client (for graceful shutdown, scripts, and tests). */
export async function closeRedisClient(): Promise<void> {
  if (client) {
    try {
      await client.quit();
    } catch {
      // Ignore shutdown errors.
    }
    client = null;
  }
  initialized = false;
  enabled = false;
}
