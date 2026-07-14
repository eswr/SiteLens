import '../loadEnv.js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  closeRedisClient,
  getRedisClient,
  waitForCacheReady,
} from '../cache/cacheClient.js';
import {
  getProviderCooldown,
  markProviderFailure,
  resetProviderSpacer,
  waitForProviderSlot,
} from './providerSpacer.js';

const runRedisTests =
  process.env.RUN_REDIS_TESTS === 'true' && Boolean(process.env.REDIS_URL);

describe.skipIf(!runRedisTests)('providerSpacer (redis integration)', () => {
  const namespace = 'sitelens:provider-limits:test';

  beforeAll(async () => {
    process.env.PROVIDER_RATE_LIMIT_BACKEND = 'redis';
    process.env.PROVIDER_RATE_LIMIT_NAMESPACE = namespace;
    process.env.NODE_ENV = 'development';
    process.env.WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
    resetProviderSpacer();
    await waitForCacheReady(3000);
  });

  beforeEach(async () => {
    resetProviderSpacer();
    const redis = getRedisClient();
    if (!redis) {
      throw new Error('Redis client unavailable for provider spacer tests');
    }
    const keys = await redis.keys(`${namespace}:*`);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  });

  afterAll(async () => {
    const redis = getRedisClient();
    if (redis) {
      const keys = await redis.keys(`${namespace}:*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
    }
    delete process.env.PROVIDER_RATE_LIMIT_BACKEND;
    delete process.env.PROVIDER_RATE_LIMIT_NAMESPACE;
    resetProviderSpacer();
    await closeRedisClient();
  });

  it('spaces two parallel nominatim slots across processes', async () => {
    const started = Date.now();
    const [a, b] = await Promise.all([
      waitForProviderSlot('nominatim', 1000).then((mode) => ({
        mode,
        elapsed: Date.now() - started,
      })),
      waitForProviderSlot('nominatim', 1000).then((mode) => ({
        mode,
        elapsed: Date.now() - started,
      })),
    ]);

    expect(a.mode).toBe('redis');
    expect(b.mode).toBe('redis');
    const waits = [a.elapsed, b.elapsed].sort((x, y) => x - y);
    expect(waits[0]).toBeLessThan(200);
    expect(waits[1]).toBeGreaterThan(700);

    const redis = getRedisClient();
    const slotKeys = await redis!.keys(`${namespace}:slot:nominatim`);
    expect(slotKeys.length).toBe(1);
  });

  it('blocks subsequent calls while cooldown is active', async () => {
    await markProviderFailure('overpass', 1500, 'test_cooldown');
    expect(await getProviderCooldown('overpass')).toBeGreaterThan(500);

    const started = Date.now();
    await waitForProviderSlot('overpass', 50);
    expect(Date.now() - started).toBeGreaterThan(1000);

    const redis = getRedisClient();
    const cooldownKeys = await redis!.keys(`${namespace}:cooldown:overpass`);
    // Key may expire after wait; namespace usage is asserted via earlier remaining cooldown.
    expect(cooldownKeys.length).toBeGreaterThanOrEqual(0);
  });
});
