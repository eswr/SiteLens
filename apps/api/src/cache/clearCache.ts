import '../loadEnv.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { deleteByPattern } from './cacheJson.js';
import {
  closeRedisClient,
  isCacheEnabled,
  waitForCacheReady,
} from './cacheClient.js';
import {
  ALL_CACHE_PATTERN,
  PLANNING_CACHE_PATTERNS,
  planningCachePatternsForContext,
} from './cacheKeys.js';

/** Clear planning-related cache keys (used after ingestion). Never throws. */
export async function clearPlanningCache(): Promise<number> {
  let removed = 0;
  for (const pattern of PLANNING_CACHE_PATTERNS) {
    removed += await deleteByPattern(pattern);
  }
  return removed;
}

/**
 * Clear planning-related cache keys for a single planning context.
 * Used after an external context build so other contexts stay warm.
 */
export async function clearPlanningCacheForContext(
  planningContextId: string,
): Promise<number> {
  let removed = 0;
  for (const pattern of planningCachePatternsForContext(planningContextId)) {
    removed += await deleteByPattern(pattern);
  }
  return removed;
}

/** Clear every SiteLens cache key. */
export async function clearAllCache(): Promise<number> {
  return deleteByPattern(ALL_CACHE_PATTERN);
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  (async () => {
    if (!isCacheEnabled()) {
      console.log('Cache is disabled (no REDIS_URL); nothing to clear.');
      return;
    }
    await waitForCacheReady();
    const removed = await clearAllCache();
    console.log(`Cleared ${removed} cache key(s) matching ${ALL_CACHE_PATTERN}.`);
  })()
    .then(() => closeRedisClient())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      void closeRedisClient().finally(() => process.exit(1));
    });
}
