import { loadConfig } from '../config';

/**
 * Process-local spacing for outbound Overpass calls.
 *
 * Production multi-instance deploys should replace this with a distributed
 * Redis-backed limiter or job queue.
 */

let lastRequestAt = 0;
let chain: Promise<void> = Promise.resolve();
let cooldownUntil = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until it is safe to make the next Overpass request. */
export function waitForOverpassSlot(minIntervalMs?: number): Promise<void> {
  const interval = minIntervalMs ?? loadConfig().overpassMinIntervalMs;
  const run = chain.then(async () => {
    const now = Date.now();
    if (cooldownUntil > now) {
      await sleep(cooldownUntil - now);
    }
    const wait = Math.max(0, lastRequestAt + interval - Date.now());
    if (wait > 0) {
      await sleep(wait);
    }
    lastRequestAt = Date.now();
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** After provider errors, pause further Overpass calls briefly. */
export function markOverpassFailure(cooldownMs = 60_000): void {
  cooldownUntil = Math.max(cooldownUntil, Date.now() + cooldownMs);
}

export function resetOverpassRateLimiter(): void {
  lastRequestAt = 0;
  chain = Promise.resolve();
  cooldownUntil = 0;
}
