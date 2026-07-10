/** Minimal GeoJSON shapes for ingestion (dependency-free). */
export interface IngestGeometry {
  type: string;
  coordinates: unknown;
}

export interface IngestFeature {
  type: 'Feature';
  id?: string | number;
  geometry: IngestGeometry | null;
  properties: Record<string, unknown> | null;
}

export interface IngestFeatureCollection {
  type: 'FeatureCollection';
  features: IngestFeature[];
}

/** Validate and narrow raw JSON to a FeatureCollection, or throw. */
export function assertFeatureCollection(
  data: unknown,
  sourceName: string,
): IngestFeatureCollection {
  if (!data || typeof data !== 'object') {
    throw new Error(`${sourceName}: not an object`);
  }
  const collection = data as Partial<IngestFeatureCollection>;
  if (collection.type !== 'FeatureCollection') {
    throw new Error(`${sourceName}: type is not "FeatureCollection"`);
  }
  if (!Array.isArray(collection.features)) {
    throw new Error(`${sourceName}: "features" is not an array`);
  }
  return collection as IngestFeatureCollection;
}

export interface FeatureValidation {
  ok: boolean;
  reason?: string;
}

/** Check a feature has usable geometry and all required properties. */
export function validateFeature(
  feature: IngestFeature,
  requiredProps: string[],
): FeatureValidation {
  if (!feature || feature.type !== 'Feature') {
    return { ok: false, reason: 'not a Feature' };
  }
  const geometry = feature.geometry;
  if (!geometry || typeof geometry !== 'object' || !geometry.type) {
    return { ok: false, reason: 'missing geometry' };
  }
  if (geometry.coordinates === undefined || geometry.coordinates === null) {
    return { ok: false, reason: 'missing geometry coordinates' };
  }
  const props = feature.properties ?? {};
  for (const key of requiredProps) {
    const value = props[key];
    if (value === undefined || value === null || value === '') {
      return { ok: false, reason: `missing property "${key}"` };
    }
  }
  return { ok: true };
}

/** Resolve a stable feature id from the feature or its properties. */
export function resolveFeatureId(feature: IngestFeature): string {
  const props = feature.properties ?? {};
  const id = feature.id ?? props.id;
  return id === undefined || id === null ? '' : String(id);
}
