import type { PlanningLayerId } from '../types/planning';

/** Property key used as the primary title, per layer. */
export const TITLE_KEY: Record<PlanningLayerId, string> = {
  parcels: 'name',
  zoning: 'zoneName',
  constraints: 'constraintType',
  transit: 'name',
  developmentActivity: 'projectName',
};

/**
 * Ordered "key facts" per layer, surfaced prominently in the details panel and
 * used to build search subtitles. The title key is filtered out where present.
 */
export const PRIORITY_KEYS: Record<PlanningLayerId, string[]> = {
  parcels: [
    'parcelId',
    'zoning',
    'currentUse',
    'developmentScore',
    'areaSqm',
    'status',
  ],
  developmentActivity: [
    'projectName',
    'status',
    'applicationType',
    'lodgedMonth',
  ],
  transit: ['name', 'mode', 'distanceCategory'],
  constraints: ['constraintType', 'riskLevel', 'description'],
  zoning: ['zoneCode', 'zoneName', 'description'],
};

type Props = Record<string, unknown>;

function str(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  return String(value);
}

/** Human-friendly title for a feature. */
export function getFeatureTitle(layerId: PlanningLayerId, props: Props): string {
  return (
    str(props[TITLE_KEY[layerId]]) ??
    str(props.id) ??
    'Selected feature'
  );
}

/** Short secondary context line for a feature (used in search results). */
export function getFeatureSubtitle(
  layerId: PlanningLayerId,
  props: Props,
): string {
  switch (layerId) {
    case 'parcels':
      return [str(props.parcelId), str(props.zoning)]
        .filter(Boolean)
        .join(' · ');
    case 'zoning':
      return str(props.zoneCode) ? `Zone ${str(props.zoneCode)}` : 'Zoning';
    case 'constraints':
      return str(props.riskLevel)
        ? `${str(props.riskLevel)} risk`
        : 'Constraint';
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
