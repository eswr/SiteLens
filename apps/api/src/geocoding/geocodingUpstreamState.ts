import type { GeocodingFallbackReason } from '@sitelens/shared';
import { loadConfig } from '../config';

/**
 * Process-local upstream cooldown / circuit breaker for Nominatim.
 *
 * Production multi-instance deployments should replace this with Redis (or
 * another shared store) so cooldown state is consistent across API replicas.
 */

interface UpstreamState {
  untilMs: number;
  reason: GeocodingFallbackReason;
}

let state: UpstreamState | null = null;

export function markGeocodingUpstreamUnavailable(
  reason: GeocodingFallbackReason,
): void {
  const cooldownMs = loadConfig().geocodingUpstreamErrorCooldownMs;
  state = {
    reason,
    untilMs: Date.now() + cooldownMs,
  };
}

export function getGeocodingUpstreamCooldown(): {
  active: boolean;
  reason?: GeocodingFallbackReason;
  until?: string;
} {
  if (!state) {
    return { active: false };
  }
  if (Date.now() >= state.untilMs) {
    state = null;
    return { active: false };
  }
  return {
    active: true,
    reason: state.reason,
    until: new Date(state.untilMs).toISOString(),
  };
}

/** Reset cooldown state (tests / manual recovery). */
export function resetGeocodingUpstreamState(): void {
  state = null;
}
