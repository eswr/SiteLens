/**
 * Planning context types — local demo seed vs generated external urban context.
 *
 * External contexts are open-map-derived urban context layers for portfolio
 * verification. They are not official zoning, cadastre, or development-
 * application datasets.
 */

export type PlanningContextSource =
  | 'local-demo'
  | 'external-osm'
  | 'external-overture'
  | 'synthetic-fallback';

export type PlanningContextStatus =
  | 'ready'
  | 'building'
  | 'failed'
  | 'stale';

export interface PlanningContextPlace {
  id: string;
  label: string;
  displayName: string;
  provider: string;
}

export interface PlanningContext {
  id: string;
  label: string;
  source: PlanningContextSource;
  status: PlanningContextStatus;
  /** `[longitude, latitude]` */
  center: [number, number];
  /** `[west, south, east, north]` */
  bbox: [number, number, number, number];
  place?: PlanningContextPlace;
  disclaimer: string;
  createdAt: string;
  updatedAt: string;
}

export interface BuildPlanningContextRequest {
  place: {
    id: string;
    label: string;
    displayName: string;
    latitude: number;
    longitude: number;
    /** Nominatim-style `[south, north, west, east]` when available. */
    boundingBox?: [number, number, number, number];
    provider: string;
  };
  source?: 'external-osm';
}

export interface PlanningContextFeatureCounts {
  sites: number;
  landUse: number;
  constraints: number;
  transit: number;
  developmentActivity: number;
}

export interface BuildPlanningContextResponse {
  context: PlanningContext;
  counts: PlanningContextFeatureCounts;
  /** True when a fresh ready context was returned without calling Overpass. */
  reused?: boolean;
}

/** Bundled Sydney portfolio fixture — default / offline fallback context. */
export const LOCAL_DEMO_SYDNEY_CONTEXT_ID = 'local-demo-sydney';

export const LOCAL_DEMO_SYDNEY_DISCLAIMER =
  'Sydney Demo is bundled synthetic portfolio data. It is not official planning or cadastral data.';

export const EXTERNAL_OSM_DISCLAIMER =
  'External context generated from open map data. It is not official zoning, cadastre, or development-application data.';
