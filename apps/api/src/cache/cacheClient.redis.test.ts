import '../loadEnv.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteByPattern, getJson, setJson } from './cacheJson.js';
import { closeRedisClient } from './cacheClient.js';

// Live Redis round-trip tests. Skipped unless RUN_REDIS_TESTS=true AND REDIS_URL
// is set (e.g. `REDIS_URL=redis://localhost:6389 npm run test:redis`), so the
// default suite never requires Docker/Redis.
const runRedisTests =
  process.env.RUN_REDIS_TESTS === 'true' && Boolean(process.env.REDIS_URL);

describe.skipIf(!runRedisTests)('cache (integration)', () => {
  beforeAll(async () => {
    // Warm up: the client connects asynchronously, so poll until a command
    // succeeds (status !== "error") before running assertions.
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const read = await getJson('sitelens:test:v1:warmup');
      if (read.status !== 'error') {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  });

  afterAll(async () => {
    await deleteByPattern('sitelens:test:*');
    await closeRedisClient();
  });

  it('round-trips a JSON value with a TTL', async () => {
    await setJson('sitelens:test:v1:roundtrip', { a: 1, b: 'x' }, 30);
    const read = await getJson<{ a: number; b: string }>(
      'sitelens:test:v1:roundtrip',
    );
    expect(read.status).toBe('hit');
    expect(read.value).toEqual({ a: 1, b: 'x' });
  });

  it('reports a miss for an unknown key', async () => {
    const read = await getJson('sitelens:test:v1:missing');
    expect(read.status).toBe('miss');
    expect(read.value).toBeNull();
  });

  it('deletes keys by pattern', async () => {
    await setJson('sitelens:test:v1:del-a', { n: 1 }, 30);
    await setJson('sitelens:test:v1:del-b', { n: 2 }, 30);
    const removed = await deleteByPattern('sitelens:test:v1:del-*');
    expect(removed).toBeGreaterThanOrEqual(2);
  });
});
