import { createHash } from 'node:crypto';
import { LOCAL_DEMO_SYDNEY_CONTEXT_ID } from '@sitelens/shared';

const NAMESPACE = 'sitelens';
const VERSION = 'v1';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Entitlement scope (billing plan) used to segment cached responses by tier. */
export type AccessScope = 'free' | 'pro' | 'enterprise';

export function layersKey(
  planningContextId: string = LOCAL_DEMO_SYDNEY_CONTEXT_ID,
): string {
  return `${NAMESPACE}:layers:${VERSION}:${planningContextId}`;
}

export function parcelsKey(
  planningContextId: string,
  scope: AccessScope,
): string {
  return `${NAMESPACE}:parcels:${VERSION}:${planningContextId}:${scope}`;
}

export function parcelDetailKey(
  planningContextId: string,
  id: string,
): string {
  return `${NAMESPACE}:parcel:${VERSION}:${planningContextId}:${id}`;
}

export function searchKey(
  planningContextId: string,
  query: string,
  scope: AccessScope,
): string {
  return `${NAMESPACE}:search:${VERSION}:${planningContextId}:${scope}:${sha256(query.trim().toLowerCase())}`;
}

/** Provider scope used so live Nominatim and static-demo caches never mix. */
export type PlaceSearchProviderScope = 'nominatim' | 'static-demo';

/**
 * Cache key for a worldwide place search. Place search remains independent
 * from planning contexts.
 */
export function placeSearchKey(
  provider: PlaceSearchProviderScope,
  query: string,
  limit: number,
): string {
  const normalized = query.trim().toLowerCase().replace(/\s+/g, ' ');
  return `${NAMESPACE}:place-search:${VERSION}:${provider}:${limit}:${sha256(normalized)}`;
}

export function analysisKey(
  planningContextId: string,
  geometry: unknown,
  scope: AccessScope,
): string {
  return `${NAMESPACE}:analysis:${VERSION}:${planningContextId}:${scope}:${sha256(JSON.stringify(geometry))}`;
}

export function planningSummaryKey(
  planningContextId: string,
  scope: AccessScope,
  analysisResult: unknown,
): string {
  return `${NAMESPACE}:summary:${VERSION}:${planningContextId}:${scope}:${sha256(
    fingerprintAnalysis(analysisResult),
  )}`;
}

function fingerprintAnalysis(input: unknown): string {
  const r = (input ?? {}) as Record<string, unknown>;
  const num = (value: unknown): number =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0;
  const len = (value: unknown): number =>
    Array.isArray(value) ? value.length : 0;
  const arr = (value: unknown): unknown[] =>
    Array.isArray(value) ? value : [];

  const fingerprint = {
    areaSqm: num(r.areaSqm),
    parcelCount: num(r.parcelCount),
    averageDevelopmentScore:
      r.averageDevelopmentScore === null ? null : num(r.averageDevelopmentScore),
    zoning: arr(r.zoningBreakdown)
      .map(
        (z) =>
          `${(z as Record<string, unknown>)?.zoneCode ?? ''}:${(z as Record<string, unknown>)?.count ?? ''}`,
      )
      .sort(),
    constraints: arr(r.intersectingConstraints)
      .map((c) => `${(c as Record<string, unknown>)?.id ?? ''}`)
      .sort(),
    transit: arr(r.nearbyTransit)
      .map((t) => `${(t as Record<string, unknown>)?.id ?? ''}`)
      .sort(),
    activityCount: num(r.developmentActivityCount),
    constraintCount: len(r.intersectingConstraints),
    transitCount: len(r.nearbyTransit),
    planningContextId:
      typeof r.planningContextId === 'string' ? r.planningContextId : '',
  };
  return JSON.stringify(fingerprint);
}

export const CACHE_TTL = {
  layers: 600,
  parcels: 300,
  parcelDetail: 600,
  search: 120,
  analysis: 300,
  summary: 300,
  placeSearch: 86400,
  placeSearchStaticFallback: 3600,
} as const;

export const PLANNING_CACHE_PATTERNS = [
  `${NAMESPACE}:layers:*`,
  `${NAMESPACE}:parcels:*`,
  `${NAMESPACE}:parcel:*`,
  `${NAMESPACE}:search:*`,
  `${NAMESPACE}:analysis:*`,
  `${NAMESPACE}:summary:*`,
];

export const ALL_CACHE_PATTERN = `${NAMESPACE}:*`;
