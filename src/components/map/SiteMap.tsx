import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import Box from '@mui/material/Box';
import { INITIAL_CENTER, INITIAL_ZOOM, useMapStore } from '../../store/mapStore';

/** No-token public demo style. Swapped for a richer basemap in a later step. */
const MAP_STYLE = 'https://demotiles.maplibre.org/style.json';

/**
 * Interactive MapLibre GL map.
 *
 * The map instance is created once on mount and destroyed on unmount. Camera
 * changes are pushed into the Zustand store on `moveend` so the rest of the UI
 * can react to viewport changes without holding a reference to the map.
 */
export default function SiteMap() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const setViewport = useMapStore((state) => state.setViewport);

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

    return () => {
      map.off('moveend', handleMoveEnd);
      map.remove();
      mapRef.current = null;
    };
  }, [setViewport]);

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
