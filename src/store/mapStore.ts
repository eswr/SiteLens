import { create } from 'zustand';
import type { LngLat, MapViewport } from '../types/map';

/** Default camera position: Sydney, Australia. */
export const INITIAL_CENTER: LngLat = { lng: 151.2093, lat: -33.8688 };
export const INITIAL_ZOOM = 11;

interface MapState extends MapViewport {
  /** Identifier of the currently selected feature, if any. */
  selectedFeatureId: string | null;
  /** Update the viewport (typically wired to the map's `moveend` event). */
  setViewport: (viewport: MapViewport) => void;
  /** Select a feature by id, or clear the selection by passing `null`. */
  setSelectedFeatureId: (id: string | null) => void;
}

/**
 * Lightweight, framework-agnostic store for map + UI state.
 *
 * Kept deliberately small for Step 1; later steps will add layer visibility,
 * drawn geometries, and analysis results here.
 */
export const useMapStore = create<MapState>((set) => ({
  center: INITIAL_CENTER,
  zoom: INITIAL_ZOOM,
  selectedFeatureId: null,
  setViewport: ({ center, zoom }) => set({ center, zoom }),
  setSelectedFeatureId: (id) => set({ selectedFeatureId: id }),
}));
