import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/** Minimal GeoJSON shapes for the mock data (avoids a geojson type dependency). */
export interface GeoFeature {
  type: 'Feature';
  id?: string | number;
  geometry: unknown;
  properties: Record<string, unknown> | null;
}

export interface GeoFeatureCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

/** Absolute path to `apps/api/data`, resolved relative to this module. */
const DATA_DIR = fileURLToPath(new URL('../../data/', import.meta.url));

const cache = new Map<string, GeoFeatureCollection>();

/**
 * Load a mock GeoJSON FeatureCollection by base name (e.g. `parcels`).
 * Results are cached in memory after the first successful load.
 */
export async function loadMockGeojson(
  name: string,
): Promise<GeoFeatureCollection> {
  const cached = cache.get(name);
  if (cached) {
    return cached;
  }

  const filePath = path.join(DATA_DIR, `${name}.geojson`);

  let raw: string;
  try {
    raw = await readFile(filePath, 'utf8');
  } catch {
    throw new Error(`Mock GeoJSON not found: ${name}.geojson`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Mock GeoJSON is not valid JSON: ${name}.geojson`);
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    (parsed as { type?: unknown }).type !== 'FeatureCollection' ||
    !Array.isArray((parsed as { features?: unknown }).features)
  ) {
    throw new Error(`Mock GeoJSON is not a FeatureCollection: ${name}.geojson`);
  }

  const collection = parsed as GeoFeatureCollection;
  cache.set(name, collection);
  return collection;
}
