/**
 * Shared geospatial type definitions for SiteLens.
 */
import type { PlanningLayerId } from './planning';

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
 * Captures enough context for the details panel to render metadata and for the
 * map to zoom to it without re-querying the source.
 */
export interface SelectedFeature {
  /** The planning layer the feature belongs to. */
  layerId: PlanningLayerId;
  /** The feature's id from its GeoJSON. */
  featureId: string;
  /** MapLibre source id that owns the feature. */
  sourceId: string;
  /** GeoJSON geometry type (e.g. `Polygon`, `Point`). */
  geometryType: string;
  /** Raw feature properties. */
  properties: Record<string, unknown>;
  /** Centroid `[lng, lat]`. */
  center: [number, number];
  /** Bounding box `[minX, minY, maxX, maxY]`, when available. */
  bbox?: [number, number, number, number];
}

/**
 * A request for the map to move to a feature. Decouples the search UI and
 * details panel from the map instance. `nonce` lets repeated requests for the
 * same feature re-trigger the camera move.
 */
export interface FlyToRequest {
  center: [number, number];
  bbox?: [number, number, number, number];
  geometryType: string;
  nonce: number;
}
