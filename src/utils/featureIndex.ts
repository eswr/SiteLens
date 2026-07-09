import { bbox as turfBbox, center as turfCenter } from '@turf/turf';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { PLANNING_LAYERS } from '../data/layers';
import { getFeatureTitle, getFeatureSubtitle } from '../data/featureDisplay';
import type { PlanningLayerId } from '../types/planning';

/** A searchable, geocoded record derived from a mock GeoJSON feature. */
export interface IndexedFeature {
  id: string;
  layerId: PlanningLayerId;
  sourceId: string;
  label: string;
  subtitle: string;
  properties: Record<string, unknown>;
  geometry: Geometry;
  /** `[minX, minY, maxX, maxY]` in WGS84 degrees. */
  bbox: [number, number, number, number];
  /** `[lng, lat]` centroid. */
  center: [number, number];
}

function indexFeature(
  feature: Feature,
  layerId: PlanningLayerId,
  sourceId: string,
): IndexedFeature {
  const properties = (feature.properties ?? {}) as Record<string, unknown>;
  const id = String(feature.id ?? properties.id ?? '');
  const box = turfBbox(feature) as [number, number, number, number];
  const centroid = turfCenter(feature).geometry.coordinates as [number, number];

  return {
    id,
    layerId,
    sourceId,
    label: getFeatureTitle(layerId, properties),
    subtitle: getFeatureSubtitle(layerId, properties),
    properties,
    geometry: feature.geometry,
    bbox: box,
    center: centroid,
  };
}

/**
 * Fetch every mock planning GeoJSON file and build a flat, searchable index.
 *
 * Frontend-only: data is read from `/data/*.geojson`. Throws if any file fails
 * to load or parse, so callers can surface a clean error state.
 */
export async function buildFeatureIndex(): Promise<IndexedFeature[]> {
  const perLayer = await Promise.all(
    PLANNING_LAYERS.map(async (layer) => {
      const response = await fetch(layer.sourceUrl);
      if (!response.ok) {
        throw new Error(
          `Failed to load ${layer.label} (${response.status})`,
        );
      }
      const collection = (await response.json()) as FeatureCollection;
      return collection.features.map((feature) =>
        indexFeature(feature, layer.id, layer.sourceId),
      );
    }),
  );

  return perLayer.flat();
}
