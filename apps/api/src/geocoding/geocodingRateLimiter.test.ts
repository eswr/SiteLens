import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetGeocodingRateLimiter,
  waitForGeocodingSlot,
} from './geocodingRateLimiter.js';

describe('waitForGeocodingSlot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetGeocodingRateLimiter();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('spaces consecutive requests by at least the interval', async () => {
    const first = waitForGeocodingSlot(1000);
    await vi.advanceTimersByTimeAsync(0);
    await first; // first slot is immediate

    let secondResolved = false;
    const second = waitForGeocodingSlot(1000).then(() => {
      secondResolved = true;
    });

    await vi.advanceTimersByTimeAsync(500);
    expect(secondResolved).toBe(false);

    await vi.advanceTimersByTimeAsync(600);
    await second;
    expect(secondResolved).toBe(true);
  });

  it('does not wait when the interval has already elapsed', async () => {
    const first = waitForGeocodingSlot(1000);
    await vi.advanceTimersByTimeAsync(0);
    await first;

    await vi.advanceTimersByTimeAsync(2000);

    let resolved = false;
    const next = waitForGeocodingSlot(1000).then(() => {
      resolved = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    await next;
    expect(resolved).toBe(true);
  });
});
