import { createHash } from 'node:crypto';

const NAMESPACE = 'sitelens';
const VERSION = 'v1';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Entitlement scope (billing plan) used to segment cached responses by tier. */
export type AccessScope = 'free' | 'pro' | 'enterprise';

export function layersKey(): string {
  return `${NAMESPACE}:layers:${VERSION}`;
}

export function parcelsKey(scope: AccessScope): string {
  return `${NAMESPACE}:parcels:${VERSION}:${scope}`;
}

export function parcelDetailKey(id: string): string {
  return `${NAMESPACE}:parcel:${VERSION}:${id}`;
}

export function searchKey(query: string, scope: AccessScope): string {
  return `${NAMESPACE}:search:${VERSION}:${scope}:${sha256(query.trim().toLowerCase())}`;
}

/** Hash the geometry so the key never contains raw coordinates. */
export function analysisKey(geometry: unknown, scope: AccessScope): string {
  return `${NAMESPACE}:analysis:${VERSION}:${scope}:${sha256(JSON.stringify(geometry))}`;
}

/**
 * Cache key for a plan-scoped planning summary. The `analysisResult` is
 * normalized into a stable, minimal fingerprint before hashing, so the key
 * never embeds the raw analysis payload and is order-independent.
 */
export function planningSummaryKey(
  scope: AccessScope,
  analysisResult: unknown,
): string {
  return `${NAMESPACE}:summary:${VERSION}:${scope}:${sha256(
    fingerprintAnalysis(analysisResult),
  )}`;
}

/** Stable, minimal fingerprint of an analysis result for cache keying. */
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
      .map((z) => `${(z as Record<string, unknown>)?.zoneCode ?? ''}:${(z as Record<string, unknown>)?.count ?? ''}`)
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
  };
  return JSON.stringify(fingerprint);
}

/** TTLs (seconds) per cached resource. */
export const CACHE_TTL = {
  layers: 600,
  parcels: 300,
  parcelDetail: 600,
  search: 120,
  analysis: 300,
  summary: 300,
} as const;

/** Key patterns cleared when planning data is re-ingested. */
export const PLANNING_CACHE_PATTERNS = [
  `${NAMESPACE}:layers:*`,
  `${NAMESPACE}:parcels:*`,
  `${NAMESPACE}:parcel:*`,
  `${NAMESPACE}:search:*`,
  `${NAMESPACE}:analysis:*`,
  `${NAMESPACE}:summary:*`,
];

/** Pattern matching every SiteLens cache key. */
export const ALL_CACHE_PATTERN = `${NAMESPACE}:*`;
