import type { GeocodingFallbackReason } from '@sitelens/shared';
import { loadConfig } from '../config.js';
import {
  getProviderCooldownInfo,
  markProviderFailure,
  resetProviderSpacer,
} from '../providers/providerSpacer.js';

/**
 * Upstream cooldown / circuit breaker for Nominatim.
 *
 * Backed by the shared provider spacer (Redis when available) so cooldown is
 * consistent across API replicas.
 */

export async function markGeocodingUpstreamUnavailable(
  reason: GeocodingFallbackReason,
): Promise<void> {
  const cooldownMs = loadConfig().geocodingUpstreamErrorCooldownMs;
  await markProviderFailure('nominatim', cooldownMs, reason);
}

export async function getGeocodingUpstreamCooldown(): Promise<{
  active: boolean;
  reason?: GeocodingFallbackReason;
  until?: string;
}> {
  const info = await getProviderCooldownInfo('nominatim');
  if (info.remainingMs <= 0) {
    return { active: false };
  }
  return {
    active: true,
    reason: (info.reason as GeocodingFallbackReason | null) ?? undefined,
    until: new Date(Date.now() + info.remainingMs).toISOString(),
  };
}

/** Reset cooldown state (tests / manual recovery). */
export function resetGeocodingUpstreamState(): void {
  resetProviderSpacer();
}
