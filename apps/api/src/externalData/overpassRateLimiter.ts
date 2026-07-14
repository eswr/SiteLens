import { loadConfig } from '../config.js';
import {
  markProviderFailure,
  resetProviderSpacer,
  waitForProviderSlot,
} from '../providers/providerSpacer.js';

/**
 * Outbound Overpass request spacer.
 *
 * Uses the shared Redis-backed provider spacer when configured, with
 * process-local memory fallback for single-process demos.
 */

/** Wait until it is safe to make the next Overpass request. */
export async function waitForOverpassSlot(
  minIntervalMs?: number,
): Promise<void> {
  const interval = minIntervalMs ?? loadConfig().overpassMinIntervalMs;
  await waitForProviderSlot('overpass', interval);
}

/** After provider errors, pause further Overpass calls briefly. */
export async function markOverpassFailure(
  cooldownMs?: number,
): Promise<void> {
  const duration =
    cooldownMs ?? loadConfig().providerCooldownTtlMs;
  await markProviderFailure('overpass', duration, 'overpass_failure');
}

export function resetOverpassRateLimiter(): void {
  resetProviderSpacer();
}
