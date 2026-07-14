import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as cacheClient from '../cache/cacheClient.js';
import {
  getProviderCooldown,
  markProviderFailure,
  resetProviderSpacer,
  waitForProviderSlot,
} from './providerSpacer.js';

describe('providerSpacer (memory)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetProviderSpacer();
    process.env.PROVIDER_RATE_LIMIT_BACKEND = 'memory';
  });

  afterEach(() => {
    resetProviderSpacer();
    delete process.env.PROVIDER_RATE_LIMIT_BACKEND;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('spaces consecutive calls by at least the interval', async () => {
    const firstPromise = waitForProviderSlot('nominatim', 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(await firstPromise).toBe('memory');

    let secondResolved = false;
    const second = waitForProviderSlot('nominatim', 1000).then((mode) => {
      secondResolved = true;
      return mode;
    });

    await vi.advanceTimersByTimeAsync(500);
    expect(secondResolved).toBe(false);

    await vi.advanceTimersByTimeAsync(600);
    expect(await second).toBe('memory');
    expect(secondResolved).toBe(true);
  });

  it('shares cooldown across subsequent waits', async () => {
    await markProviderFailure('overpass', 2000, 'rate_limited');
    expect(await getProviderCooldown('overpass')).toBeGreaterThan(0);

    let resolved = false;
    const wait = waitForProviderSlot('overpass', 100).then(() => {
      resolved = true;
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(resolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1100);
    await wait;
    expect(resolved).toBe(true);
  });

  it('does not call any live provider HTTP APIs', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await waitForProviderSlot('nominatim', 10);
    await markProviderFailure('nominatim', 50, 'test');
    await getProviderCooldown('nominatim');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('providerSpacer (redis mocked)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetProviderSpacer();
    process.env.PROVIDER_RATE_LIMIT_BACKEND = 'redis';
    process.env.NODE_ENV = 'development';
    process.env.WEB_ORIGIN = 'http://localhost:5173';
  });

  afterEach(() => {
    resetProviderSpacer();
    delete process.env.PROVIDER_RATE_LIMIT_BACKEND;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('uses Lua slot waits when Redis eval returns increasing windows', async () => {
    const evalMock = vi
      .fn()
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1000);
    const redisStub = {
      status: 'ready' as const,
      eval: evalMock,
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
    };
    vi.spyOn(cacheClient, 'getRedisClient').mockReturnValue(
      redisStub as unknown as ReturnType<typeof cacheClient.getRedisClient>,
    );

    const first = waitForProviderSlot('nominatim', 1000);
    await vi.advanceTimersByTimeAsync(0);
    expect(await first).toBe('redis');

    let secondDone = false;
    const second = waitForProviderSlot('nominatim', 1000).then((mode) => {
      secondDone = true;
      return mode;
    });
    await vi.advanceTimersByTimeAsync(500);
    expect(secondDone).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    expect(await second).toBe('redis');
    expect(evalMock).toHaveBeenCalledTimes(2);
  });

  it('writes shared cooldown keys', async () => {
    const setMock = vi.fn().mockResolvedValue('OK');
    const redisStub = {
      status: 'ready' as const,
      eval: vi.fn(),
      get: vi.fn().mockResolvedValue(null),
      set: setMock,
    };
    vi.spyOn(cacheClient, 'getRedisClient').mockReturnValue(
      redisStub as unknown as ReturnType<typeof cacheClient.getRedisClient>,
    );

    await markProviderFailure('overpass', 60_000, 'upstream_rate_limited');
    expect(setMock).toHaveBeenCalled();
    const key = String(setMock.mock.calls[0]?.[0] ?? '');
    expect(key).toContain('sitelens:provider-limits:v1:cooldown:overpass');
  });

  it('throws in production when PROVIDER_RATE_LIMIT_BACKEND=redis and Redis is unavailable', async () => {
    process.env.NODE_ENV = 'production';
    process.env.WEB_ORIGIN = 'https://example.com';
    process.env.PROVIDER_RATE_LIMIT_BACKEND = 'redis';
    vi.spyOn(cacheClient, 'getRedisClient').mockReturnValue(null);

    await expect(waitForProviderSlot('nominatim', 1000)).rejects.toThrow(
      /PROVIDER_RATE_LIMIT_BACKEND=redis but Redis is not available/,
    );
  });
});
