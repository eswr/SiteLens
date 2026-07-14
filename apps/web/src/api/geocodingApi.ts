import { ApiError, apiGetWithMeta, isApiConfigured, type CacheStatus } from './client';

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
  provider: 'nominatim';
}

interface PlaceSearchData {
  results: PlaceSearchResult[];
  provider: 'nominatim';
  attribution: string;
}

export interface PlaceSearchApiResult {
  results: PlaceSearchResult[];
  attribution: string;
  meta?: {
    cache?: CacheStatus;
    computedAt?: string;
  };
}

/** Worldwide place search via the SiteLens backend proxy (Nominatim). */
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
    attribution: data.attribution,
    meta: { cache: meta?.cache, computedAt: meta?.computedAt },
  };
}
