import type {
  PlanningLayerId,
  PlanningLayerGeometryType,
} from '@sitelens/shared';

export interface LayerDef {
  id: PlanningLayerId;
  label: string;
  description: string;
  geometryType: PlanningLayerGeometryType;
  /** Base filename (without extension) under `apps/api/data`. */
  file: string;
  defaultVisible: boolean;
  sortOrder: number;
}

/** Layer metadata, mirroring the frontend planning layers. */
export const LAYER_DEFS: LayerDef[] = [
  {
    id: 'zoning',
    label: 'Zoning',
    description: 'Land-use zones such as commercial, residential and mixed use.',
    geometryType: 'polygon',
    file: 'zoning',
    defaultVisible: true,
    sortOrder: 0,
  },
  {
    id: 'parcels',
    label: 'Parcels',
    description: 'Individual property parcels with development metrics.',
    geometryType: 'polygon',
    file: 'parcels',
    defaultVisible: true,
    sortOrder: 1,
  },
  {
    id: 'constraints',
    label: 'Constraints',
    description: 'Planning constraints like flood, heritage and soils.',
    geometryType: 'polygon',
    file: 'constraints',
    defaultVisible: false,
    sortOrder: 2,
  },
  {
    id: 'transit',
    label: 'Transit',
    description: 'Nearby train, metro, light rail, bus and ferry stops.',
    geometryType: 'point',
    file: 'transit',
    defaultVisible: true,
    sortOrder: 3,
  },
  {
    id: 'developmentActivity',
    label: 'Development Activity',
    description: 'Recent development applications and their status.',
    geometryType: 'point',
    file: 'development-activity',
    defaultVisible: false,
    sortOrder: 4,
  },
];
