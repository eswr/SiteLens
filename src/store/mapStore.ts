import { create } from 'zustand';
import type { LngLat, MapViewport, SelectedFeature } from '../types/map';

/** Default camera position: Sydney, Australia. */
export const INITIAL_CENTER: LngLat = { lng: 151.2093, lat: -33.8688 };
export const INITIAL_ZOOM = 11;

interface MapState extends MapViewport {
  /** The currently selected feature, if any. */
  selectedFeature: SelectedFeature | null;
  /** Update the viewport (typically wired to the map's `moveend` event). */
  setViewport: (viewport: MapViewport) => void;
  /** Set the selected feature, or clear the selection by passing `null`. */
  setSelectedFeature: (feature: SelectedFeature | null) => void;
}

/**
 * Lightweight, framework-agnostic store for map + UI state.
 *
 * Holds the map camera and the currently selected feature. Layer visibility
 * lives in a separate `layerStore`.
 */
export const useMapStore = create<MapState>((set) => ({
  center: INITIAL_CENTER,
  zoom: INITIAL_ZOOM,
  selectedFeature: null,
  setViewport: ({ center, zoom }) => set({ center, zoom }),
  setSelectedFeature: (feature) => set({ selectedFeature: feature }),
}));
