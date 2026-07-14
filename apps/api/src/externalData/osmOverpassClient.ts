import { loadConfig } from '../config.js';
import type { ContextBbox } from './externalDataTypes.js';
import type { ExternalFeature } from './externalDataTypes.js';
import {
  markOverpassFailure,
  waitForOverpassSlot,
} from './overpassRateLimiter.js';

export class OverpassDisabledError extends Error {
  readonly code = 'OVERPASS_DISABLED';
  constructor(message = 'External Overpass provider is disabled.') {
    super(message);
    this.name = 'OverpassDisabledError';
  }
}

export class OverpassRequestError extends Error {
  readonly code = 'OVERPASS_ERROR';
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'OverpassRequestError';
    this.status = status;
  }
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  tags?: Record<string, string>;
  lat?: number;
  lon?: number;
  geometry?: Array<{ lat: number; lon: number }>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

function buildQuery(bbox: ContextBbox): string {
  const [west, south, east, north] = bbox;
  return `[out:json][timeout:15][bbox:${south},${west},${north},${east}];
(
  way["building"];
  relation["building"];
  way["landuse"];
  relation["landuse"];
  way["natural"="water"];
  relation["natural"="water"];
  way["leisure"="park"];
  relation["leisure"="park"];
  node["public_transport"];
  node["railway"="station"];
  node["amenity"="bus_station"];
  way["highway"];
  node["amenity"];
  way["construction"];
);
out body geom;`;
}

function classify(tags: Record<string, string>): ExternalFeature['kind'] {
  if (tags.building) return 'building';
  if (tags.construction) return 'construction';
  if (tags.landuse) return 'landuse';
  if (tags.natural === 'water' || tags.waterway) return 'water';
  if (tags.leisure === 'park' || tags.leisure === 'nature_reserve') return 'park';
  if (
    tags.public_transport ||
    tags.railway === 'station' ||
    tags.amenity === 'bus_station' ||
    tags.railway === 'halt' ||
    tags.station
  ) {
    return 'transit';
  }
  if (tags.highway) return 'road';
  if (tags.amenity) return 'amenity';
  return 'unknown';
}

function wayToPolygon(
  geometry: Array<{ lat: number; lon: number }>,
): { type: 'Polygon'; coordinates: number[][][] } | null {
  if (geometry.length < 3) return null;
  const ring = geometry.map((p) => [p.lon, p.lat] as [number, number]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!first || !last) return null;
  if (first[0] !== last[0] || first[1] !== last[1]) {
    ring.push([first[0], first[1]]);
  }
  if (ring.length < 4) return null;
  return { type: 'Polygon', coordinates: [ring] };
}

function wayToLineString(
  geometry: Array<{ lat: number; lon: number }>,
): { type: 'LineString'; coordinates: number[][] } | null {
  if (geometry.length < 2) return null;
  return {
    type: 'LineString',
    coordinates: geometry.map((p) => [p.lon, p.lat]),
  };
}

function elementToFeature(element: OverpassElement): ExternalFeature | null {
  const tags = element.tags ?? {};
  const kind = classify(tags);
  const id = `osm-${element.type}-${element.id}`;

  let geometry: ExternalFeature['geometry'] | null = null;
  if (element.type === 'node' && element.lat != null && element.lon != null) {
    geometry = {
      type: 'Point',
      coordinates: [element.lon, element.lat],
    };
  } else if (element.geometry && element.geometry.length > 0) {
    if (kind === 'road' || kind === 'construction') {
      geometry = wayToLineString(element.geometry);
      // Buffer-like treatment later prefers polygons; keep line for roads /
      // convert construction lines to crude envelopes when short.
      if (!geometry && kind === 'construction') {
        geometry = wayToPolygon(element.geometry);
      }
    } else {
      geometry = wayToPolygon(element.geometry);
    }
  }

  if (!geometry) return null;

  return {
    id,
    source: 'osm-overpass',
    kind,
    name: tags.name || tags['name:en'] || undefined,
    tags,
    geometry,
  };
}

/** Fetch and normalize OSM features for a small bbox (backend-only). */
export async function fetchOverpassFeatures(
  bbox: ContextBbox,
): Promise<ExternalFeature[]> {
  const config = loadConfig();
  if (!config.overpassEnabled) {
    throw new OverpassDisabledError();
  }
  if (
    config.isProduction &&
    config.overpassUserAgent.includes('replace-with-your-email')
  ) {
    throw new OverpassDisabledError(
      'OVERPASS_USER_AGENT must be set to an identifying contact string in production.',
    );
  }

  await waitForOverpassSlot(config.overpassMinIntervalMs);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.overpassTimeoutMs);
  try {
    const response = await fetch(config.overpassBaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': config.overpassUserAgent,
        Accept: 'application/json',
      },
      body: `data=${encodeURIComponent(buildQuery(bbox))}`,
      signal: controller.signal,
    });

    if (!response.ok) {
      await markOverpassFailure(response.status === 429 ? 120_000 : 60_000);
      throw new OverpassRequestError(
        `Overpass request failed (${response.status}). External data provider unavailable — try a smaller area or use Sydney Demo.`,
        response.status,
      );
    }

    const payload = (await response.json()) as OverpassResponse;
    const features: ExternalFeature[] = [];
    for (const element of payload.elements ?? []) {
      const feature = elementToFeature(element);
      if (feature) features.push(feature);
    }
    return features;
  } catch (error) {
    if (error instanceof OverpassRequestError || error instanceof OverpassDisabledError) {
      throw error;
    }
    await markOverpassFailure(60_000);
    const aborted =
      error instanceof Error &&
      (error.name === 'AbortError' || /aborted/i.test(error.message));
    throw new OverpassRequestError(
      aborted
        ? 'Overpass request timed out. Try a smaller area or use Sydney Demo.'
        : 'External data provider unavailable. Try again later or use Sydney Demo.',
    );
  } finally {
    clearTimeout(timer);
  }
}
