/**
 * Types describing the mock planning datasets rendered on the map.
 *
 * These mirror the property shapes of the GeoJSON files under `public/data`.
 * They are intentionally pragmatic rather than exhaustive.
 */

/** Stable identifier for each planning layer in the app. */
export type PlanningLayerId =
  | 'parcels'
  | 'zoning'
  | 'constraints'
  | 'transit'
  | 'developmentActivity';

export interface ParcelProperties {
  id: string;
  name: string;
  parcelId: string;
  zoning: string;
  currentUse: string;
  developmentScore: number;
  areaSqm: number;
  status: string;
}

export interface ZoningProperties {
  id: string;
  zoneCode: string;
  zoneName: string;
  description: string;
}

export interface ConstraintProperties {
  id: string;
  constraintType: string;
  riskLevel: string;
  description: string;
}

export interface TransitProperties {
  id: string;
  name: string;
  mode: string;
  distanceCategory: string;
}

export interface DevelopmentActivityProperties {
  id: string;
  projectName: string;
  status: string;
  applicationType: string;
  lodgedMonth: string;
}

/** Union of all planning feature property shapes. */
export type PlanningFeatureProperties =
  | ParcelProperties
  | ZoningProperties
  | ConstraintProperties
  | TransitProperties
  | DevelopmentActivityProperties;
