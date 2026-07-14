import type { CacheStatus, PlaceSearchResponse, PlaceSearchResult } from '@sitelens/shared';
import { loadConfig } from '../config';
import { cached } from '../cache/cacheJson';
import { CACHE_TTL, placeSearchKey } from '../cache/cacheKeys';
import { HttpError } from '../auth/requireCapability';
import { waitForGeocodingSlot } from './geocodingRateLimiter';
import { searchNominatim } from './nominatimClient';

export const MIN_QUERY_LENGTH = 3;
export const MAX_LIMIT = 10;
export const DEFAULT_LIMIT = 5;

/** Standard OSM/Nominatim attribution shown wherever place results appear. */
export const GEOCODING_ATTRIBUTION =
  '© OpenStreetMap contributors; geocoding by Nominatim';

/** Clamp a requested limit into the allowed 1–10 range. */
export function clampLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit) || limit === undefined) {
    return DEFAULT_LIMIT;
  }
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

export interface PlaceSearchServiceResult {
  response: PlaceSearchResponse;
  cache: CacheStatus;
  computedAt: string;
}

/**
 * Resolve a worldwide place search: validate, clamp, cache (Redis), and on a
 * miss space the outbound request and call Nominatim. Redis failures never
 * break the request — a cache error still returns fresh upstream results.
 */
export async function searchPlaces(
  query: string,
  limit?: number,
): Promise<PlaceSearchServiceResult> {
  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) {
    throw new HttpError(
      400,
      'BAD_REQUEST',
      `Query must be at least ${MIN_QUERY_LENGTH} characters.`,
    );
  }
  const clamped = clampLimit(limit);

  const { data: results, cache, computedAt } = await cached<PlaceSearchResult[]>({
    key: placeSearchKey(trimmed, clamped),
    ttlSeconds: loadConfig().geocodingCacheTtlSeconds ?? CACHE_TTL.placeSearch,
    compute: async () => {
      // Only space + call upstream on a real cache miss.
      await waitForGeocodingSlot();
      return searchNominatim(trimmed, clamped);
    },
  });

  return {
    response: {
      results,
      provider: 'nominatim',
      attribution: GEOCODING_ATTRIBUTION,
    },
    cache,
    computedAt,
  };
}
