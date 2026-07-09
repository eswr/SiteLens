import { create } from 'zustand';
import type { PlanningLayerId } from '../types/planning';
import { PLANNING_LAYERS } from '../data/layers';

const DEFAULT_VISIBLE_LAYER_IDS: PlanningLayerId[] = PLANNING_LAYERS.filter(
  (layer) => layer.defaultVisible,
).map((layer) => layer.id);

interface LayerState {
  /** Ids of layers currently shown on the map. */
  visibleLayerIds: PlanningLayerId[];
  /** Flip a layer between visible and hidden. */
  toggleLayer: (layerId: PlanningLayerId) => void;
  /** Explicitly set a layer's visibility. */
  setLayerVisible: (layerId: PlanningLayerId, visible: boolean) => void;
  /** Read whether a layer is currently visible. */
  isLayerVisible: (layerId: PlanningLayerId) => boolean;
}

/** Tracks which planning layers are visible. Kept separate from map camera state. */
export const useLayerStore = create<LayerState>((set, get) => ({
  visibleLayerIds: DEFAULT_VISIBLE_LAYER_IDS,
  toggleLayer: (layerId) =>
    set((state) => ({
      visibleLayerIds: state.visibleLayerIds.includes(layerId)
        ? state.visibleLayerIds.filter((id) => id !== layerId)
        : [...state.visibleLayerIds, layerId],
    })),
  setLayerVisible: (layerId, visible) =>
    set((state) => {
      const isVisible = state.visibleLayerIds.includes(layerId);
      if (visible === isVisible) {
        return state;
      }
      return {
        visibleLayerIds: visible
          ? [...state.visibleLayerIds, layerId]
          : state.visibleLayerIds.filter((id) => id !== layerId),
      };
    }),
  isLayerVisible: (layerId) => get().visibleLayerIds.includes(layerId),
}));
