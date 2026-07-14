import type { PlanningLayerId } from '@sitelens/shared';

/** Row shape for a feature query: id + parsed geometry + raw properties. */
export interface FeatureRow {
  id: string;
  geometry: unknown;
  properties: Record<string, unknown> | null;
}

/** A GeoJSON Feature reconstructed from a DB row. */
export interface GeoFeature {
  type: 'Feature';
  id: string;
  geometry: unknown;
  properties: Record<string, unknown>;
}

/** Map a query row to a GeoJSON Feature. */
export function rowToFeature(row: FeatureRow): GeoFeature {
  return {
    type: 'Feature',
    id: row.id,
    geometry: row.geometry,
    properties: row.properties ?? {},
  };
}

/** Map query rows to a GeoJSON FeatureCollection. */
export function rowsToFeatureCollection(rows: FeatureRow[]): {
  type: 'FeatureCollection';
  features: GeoFeature[];
} {
  return { type: 'FeatureCollection', features: rows.map(rowToFeature) };
}

/** Spatial DB table for each planning layer. */
export const LAYER_TABLE: Record<PlanningLayerId, string> = {
  parcels: 'parcels',
  zoning: 'zoning_overlays',
  constraints: 'constraints',
  transit: 'transit_points',
  developmentActivity: 'development_activity',
};

/** All app-owned tables, in a safe drop order (children before parents). */
export const SPATIAL_TABLE_DROP_ORDER = [
  'development_activity',
  'transit_points',
  'constraints',
  'zoning_overlays',
  'parcels',
  'planning_layers',
  'planning_contexts',
  'schema_migrations',
];

/** Detect whether an error is a database-connectivity failure. */
export function isDbConnectionError(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return (
    code === 'ECONNREFUSED' ||
    code === 'ENOTFOUND' ||
    code === 'ETIMEDOUT' ||
    code === '57P03' || // cannot_connect_now
    code === '3D000' // invalid_catalog_name (database missing)
  );
}
