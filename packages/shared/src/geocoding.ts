/**
 * Worldwide place search (geocoding) types.
 *
 * The browser only ever calls the SiteLens API; the API proxies to Nominatim /
 * OpenStreetMap, with an optional bundled static-demo fallback when the live
 * provider is unavailable.
 */

export type GeocodingProvider = 'nominatim' | 'static-demo';

export type GeocodingFallbackReason =
  | 'upstream_forbidden'
  | 'upstream_rate_limited'
  | 'upstream_unavailable'
  | 'upstream_timeout'
  | 'geocoding_disabled'
  | 'cooldown_active';

export interface PlaceSearchRequest {
  query: string;
  limit?: number;
}

export interface PlaceSearchResult {
  id: string;
  label: string;
  displayName: string;
  latitude: number;
  longitude: number;
  /** `[south, north, west, east]` (Nominatim `boundingbox` order). */
  boundingBox?: [number, number, number, number];
  category?: string;
  type?: string;
  importance?: number;
  provider: GeocodingProvider;
}

/**
 * Local autocomplete suggestion sources. These never come from remote
 * Nominatim typeahead — only bundled demo places, recent selections, and
 * results from this session's explicit searches.
 */
export type PlaceSuggestionSource =
  | 'static-demo'
  | 'recent'
  | 'cached-search-result';

export interface PlaceSuggestion {
  id: string;
  label: string;
  displayName: string;
  latitude: number;
  longitude: number;
  /** `[south, north, west, east]` (Nominatim `boundingbox` order). */
  boundingBox?: [number, number, number, number];
  category?: string;
  type?: string;
  importance?: number;
  provider: GeocodingProvider;
  source: PlaceSuggestionSource;
}

export interface PlaceSearchFallback {
  active: boolean;
  reason: GeocodingFallbackReason;
  message: string;
}

export interface PlaceSearchResponse {
  results: PlaceSearchResult[];
  provider: GeocodingProvider;
  attribution: string;
  fallback?: PlaceSearchFallback;
}
