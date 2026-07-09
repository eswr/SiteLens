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

import type { PlanningLayerId } from './planning';

/**
 * A feature the user has selected on the map (e.g. a parcel or planning layer).
 * Captures enough context for the details panel to render metadata without
 * re-querying the map.
 */
export interface SelectedFeature {
  /** The planning layer the feature belongs to. */
  layerId: PlanningLayerId;
  /** The feature's id from its GeoJSON. */
  featureId: string;
  /** GeoJSON geometry type (e.g. `Polygon`, `Point`). */
  geometryType: string;
  /** Raw feature properties. */
  properties: Record<string, unknown>;
  /** Coordinates of the click, when available (`[lng, lat]`). */
  coordinates?: [number, number];
}
