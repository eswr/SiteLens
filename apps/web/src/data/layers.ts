import type { PlanningLayerId } from '../types/planning';

export type LayerGeometryType = 'polygon' | 'point';

/** Declarative configuration for a single planning layer. */
export interface PlanningLayerConfig {
  /** Stable app-level id (matches `PlanningLayerId`). */
  id: PlanningLayerId;
  /** Human-friendly name shown in the sidebar. */
  label: string;
  /** Short description shown under the toggle. */
  description: string;
  /** URL of the GeoJSON served from `public/`. */
  sourceUrl: string;
  /** MapLibre source id. */
  sourceId: string;
  /** MapLibre layer ids created from this source (fill/line/circle). */
  layerIds: string[];
  /** Geometry family, used to decide which MapLibre layer types to add. */
  geometryType: LayerGeometryType;
  /** Whether the layer is visible on first load. */
  defaultVisible: boolean;
}

/**
 * Ordered from bottom to top for map stacking: zoning sits under parcels,
 * constraints above parcels, and point layers on top.
 */
export const PLANNING_LAYERS: PlanningLayerConfig[] = [
  {
    id: 'zoning',
    label: 'Zoning',
    description: 'Land-use zones such as commercial, residential and mixed use.',
    sourceUrl: '/data/zoning.geojson',
    sourceId: 'zoning-source',
    layerIds: ['zoning-fill', 'zoning-line'],
    geometryType: 'polygon',
    defaultVisible: true,
  },
  {
    id: 'parcels',
    label: 'Parcels',
    description: 'Individual property parcels with development metrics.',
    sourceUrl: '/data/parcels.geojson',
    sourceId: 'parcels-source',
    layerIds: ['parcels-fill', 'parcels-line'],
    geometryType: 'polygon',
    defaultVisible: true,
  },
  {
    id: 'constraints',
    label: 'Constraints',
    description: 'Planning constraints like flood, heritage and soils.',
    sourceUrl: '/data/constraints.geojson',
    sourceId: 'constraints-source',
    layerIds: ['constraints-fill', 'constraints-line'],
    geometryType: 'polygon',
    defaultVisible: false,
  },
  {
    id: 'transit',
    label: 'Transit',
    description: 'Nearby train, metro, light rail, bus and ferry stops.',
    sourceUrl: '/data/transit.geojson',
    sourceId: 'transit-source',
    layerIds: ['transit-circle'],
    geometryType: 'point',
    defaultVisible: true,
  },
  {
    id: 'developmentActivity',
    label: 'Development Activity',
    description: 'Recent development applications and their status.',
    sourceUrl: '/data/development-activity.geojson',
    sourceId: 'development-activity-source',
    layerIds: ['development-activity-circle'],
    geometryType: 'point',
    defaultVisible: false,
  },
];

/** Display labels adapt when the selected context is open-map-derived. */
export function layerLabelsForSource(isExternal: boolean): Record<
  PlanningLayerId,
  { label: string; description: string }
> {
  if (!isExternal) {
    return Object.fromEntries(
      PLANNING_LAYERS.map((layer) => [
        layer.id,
        { label: layer.label, description: layer.description },
      ]),
    ) as Record<PlanningLayerId, { label: string; description: string }>;
  }
  return {
    parcels: {
      label: 'Sites / Buildings',
      description: 'Candidate sites and buildings from open map data (not cadastre).',
    },
    zoning: {
      label: 'Land Use',
      description:
        'Open-map land-use / park / water context overlays (not official zoning).',
    },
    constraints: {
      label: 'Context Constraints',
      description:
        'Environmental, open-space, corridor, and construction context signals.',
    },
    transit: {
      label: 'Transit',
      description: 'Transit / public transport points from open map data.',
    },
    developmentActivity: {
      label: 'Activity Proxies',
      description:
        'Amenity / construction proxies — not official development applications.',
    },
  };
}

/** Layer colors, shared between the map paint styles and the sidebar legend. */
export const LAYER_COLORS: Record<PlanningLayerId, string> = {
  parcels: '#2563eb',
  zoning: '#0f766e',
  constraints: '#dc2626',
  transit: '#7c3aed',
  developmentActivity: '#d97706',
};

/** Layers whose features can be clicked for details, highest priority first. */
export const CLICK_PRIORITY: PlanningLayerId[] = [
  'parcels',
  'developmentActivity',
  'transit',
  'constraints',
  'zoning',
];

export const LAYER_BY_ID: Record<PlanningLayerId, PlanningLayerConfig> =
  PLANNING_LAYERS.reduce(
    (acc, layer) => {
      acc[layer.id] = layer;
      return acc;
    },
    {} as Record<PlanningLayerId, PlanningLayerConfig>,
  );

/** Map from a MapLibre layer id back to the owning planning layer config. */
export const CONFIG_BY_MAP_LAYER_ID: Record<string, PlanningLayerConfig> =
  PLANNING_LAYERS.reduce(
    (acc, layer) => {
      for (const mapLayerId of layer.layerIds) {
        acc[mapLayerId] = layer;
      }
      return acc;
    },
    {} as Record<string, PlanningLayerConfig>,
  );
