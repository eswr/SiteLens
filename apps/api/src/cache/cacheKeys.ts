import { createHash } from 'node:crypto';

const NAMESPACE = 'sitelens';
const VERSION = 'v1';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function layersKey(): string {
  return `${NAMESPACE}:layers:${VERSION}`;
}

export function parcelsKey(): string {
  return `${NAMESPACE}:parcels:${VERSION}`;
}

export function parcelDetailKey(id: string): string {
  return `${NAMESPACE}:parcel:${VERSION}:${id}`;
}

export function searchKey(query: string): string {
  return `${NAMESPACE}:search:${VERSION}:${sha256(query.trim().toLowerCase())}`;
}

/** Hash the geometry so the key never contains raw coordinates. */
export function analysisKey(geometry: unknown): string {
  return `${NAMESPACE}:analysis:${VERSION}:${sha256(JSON.stringify(geometry))}`;
}

/** TTLs (seconds) per cached resource. */
export const CACHE_TTL = {
  layers: 600,
  parcels: 300,
  parcelDetail: 600,
  search: 120,
  analysis: 300,
} as const;

/** Key patterns cleared when planning data is re-ingested. */
export const PLANNING_CACHE_PATTERNS = [
  `${NAMESPACE}:layers:*`,
  `${NAMESPACE}:parcels:*`,
  `${NAMESPACE}:parcel:*`,
  `${NAMESPACE}:search:*`,
  `${NAMESPACE}:analysis:*`,
];

/** Pattern matching every SiteLens cache key. */
export const ALL_CACHE_PATTERN = `${NAMESPACE}:*`;
