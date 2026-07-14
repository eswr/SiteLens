import { loadConfig } from '../config.js';

/**
 * Process-local request spacer for outbound Nominatim calls.
 *
 * Serializes callers and guarantees at least `minIntervalMs` between requests,
 * respecting Nominatim's ~1 req/sec public-service policy. This is sufficient
 * for a single-process portfolio demo. In a horizontally-scaled deployment this
 * MUST be replaced with a distributed limiter (e.g. a Redis token bucket / lock
 * or a dedicated queue) so spacing holds across instances.
 */

let lastRequestAt = 0;
let chain: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until it is safe to make the next Nominatim request. */
export function waitForGeocodingSlot(minIntervalMs?: number): Promise<void> {
  const interval = minIntervalMs ?? loadConfig().geocodingMinIntervalMs;
  const run = chain.then(async () => {
    const now = Date.now();
    const wait = Math.max(0, lastRequestAt + interval - now);
    if (wait > 0) {
      await sleep(wait);
    }
    lastRequestAt = Date.now();
  });
  // Keep the chain alive even if a caller's await path rejects elsewhere.
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Reset limiter state (test-only). */
export function resetGeocodingRateLimiter(): void {
  lastRequestAt = 0;
  chain = Promise.resolve();
}
