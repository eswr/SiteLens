import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getGeocodingUpstreamCooldown,
  markGeocodingUpstreamUnavailable,
  resetGeocodingUpstreamState,
} from './geocodingUpstreamState.js';

beforeEach(() => {
  resetGeocodingUpstreamState();
  process.env.PROVIDER_RATE_LIMIT_BACKEND = 'memory';
  process.env.GEOCODING_UPSTREAM_ERROR_COOLDOWN_MS = '1000';
});

afterEach(() => {
  resetGeocodingUpstreamState();
  delete process.env.PROVIDER_RATE_LIMIT_BACKEND;
  delete process.env.GEOCODING_UPSTREAM_ERROR_COOLDOWN_MS;
  vi.useRealTimers();
});

describe('geocodingUpstreamState', () => {
  it('is inactive by default', async () => {
    expect(await getGeocodingUpstreamCooldown()).toEqual({ active: false });
  });

  it('reports an active cooldown after markGeocodingUpstreamUnavailable', async () => {
    await markGeocodingUpstreamUnavailable('upstream_forbidden');
    const cooldown = await getGeocodingUpstreamCooldown();
    expect(cooldown.active).toBe(true);
    expect(cooldown.reason).toBe('upstream_forbidden');
    expect(cooldown.until).toBeTruthy();
  });

  it('clears after the cooldown window elapses', async () => {
    vi.useFakeTimers();
    await markGeocodingUpstreamUnavailable('upstream_rate_limited');
    expect((await getGeocodingUpstreamCooldown()).active).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(await getGeocodingUpstreamCooldown()).toEqual({ active: false });
  });

  it('resetGeocodingUpstreamState clears immediately', async () => {
    await markGeocodingUpstreamUnavailable('upstream_unavailable');
    resetGeocodingUpstreamState();
    expect(await getGeocodingUpstreamCooldown()).toEqual({ active: false });
  });
});
