import type { FeatureCollection } from 'geojson';
import type { PlanningLayerId } from '../types/planning';
import { apiGet } from './client';

/** Fetch a layer FeatureCollection for the selected planning context. */
export async function fetchLayerGeoJson(
  layerId: PlanningLayerId,
  planningContextId: string,
): Promise<FeatureCollection> {
  const params = new URLSearchParams({ planningContextId });
  return apiGet<FeatureCollection>(
    `/api/layers/${encodeURIComponent(layerId)}/geojson?${params.toString()}`,
  );
}
