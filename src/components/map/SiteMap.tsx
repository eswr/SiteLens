import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Box from '@mui/material/Box';
import { INITIAL_CENTER, INITIAL_ZOOM, useMapStore } from '../../store/mapStore';
import { useLayerStore } from '../../store/layerStore';
import {
  CLICK_PRIORITY,
  CONFIG_BY_MAP_LAYER_ID,
  LAYER_COLORS,
  PLANNING_LAYERS,
} from '../../data/layers';
import type { PlanningLayerId } from '../../types/planning';

/** No-token public demo style. Swapped for a richer basemap in a later step. */
const MAP_STYLE = 'https://demotiles.maplibre.org/style.json';

/** MapLibre layer ids that respond to clicks/hover (fills and circles, not outlines). */
const INTERACTIVE_LAYER_IDS = PLANNING_LAYERS.flatMap((layer) =>
  layer.layerIds.filter(
    (id) => id.endsWith('-fill') || id.endsWith('-circle'),
  ),
);

/** Add every planning source + layer to a loaded map, honoring initial visibility. */
function addPlanningData(map: maplibregl.Map, visibleLayerIds: PlanningLayerId[]) {
  for (const layer of PLANNING_LAYERS) {
    if (!map.getSource(layer.sourceId)) {
      map.addSource(layer.sourceId, { type: 'geojson', data: layer.sourceUrl });
    }

    const color = LAYER_COLORS[layer.id];
    const visibility = visibleLayerIds.includes(layer.id) ? 'visible' : 'none';

    if (layer.geometryType === 'polygon') {
      const [fillId, lineId] = layer.layerIds;
      if (!map.getLayer(fillId)) {
        map.addLayer({
          id: fillId,
          type: 'fill',
          source: layer.sourceId,
          layout: { visibility },
          paint: {
            'fill-color': color,
            'fill-opacity': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              0.55,
              layer.id === 'parcels' ? 0.22 : 0.15,
            ],
          },
        });
      }
      if (!map.getLayer(lineId)) {
        map.addLayer({
          id: lineId,
          type: 'line',
          source: layer.sourceId,
          layout: { visibility },
          paint: {
            'line-color': color,
            'line-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              3,
              1,
            ],
          },
        });
      }
    } else {
      const [circleId] = layer.layerIds;
      if (!map.getLayer(circleId)) {
        map.addLayer({
          id: circleId,
          type: 'circle',
          source: layer.sourceId,
          layout: { visibility },
          paint: {
            'circle-color': color,
            'circle-radius': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              9,
              6,
            ],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 2,
          },
        });
      }
    }
  }
}

/**
 * Interactive MapLibre GL map with mock planning layers.
 *
 * The map instance is created once on mount and destroyed on unmount. Planning
 * sources/layers are added after the style loads. Layer visibility is driven by
 * the layer store, and clicks select a feature into the map store.
 */
export default function SiteMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const highlightRef = useRef<{ source: string; id: string } | null>(null);
  const [ready, setReady] = useState(false);

  const setViewport = useMapStore((state) => state.setViewport);
  const setSelectedFeature = useMapStore((state) => state.setSelectedFeature);
  const selectedFeature = useMapStore((state) => state.selectedFeature);
  const visibleLayerIds = useLayerStore((state) => state.visibleLayerIds);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      center: [INITIAL_CENTER.lng, INITIAL_CENTER.lat],
      zoom: INITIAL_ZOOM,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    const handleMoveEnd = () => {
      const { lng, lat } = map.getCenter();
      setViewport({ center: { lng, lat }, zoom: map.getZoom() });
    };
    map.on('moveend', handleMoveEnd);

    const handleClick = (event: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(event.point, {
        layers: INTERACTIVE_LAYER_IDS,
      });
      if (features.length === 0) {
        setSelectedFeature(null);
        return;
      }

      const best = pickByPriority(features);
      const config = best.layer.id
        ? CONFIG_BY_MAP_LAYER_ID[best.layer.id]
        : undefined;
      if (!config) {
        return;
      }

      const featureId = String(best.id ?? best.properties?.id ?? '');
      setSelectedFeature({
        layerId: config.id,
        featureId,
        geometryType: best.geometry.type,
        properties: best.properties ?? {},
        coordinates: [event.lngLat.lng, event.lngLat.lat],
      });
    };
    map.on('click', handleClick);

    const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
      const features = map.queryRenderedFeatures(event.point, {
        layers: INTERACTIVE_LAYER_IDS,
      });
      map.getCanvas().style.cursor = features.length > 0 ? 'pointer' : '';
    };
    map.on('mousemove', handleMouseMove);

    const handleLoad = () => {
      addPlanningData(map, useLayerStore.getState().visibleLayerIds);
      setReady(true);
    };
    map.on('load', handleLoad);

    return () => {
      map.off('moveend', handleMoveEnd);
      map.off('click', handleClick);
      map.off('mousemove', handleMouseMove);
      map.off('load', handleLoad);
      map.remove();
      mapRef.current = null;
      highlightRef.current = null;
      setReady(false);
    };
  }, [setViewport, setSelectedFeature]);

  // Sync layer visibility from the store to the map.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }
    for (const layer of PLANNING_LAYERS) {
      const visibility = visibleLayerIds.includes(layer.id) ? 'visible' : 'none';
      for (const mapLayerId of layer.layerIds) {
        if (map.getLayer(mapLayerId)) {
          map.setLayoutProperty(mapLayerId, 'visibility', visibility);
        }
      }
    }
  }, [visibleLayerIds, ready]);

  // Reflect the selected feature as a MapLibre feature-state for highlighting.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }

    if (highlightRef.current) {
      map.setFeatureState(highlightRef.current, { selected: false });
      highlightRef.current = null;
    }

    if (selectedFeature) {
      const config = PLANNING_LAYERS.find(
        (layer) => layer.id === selectedFeature.layerId,
      );
      if (config && selectedFeature.featureId) {
        const target = {
          source: config.sourceId,
          id: selectedFeature.featureId,
        };
        map.setFeatureState(target, { selected: true });
        highlightRef.current = target;
      }
    }
  }, [selectedFeature, ready]);

  return (
    <Box
      ref={containerRef}
      sx={{
        position: 'absolute',
        inset: 0,
        '& .maplibregl-map': { height: '100%', width: '100%' },
      }}
    />
  );
}

/** Choose the highest-priority feature among those returned by a query. */
function pickByPriority(features: MapGeoJSONFeature[]): MapGeoJSONFeature {
  const rank = (feature: MapGeoJSONFeature) => {
    const config = feature.layer.id
      ? CONFIG_BY_MAP_LAYER_ID[feature.layer.id]
      : undefined;
    const index = config ? CLICK_PRIORITY.indexOf(config.id) : -1;
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...features].sort((a, b) => rank(a) - rank(b))[0];
}
