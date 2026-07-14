import { bbox as turfBbox, center as turfCenter } from '@turf/turf';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import { LOCAL_DEMO_SYDNEY_CONTEXT_ID } from '@sitelens/shared';
import { PLANNING_LAYERS } from '../data/layers';
import { getFeatureTitle, getFeatureSubtitle } from '../data/featureDisplay';
import type { PlanningLayerId } from '../types/planning';
import { isApiConfigured } from '../api/client';
import { fetchLayerGeoJson } from '../api/layersApi';

/** A searchable, geocoded record derived from a planning GeoJSON feature. */
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

async function loadLayerCollection(
  layerId: PlanningLayerId,
  sourceUrl: string,
  planningContextId: string,
): Promise<FeatureCollection> {
  if (
    isApiConfigured() &&
    planningContextId !== LOCAL_DEMO_SYDNEY_CONTEXT_ID
  ) {
    return fetchLayerGeoJson(layerId, planningContextId);
  }
  if (isApiConfigured()) {
    // Prefer backend Sydney context when API mode is on so search matches PostGIS.
    try {
      return await fetchLayerGeoJson(layerId, planningContextId);
    } catch {
      // Fall through to static files.
    }
  }
  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to load ${layerId} (${response.status})`);
  }
  return (await response.json()) as FeatureCollection;
}

/**
 * Build a searchable index for the selected planning context.
 *
 * API mode loads features from the backend; frontend-only mode uses Sydney
 * static GeoJSON under `/data/*.geojson`.
 */
export async function buildFeatureIndex(
  planningContextId: string = LOCAL_DEMO_SYDNEY_CONTEXT_ID,
): Promise<IndexedFeature[]> {
  const perLayer = await Promise.all(
    PLANNING_LAYERS.map(async (layer) => {
      const collection = await loadLayerCollection(
        layer.id,
        layer.sourceUrl,
        planningContextId,
      );
      return collection.features.map((feature) =>
        indexFeature(feature, layer.id, layer.sourceId),
      );
    }),
  );

  return perLayer.flat();
}
