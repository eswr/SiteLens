/**
 * Worldwide place search (geocoding) types.
 *
 * The browser only ever calls the SiteLens API; the API proxies to Nominatim /
 * OpenStreetMap. These types describe the request/response contract.
 */

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
  provider: 'nominatim';
}

export interface PlaceSearchResponse {
  results: PlaceSearchResult[];
  provider: 'nominatim';
  attribution: string;
}
