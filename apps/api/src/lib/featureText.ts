import type { PlanningLayerId } from '@sitelens/shared';

type Props = Record<string, unknown>;

function str(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  return String(value);
}

const TITLE_KEY: Record<PlanningLayerId, string> = {
  parcels: 'name',
  zoning: 'zoneName',
  constraints: 'constraintType',
  transit: 'name',
  developmentActivity: 'projectName',
};

/** Human-friendly title for a feature, mirroring the frontend logic. */
export function getFeatureTitle(layerId: PlanningLayerId, props: Props): string {
  return str(props[TITLE_KEY[layerId]]) ?? str(props.id) ?? 'Feature';
}

/** Short secondary context line for a feature. */
export function getFeatureSubtitle(
  layerId: PlanningLayerId,
  props: Props,
): string {
  switch (layerId) {
    case 'parcels':
      return [str(props.parcelId), str(props.zoning)].filter(Boolean).join(' · ');
    case 'zoning':
      return str(props.zoneCode) ? `Zone ${str(props.zoneCode)}` : 'Zoning';
    case 'constraints':
      return str(props.riskLevel) ? `${str(props.riskLevel)} risk` : 'Constraint';
    case 'transit':
      return [str(props.mode), str(props.distanceCategory)]
        .filter(Boolean)
        .join(' · ');
    case 'developmentActivity':
      return [str(props.status), str(props.applicationType)]
        .filter(Boolean)
        .join(' · ');
    default:
      return '';
  }
}

/** Build a lowercased haystack from a feature's properties for search. */
export function buildHaystack(label: string, subtitle: string, props: Props): string {
  const propValues = Object.values(props)
    .filter((value) => typeof value === 'string' || typeof value === 'number')
    .join(' ');
  return `${label} ${subtitle} ${propValues}`.toLowerCase();
}
