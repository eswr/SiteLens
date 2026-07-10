import type { CacheStatus } from '@sitelens/shared';
import { getRedisClient, isCacheEnabled, logCacheError } from './cacheClient';
import { loadConfig } from '../config';

export interface CacheReadResult<T> {
  value: T | null;
  status: CacheStatus;
}

/** Read a JSON value from the cache. Never throws. */
export async function getJson<T>(key: string): Promise<CacheReadResult<T>> {
  if (!isCacheEnabled()) {
    return { value: null, status: 'disabled' };
  }
  const client = getRedisClient();
  if (!client) {
    return { value: null, status: 'disabled' };
  }
  try {
    const raw = await client.get(key);
    if (raw === null) {
      return { value: null, status: 'miss' };
    }
    return { value: JSON.parse(raw) as T, status: 'hit' };
  } catch (error) {
    logCacheError('get', error);
    return { value: null, status: 'error' };
  }
}

/** Write a JSON value with a TTL. Best-effort; never throws. */
export async function setJson<T>(
  key: string,
  value: T,
  ttlSeconds?: number,
): Promise<void> {
  if (!isCacheEnabled()) {
    return;
  }
  const client = getRedisClient();
  if (!client) {
    return;
  }
  const ttl = ttlSeconds ?? loadConfig().cacheDefaultTtlSeconds;
  try {
    await client.set(key, JSON.stringify(value), 'EX', ttl);
  } catch (error) {
    logCacheError('set', error);
  }
}

interface CachedPayload<T> {
  data: T;
  computedAt: string;
}

export interface CachedResult<T> {
  data: T;
  cache: CacheStatus;
  computedAt: string;
}

/**
 * Read-through cache helper: returns a cached value on hit, otherwise computes,
 * stores, and returns it. Reports the cache outcome. Redis failures never break
 * the compute path — a cache read error still returns a fresh computed value
 * (with `cache: "error"`).
 */
export async function cached<T>(options: {
  key: string;
  ttlSeconds: number;
  compute: () => Promise<T>;
}): Promise<CachedResult<T>> {
  if (!isCacheEnabled()) {
    const data = await options.compute();
    return { data, cache: 'disabled', computedAt: new Date().toISOString() };
  }

  const read = await getJson<CachedPayload<T>>(options.key);
  if (read.status === 'hit' && read.value) {
    return {
      data: read.value.data,
      cache: 'hit',
      computedAt: read.value.computedAt,
    };
  }

  const data = await options.compute();
  const computedAt = new Date().toISOString();
  await setJson<CachedPayload<T>>(
    options.key,
    { data, computedAt },
    options.ttlSeconds,
  );

  return { data, cache: read.status === 'error' ? 'error' : 'miss', computedAt };
}

/** Delete all keys matching a glob pattern; returns the count removed. */
export async function deleteByPattern(pattern: string): Promise<number> {
  const client = getRedisClient();
  if (!client) {
    return 0;
  }
  let removed = 0;
  try {
    const stream = client.scanStream({ match: pattern, count: 200 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length > 0) {
        removed += await client.del(...keys);
      }
    }
  } catch (error) {
    logCacheError('deleteByPattern', error);
  }
  return removed;
}
