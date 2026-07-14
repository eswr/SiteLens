import { create } from 'zustand';
import type {
  FlyToRequest,
  LngLat,
  MapViewport,
  SelectedFeature,
} from '../types/map';

/** Default camera position: Sydney, Australia. */
export const INITIAL_CENTER: LngLat = { lng: 151.2093, lat: -33.8688 };
export const INITIAL_ZOOM = 14;

/** Payload accepted by `requestFlyToFeature` (nonce is managed internally). */
type FlyToTarget = Omit<FlyToRequest, 'nonce'>;

interface MapState extends MapViewport {
  /** The currently selected feature, if any. */
  selectedFeature: SelectedFeature | null;
  /** Pending request for the map to move to a feature, if any. */
  flyToFeatureRequest: FlyToRequest | null;
  /** Update the viewport (typically wired to the map's `moveend` event). */
  setViewport: (viewport: MapViewport) => void;
  /** Set the selected feature, or clear the selection by passing `null`. */
  setSelectedFeature: (feature: SelectedFeature | null) => void;
  /** Ask the map to fly/fit to a feature. */
  requestFlyToFeature: (target: FlyToTarget) => void;
  /** Clear a pending fly-to request (called by the map after executing it). */
  clearFlyToFeatureRequest: () => void;
}

/**
 * Lightweight, framework-agnostic store for map + UI state.
 *
 * Holds the map camera, the currently selected feature, and pending map action
 * requests. Layer visibility lives in a separate `layerStore`.
 */
export const useMapStore = create<MapState>((set) => ({
  center: INITIAL_CENTER,
  zoom: INITIAL_ZOOM,
  selectedFeature: null,
  flyToFeatureRequest: null,
  setViewport: ({ center, zoom }) => set({ center, zoom }),
  setSelectedFeature: (feature) => set({ selectedFeature: feature }),
  requestFlyToFeature: (target) =>
    set((state) => ({
      flyToFeatureRequest: {
        ...target,
        nonce: (state.flyToFeatureRequest?.nonce ?? 0) + 1,
      },
    })),
  clearFlyToFeatureRequest: () => set({ flyToFeatureRequest: null }),
}));
