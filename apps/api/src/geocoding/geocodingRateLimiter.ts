import { loadConfig } from '../config.js';
import {
  resetProviderSpacer,
  waitForProviderSlot,
} from '../providers/providerSpacer.js';

/**
 * Outbound Nominatim request spacer.
 *
 * Uses the shared Redis-backed provider spacer when configured, with
 * process-local memory fallback for single-process demos.
 */

/** Wait until it is safe to make the next Nominatim request. */
export async function waitForGeocodingSlot(
  minIntervalMs?: number,
): Promise<void> {
  const interval = minIntervalMs ?? loadConfig().geocodingMinIntervalMs;
  await waitForProviderSlot('nominatim', interval);
}

/** Reset limiter state (test-only). */
export function resetGeocodingRateLimiter(): void {
  resetProviderSpacer();
}
