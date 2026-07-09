/**
 * Shared geospatial type definitions for SiteLens.
 *
 * These are intentionally minimal for Step 1 (app shell + map foundation).
 * They will be extended in later steps as GeoJSON layers, drawing tools,
 * and feature inspection are introduced.
 */

/** A geographic coordinate expressed as longitude/latitude in WGS84 degrees. */
export interface LngLat {
  lng: number;
  lat: number;
}

/** The current camera state of the interactive map. */
export interface MapViewport {
  center: LngLat;
  zoom: number;
}

/**
 * A feature the user has selected on the map (e.g. a parcel or planning layer).
 * For Step 1 we only track the identifier; richer metadata arrives with the
 * GeoJSON layers in a later step.
 */
export interface SelectedFeature {
  id: string;
}
