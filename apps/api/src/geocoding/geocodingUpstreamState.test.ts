import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getGeocodingUpstreamCooldown,
  markGeocodingUpstreamUnavailable,
  resetGeocodingUpstreamState,
} from './geocodingUpstreamState';

beforeEach(() => {
  resetGeocodingUpstreamState();
  process.env.GEOCODING_UPSTREAM_ERROR_COOLDOWN_MS = '1000';
});

afterEach(() => {
  resetGeocodingUpstreamState();
  delete process.env.GEOCODING_UPSTREAM_ERROR_COOLDOWN_MS;
  vi.useRealTimers();
});

describe('geocodingUpstreamState', () => {
  it('is inactive by default', () => {
    expect(getGeocodingUpstreamCooldown()).toEqual({ active: false });
  });

  it('reports an active cooldown after markGeocodingUpstreamUnavailable', () => {
    markGeocodingUpstreamUnavailable('upstream_forbidden');
    const cooldown = getGeocodingUpstreamCooldown();
    expect(cooldown.active).toBe(true);
    expect(cooldown.reason).toBe('upstream_forbidden');
    expect(cooldown.until).toBeTruthy();
  });

  it('clears after the cooldown window elapses', () => {
    vi.useFakeTimers();
    markGeocodingUpstreamUnavailable('upstream_rate_limited');
    expect(getGeocodingUpstreamCooldown().active).toBe(true);
    vi.advanceTimersByTime(1001);
    expect(getGeocodingUpstreamCooldown()).toEqual({ active: false });
  });

  it('resetGeocodingUpstreamState clears immediately', () => {
    markGeocodingUpstreamUnavailable('upstream_unavailable');
    resetGeocodingUpstreamState();
    expect(getGeocodingUpstreamCooldown()).toEqual({ active: false });
  });
});
