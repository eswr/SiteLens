/** Normalized raw external feature before SiteLens layer mapping. */
export interface ExternalFeature {
  id: string;
  source: 'osm-overpass';
  kind:
    | 'building'
    | 'landuse'
    | 'road'
    | 'transit'
    | 'water'
    | 'park'
    | 'amenity'
    | 'construction'
    | 'unknown';
  name?: string;
  tags: Record<string, string>;
  geometry: {
    type: string;
    coordinates: unknown;
  };
}

/** SiteLens-normalized rows ready for PostGIS insert. */
export interface NormalizedSiteRow {
  id: string;
  parcelId: string;
  name: string;
  zoning: string;
  currentUse: string;
  developmentScore: number | null;
  areaSqm: number | null;
  status: string;
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

export interface NormalizedOverlayRow {
  id: string;
  zoneCode: string;
  zoneName: string;
  description: string;
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

export interface NormalizedConstraintRow {
  id: string;
  constraintType: string;
  riskLevel: string;
  description: string;
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

export interface NormalizedTransitRow {
  id: string;
  name: string;
  mode: string;
  distanceCategory: string;
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

export interface NormalizedActivityRow {
  id: string;
  projectName: string;
  status: string;
  applicationType: string;
  lodgedMonth: string;
  properties: Record<string, unknown>;
  geometry: { type: string; coordinates: unknown };
}

export interface NormalizedPlanningLayers {
  sites: NormalizedSiteRow[];
  landUse: NormalizedOverlayRow[];
  constraints: NormalizedConstraintRow[];
  transit: NormalizedTransitRow[];
  developmentActivity: NormalizedActivityRow[];
  skipped: number;
}

/** Bbox as `[west, south, east, north]` in WGS84 degrees. */
export type ContextBbox = [number, number, number, number];
