/** Stable identifiers for the planning layers, shared by web and API. */
export type PlanningLayerId =
  | 'parcels'
  | 'zoning'
  | 'constraints'
  | 'transit'
  | 'developmentActivity';

export type PlanningLayerGeometryType = 'polygon' | 'point';

/** Metadata describing a planning layer (returned by `GET /api/layers`). */
export interface LayerSummary {
  id: PlanningLayerId;
  label: string;
  description: string;
  geometryType: PlanningLayerGeometryType;
  featureCount: number;
}

/** A single search result (returned by `GET /api/search`). */
export interface SearchResultItem {
  id: string;
  layerId: PlanningLayerId;
  label: string;
  subtitle: string;
  properties: Record<string, unknown>;
  geometry: unknown;
  /** Bounding box `[minX, minY, maxX, maxY]`, when available. */
  bbox?: [number, number, number, number];
}
