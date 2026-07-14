import {
  ApiError,
  apiGetWithMeta,
  isApiConfigured,
  type CacheStatus,
} from './client';

export type GeocodingProvider = 'nominatim' | 'static-demo';

export interface PlaceSearchResult {
  id: string;
  label: string;
  displayName: string;
  latitude: number;
  longitude: number;
  /** `[south, north, west, east]` (Nominatim order). */
  boundingBox?: [number, number, number, number];
  category?: string;
  type?: string;
  importance?: number;
  provider: GeocodingProvider;
}

export interface PlaceSearchFallback {
  active: boolean;
  reason: string;
  message: string;
}

interface PlaceSearchData {
  results: PlaceSearchResult[];
  provider: GeocodingProvider;
  attribution: string;
  fallback?: PlaceSearchFallback;
}

export interface PlaceSearchApiResult {
  results: PlaceSearchResult[];
  provider: GeocodingProvider;
  attribution: string;
  fallback: PlaceSearchFallback | null;
  meta?: {
    cache?: CacheStatus;
    computedAt?: string;
  };
}

/** Worldwide place search via the SiteLens backend proxy (Nominatim / demo fallback). */
export async function searchPlaces(
  query: string,
  limit = 5,
): Promise<PlaceSearchApiResult> {
  if (!isApiConfigured()) {
    throw new ApiError('API base URL is required for worldwide place search');
  }
  const params = new URLSearchParams({
    q: query.trim(),
    limit: String(limit),
  });
  const { data, meta } = await apiGetWithMeta<PlaceSearchData>(
    `/api/geocode/search?${params.toString()}`,
  );
  return {
    results: data.results,
    provider: data.provider,
    attribution: data.attribution,
    fallback: data.fallback?.active ? data.fallback : null,
    meta: { cache: meta?.cache, computedAt: meta?.computedAt },
  };
}
