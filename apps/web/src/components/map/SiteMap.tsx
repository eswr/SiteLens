import { useEffect, useRef, useState } from 'react';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { bbox as turfBbox, center as turfCenter } from '@turf/turf';
import type { Feature, FeatureCollection } from 'geojson';
import Box from '@mui/material/Box';
import { LOCAL_DEMO_SYDNEY_CONTEXT_ID } from '@sitelens/shared';
import { INITIAL_CENTER, INITIAL_ZOOM, useMapStore } from '../../store/mapStore';
import { useLayerStore } from '../../store/layerStore';
import { useAnalysisStore } from '../../store/analysisStore';
import { usePlaceSearchStore } from '../../store/placeSearchStore';
import { usePlanningContextStore } from '../../store/planningContextStore';
import {
  CLICK_PRIORITY,
  CONFIG_BY_MAP_LAYER_ID,
  LAYER_COLORS,
  PLANNING_LAYERS,
} from '../../data/layers';
import type { PlanningLayerId } from '../../types/planning';
import type { AreaOfInterest, AreaPoint } from '../../types/analysis';
import { isApiConfigured } from '../../api/client';
import { fetchLayerGeoJson } from '../../api/layersApi';

/** No-token public demo style. Swapped for a richer basemap in a later step. */
const MAP_STYLE = 'https://demotiles.maplibre.org/style.json';

/** MapLibre layer ids that respond to clicks/hover (fills and circles, not outlines). */
const INTERACTIVE_LAYER_IDS = PLANNING_LAYERS.flatMap((layer) =>
  layer.layerIds.filter(
    (id) => id.endsWith('-fill') || id.endsWith('-circle'),
  ),
);

/** Area-of-interest source/layer ids and styling. */
const AOI_SOURCE_ID = 'area-of-interest';
const AOI_COLOR = '#db2777';
const EMPTY_FEATURE_COLLECTION: FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

/** Add the AOI source and its fill/outline/draft layers, once, above planning layers. */
function addAoiLayers(map: maplibregl.Map) {
  if (!map.getSource(AOI_SOURCE_ID)) {
    map.addSource(AOI_SOURCE_ID, {
      type: 'geojson',
      data: EMPTY_FEATURE_COLLECTION,
    });
  }
  if (!map.getLayer('aoi-fill')) {
    map.addLayer({
      id: 'aoi-fill',
      type: 'fill',
      source: AOI_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': AOI_COLOR, 'fill-opacity': 0.12 },
    });
  }
  if (!map.getLayer('aoi-outline')) {
    map.addLayer({
      id: 'aoi-outline',
      type: 'line',
      source: AOI_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'line-color': AOI_COLOR, 'line-width': 2.5 },
    });
  }
  if (!map.getLayer('aoi-draft-line')) {
    map.addLayer({
      id: 'aoi-draft-line',
      type: 'line',
      source: AOI_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'LineString'],
      paint: {
        'line-color': AOI_COLOR,
        'line-width': 2,
        'line-dasharray': [2, 1],
      },
    });
  }
  if (!map.getLayer('aoi-draft-points')) {
    map.addLayer({
      id: 'aoi-draft-points',
      type: 'circle',
      source: AOI_SOURCE_ID,
      filter: ['==', ['geometry-type'], 'Point'],
      paint: {
        'circle-radius': 5,
        'circle-color': '#ffffff',
        'circle-stroke-color': AOI_COLOR,
        'circle-stroke-width': 2,
      },
    });
  }
}

/** Build the AOI source data: a completed polygon, or the in-progress draft. */
function buildAoiData(
  draftPoints: AreaPoint[],
  areaOfInterest: AreaOfInterest | null,
): FeatureCollection {
  const features: Feature[] = [];
  if (areaOfInterest) {
    features.push(areaOfInterest.polygon);
  } else if (draftPoints.length > 0) {
    if (draftPoints.length >= 2) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'LineString',
          coordinates: draftPoints.map((point) => [point.lng, point.lat]),
        },
      });
    }
    for (const point of draftPoints) {
      features.push({
        type: 'Feature',
        properties: {},
        geometry: { type: 'Point', coordinates: [point.lng, point.lat] },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

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
      const baseOpacity =
        layer.id === 'parcels' ? 0.22 : layer.id === 'zoning' ? 0.3 : 0.2;
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
              baseOpacity,
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
              layer.id === 'zoning' ? 2 : 1,
            ],
            // Dashed outline distinguishes the zoning underlay from parcels.
            ...(layer.id === 'zoning' ? { 'line-dasharray': [2, 1] } : {}),
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
              10,
              6,
            ],
            'circle-stroke-color': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              '#0f172a',
              '#ffffff',
            ],
            'circle-stroke-width': [
              'case',
              ['boolean', ['feature-state', 'selected'], false],
              3,
              2,
            ],
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
  const placeMarkerRef = useRef<maplibregl.Marker | null>(null);
  const [ready, setReady] = useState(false);

  const selectedPlace = usePlaceSearchStore((state) => state.selectedPlace);

  const setViewport = useMapStore((state) => state.setViewport);
  const setSelectedFeature = useMapStore((state) => state.setSelectedFeature);
  const selectedFeature = useMapStore((state) => state.selectedFeature);
  const flyToFeatureRequest = useMapStore((state) => state.flyToFeatureRequest);
  const clearFlyToFeatureRequest = useMapStore(
    (state) => state.clearFlyToFeatureRequest,
  );
  const visibleLayerIds = useLayerStore((state) => state.visibleLayerIds);
  const draftPoints = useAnalysisStore((state) => state.draftPoints);
  const areaOfInterest = useAnalysisStore((state) => state.areaOfInterest);
  const isDrawing = useAnalysisStore((state) => state.isDrawing);
  const selectedContextId = usePlanningContextStore(
    (state) => state.selectedContextId,
  );
  const dataRevision = usePlanningContextStore((state) => state.dataRevision);

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
      // While drawing an AOI, clicks add vertices instead of selecting features.
      if (useAnalysisStore.getState().isDrawing) {
        useAnalysisStore.getState().addDraftPoint({
          lng: event.lngLat.lng,
          lat: event.lngLat.lat,
        });
        return;
      }

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

      // Selecting a local planning feature clears any selected worldwide place.
      usePlaceSearchStore.getState().clearSelectedPlace();

      const featureId = String(best.id ?? best.properties?.id ?? '');
      const box = turfBbox(best) as [number, number, number, number];
      const centroid = turfCenter(best).geometry.coordinates as [
        number,
        number,
      ];
      setSelectedFeature({
        layerId: config.id,
        featureId,
        sourceId: config.sourceId,
        geometryType: best.geometry.type,
        properties: best.properties ?? {},
        center: centroid,
        bbox: box,
      });
    };
    map.on('click', handleClick);

    const handleMouseMove = (event: maplibregl.MapMouseEvent) => {
      if (useAnalysisStore.getState().isDrawing) {
        map.getCanvas().style.cursor = 'crosshair';
        return;
      }
      const features = map.queryRenderedFeatures(event.point, {
        layers: INTERACTIVE_LAYER_IDS,
      });
      map.getCanvas().style.cursor = features.length > 0 ? 'pointer' : '';
    };
    map.on('mousemove', handleMouseMove);

    const handleLoad = () => {
      addPlanningData(map, useLayerStore.getState().visibleLayerIds);
      addAoiLayers(map);
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
      placeMarkerRef.current = null;
      setReady(false);
    };
  }, [setViewport, setSelectedFeature]);

  // Show a marker for the selected worldwide place and fly/fit to it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }
    if (!selectedPlace) {
      placeMarkerRef.current?.remove();
      placeMarkerRef.current = null;
      return;
    }
    if (!placeMarkerRef.current) {
      placeMarkerRef.current = new maplibregl.Marker({ color: '#2563eb' });
    }
    const popup = new maplibregl.Popup({ offset: 24, closeButton: false }).setText(
      selectedPlace.label,
    );
    placeMarkerRef.current
      .setLngLat([selectedPlace.longitude, selectedPlace.latitude])
      .setPopup(popup)
      .addTo(map);

    const padding = { top: 60, bottom: 60, left: 60, right: 360 };
    const bb = selectedPlace.boundingBox; // [south, north, west, east]
    if (bb) {
      map.fitBounds(
        [
          [bb[2], bb[0]],
          [bb[3], bb[1]],
        ],
        { padding, maxZoom: 14, duration: 800 },
      );
    } else {
      map.flyTo({
        center: [selectedPlace.longitude, selectedPlace.latitude],
        zoom: 13,
        padding,
        duration: 800,
      });
    }
  }, [selectedPlace, ready]);

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

  // Reload planning source data when the selected planning context changes.
  useEffect(() => {
    if (!mapRef.current || !ready) {
      return;
    }
    const map: maplibregl.Map = mapRef.current;
    let cancelled = false;

    async function reloadSources() {
      for (const layer of PLANNING_LAYERS) {
        const source = map.getSource(layer.sourceId) as GeoJSONSource | undefined;
        if (!source) {
          continue;
        }
        try {
          if (isApiConfigured()) {
            const collection = await fetchLayerGeoJson(
              layer.id,
              selectedContextId || LOCAL_DEMO_SYDNEY_CONTEXT_ID,
            );
            if (!cancelled) {
              source.setData(collection);
            }
          } else if (
            selectedContextId === LOCAL_DEMO_SYDNEY_CONTEXT_ID ||
            !selectedContextId
          ) {
            source.setData(layer.sourceUrl);
          } else {
            source.setData(EMPTY_FEATURE_COLLECTION);
          }
        } catch {
          if (
            !cancelled &&
            (selectedContextId === LOCAL_DEMO_SYDNEY_CONTEXT_ID ||
              !selectedContextId)
          ) {
            source.setData(layer.sourceUrl);
          }
        }
      }
    }

    void reloadSources();
    return () => {
      cancelled = true;
    };
  }, [selectedContextId, dataRevision, ready]);

  // Execute pending fly-to requests, padding for the right-hand details panel.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !flyToFeatureRequest) {
      return;
    }
    const { bbox, center, geometryType } = flyToFeatureRequest;
    const padding = { top: 60, bottom: 60, left: 60, right: 360 };
    const isPoint =
      geometryType === 'Point' || geometryType === 'MultiPoint';

    if (!isPoint && bbox) {
      map.fitBounds(
        [
          [bbox[0], bbox[1]],
          [bbox[2], bbox[3]],
        ],
        { padding, maxZoom: 16, duration: 800 },
      );
    } else {
      map.flyTo({ center, zoom: 15, padding, duration: 800 });
    }
    clearFlyToFeatureRequest();
  }, [flyToFeatureRequest, ready, clearFlyToFeatureRequest]);

  // Keep the AOI source in sync with the draft/completed geometry.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }
    const source = map.getSource(AOI_SOURCE_ID) as GeoJSONSource | undefined;
    source?.setData(buildAoiData(draftPoints, areaOfInterest));
  }, [draftPoints, areaOfInterest, ready]);

  // Fit the map to a newly completed AOI.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !areaOfInterest) {
      return;
    }
    const box = turfBbox(areaOfInterest.polygon) as [
      number,
      number,
      number,
      number,
    ];
    map.fitBounds(
      [
        [box[0], box[1]],
        [box[2], box[3]],
      ],
      {
        padding: { top: 60, bottom: 60, left: 60, right: 360 },
        maxZoom: 16,
        duration: 800,
      },
    );
  }, [areaOfInterest, ready]);

  // Keep a crosshair cursor for the duration of draw mode.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) {
      return;
    }
    map.getCanvas().style.cursor = isDrawing ? 'crosshair' : '';
  }, [isDrawing, ready]);

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

    if (selectedFeature?.featureId && selectedFeature.sourceId) {
      const target = {
        source: selectedFeature.sourceId,
        id: selectedFeature.featureId,
      };
      map.setFeatureState(target, { selected: true });
      highlightRef.current = target;
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
