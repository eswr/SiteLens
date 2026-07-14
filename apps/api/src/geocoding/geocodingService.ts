import type {
  CacheStatus,
  GeocodingFallbackReason,
  PlaceSearchResponse,
} from '@sitelens/shared';
import { loadConfig } from '../config';
import { cached, getJson } from '../cache/cacheJson';
import { CACHE_TTL, placeSearchKey } from '../cache/cacheKeys';
import { HttpError } from '../auth/requireCapability';
import { waitForGeocodingSlot } from './geocodingRateLimiter';
import { searchNominatim } from './nominatimClient';
import {
  getGeocodingUpstreamCooldown,
  markGeocodingUpstreamUnavailable,
} from './geocodingUpstreamState';
import {
  STATIC_DEMO_ATTRIBUTION,
  searchStaticDemoPlaces,
} from './staticPlaceProvider';

export const MIN_QUERY_LENGTH = 3;
export const MAX_LIMIT = 10;
export const DEFAULT_LIMIT = 5;

/** Standard OSM/Nominatim attribution shown for live Nominatim results. */
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

function fallbackMessage(reason: GeocodingFallbackReason): string {
  switch (reason) {
    case 'upstream_forbidden':
      return 'Public Nominatim is unavailable from this network; using bundled demo places.';
    case 'upstream_rate_limited':
      return 'The geocoding provider rate-limited requests; using bundled demo places.';
    case 'upstream_timeout':
      return 'The geocoding provider timed out; using bundled demo places.';
    case 'upstream_unavailable':
      return 'The geocoding provider is unavailable; using bundled demo places.';
    case 'cooldown_active':
      return 'Public Nominatim is temporarily skipped after a recent failure; using bundled demo places.';
    case 'geocoding_disabled':
      return 'Geocoding is disabled; using bundled demo places.';
    default:
      return 'Live geocoding is unavailable; using bundled demo places.';
  }
}

function reasonFromHttpError(error: HttpError): GeocodingFallbackReason {
  switch (error.code) {
    case 'GEOCODING_UPSTREAM_FORBIDDEN':
      return 'upstream_forbidden';
    case 'GEOCODING_UPSTREAM_RATE_LIMITED':
      return 'upstream_rate_limited';
    case 'GEOCODING_UPSTREAM_TIMEOUT':
      return 'upstream_timeout';
    default:
      return 'upstream_unavailable';
  }
}

function buildStaticResponse(
  query: string,
  limit: number,
  reason: GeocodingFallbackReason,
): PlaceSearchResponse {
  return {
    results: searchStaticDemoPlaces(query, limit),
    provider: 'static-demo',
    attribution: STATIC_DEMO_ATTRIBUTION,
    fallback: {
      active: true,
      reason,
      message: fallbackMessage(reason),
    },
  };
}

async function searchStaticFallback(
  query: string,
  limit: number,
  reason: GeocodingFallbackReason,
): Promise<PlaceSearchServiceResult> {
  const config = loadConfig();
  const { data, cache, computedAt } = await cached<PlaceSearchResponse>({
    key: placeSearchKey('static-demo', query, limit),
    ttlSeconds:
      config.geocodingStaticFallbackTtlSeconds ??
      CACHE_TTL.placeSearchStaticFallback,
    compute: async () => buildStaticResponse(query, limit, reason),
  });

  // Preserve the cached fallback reason/message so repeated searches explain why
  // this cached static-demo result was originally produced.
  const response: PlaceSearchResponse = {
    ...data,
    provider: 'static-demo',
    attribution: data.attribution || STATIC_DEMO_ATTRIBUTION,
    fallback: {
      active: true,
      reason: data.fallback?.reason ?? reason,
      message: data.fallback?.message ?? fallbackMessage(reason),
    },
  };

  return { response, cache, computedAt };
}

/**
 * Resolve a worldwide place search: validate, prefer live Nominatim (cached),
 * and fall back to the bundled static demo dataset when the upstream is
 * blocked, rate-limited, or in cooldown — without hammering Nominatim.
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
  const config = loadConfig();

  // Prefer a previously cached live Nominatim response when available.
  const liveCached = await cachedLiveLookup(trimmed, clamped);
  if (liveCached) {
    return liveCached;
  }

  const cooldown = getGeocodingUpstreamCooldown();
  if (cooldown.active) {
    if (config.geocodingStaticFallbackEnabled) {
      return searchStaticFallback(trimmed, clamped, 'cooldown_active');
    }
    throw new HttpError(
      503,
      'GEOCODING_UPSTREAM_COOLDOWN',
      'The geocoding provider is temporarily unavailable after a recent failure.',
    );
  }

  try {
    const { data, cache, computedAt } = await cached<PlaceSearchResponse>({
      key: placeSearchKey('nominatim', trimmed, clamped),
      ttlSeconds: config.geocodingCacheTtlSeconds ?? CACHE_TTL.placeSearch,
      compute: async () => {
        await waitForGeocodingSlot();
        const results = await searchNominatim(trimmed, clamped);
        return {
          results,
          provider: 'nominatim' as const,
          attribution: GEOCODING_ATTRIBUTION,
        };
      },
    });

    return {
      response: {
        ...data,
        provider: 'nominatim',
        attribution: data.attribution || GEOCODING_ATTRIBUTION,
      },
      cache,
      computedAt,
    };
  } catch (error) {
    if (!(error instanceof HttpError) || error.statusCode < 500) {
      throw error;
    }

    const reason = reasonFromHttpError(error);
    markGeocodingUpstreamUnavailable(reason);

    if (config.geocodingStaticFallbackEnabled) {
      return searchStaticFallback(trimmed, clamped, reason);
    }
    throw error;
  }
}

/** Peek the live Nominatim cache without computing or calling upstream. */
async function cachedLiveLookup(
  query: string,
  limit: number,
): Promise<PlaceSearchServiceResult | null> {
  const key = placeSearchKey('nominatim', query, limit);
  const read = await getJson<{ data: PlaceSearchResponse; computedAt: string }>(
    key,
  );
  if (read.status === 'hit' && read.value?.data) {
    return {
      response: {
        ...read.value.data,
        provider: 'nominatim',
        attribution: read.value.data.attribution || GEOCODING_ATTRIBUTION,
      },
      cache: 'hit',
      computedAt: read.value.computedAt,
    };
  }
  return null;
}
