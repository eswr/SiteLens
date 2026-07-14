import type { PlaceSearchResult } from '@sitelens/shared';

/** Attribution for the bundled offline portfolio fallback dataset. */
export const STATIC_DEMO_ATTRIBUTION =
  'Static demo place dataset for offline portfolio fallback. Map data © OpenStreetMap contributors.';

interface StaticPlaceSeed {
  id: string;
  label: string;
  displayName: string;
  latitude: number;
  longitude: number;
  boundingBox?: [number, number, number, number];
  category: string;
  type: string;
  importance: number;
}

/**
 * Curated demo places for networks where public Nominatim is blocked.
 * This is not live worldwide geocoding — only a transparent portfolio fallback.
 */
const STATIC_DEMO_PLACES: StaticPlaceSeed[] = [
  {
    id: 'static-demo-bengaluru',
    label: 'Bengaluru, Karnataka, India',
    displayName: 'Bengaluru, Karnataka, India',
    latitude: 12.9716,
    longitude: 77.5946,
    boundingBox: [12.7, 13.2, 77.3, 77.9],
    category: 'place',
    type: 'city',
    importance: 0.9,
  },
  {
    id: 'static-demo-london',
    label: 'London, England, United Kingdom',
    displayName: 'London, England, United Kingdom',
    latitude: 51.5074,
    longitude: -0.1278,
    boundingBox: [51.28, 51.69, -0.51, 0.33],
    category: 'place',
    type: 'city',
    importance: 0.95,
  },
  {
    id: 'static-demo-sydney',
    label: 'Sydney, New South Wales, Australia',
    displayName: 'Sydney, New South Wales, Australia',
    latitude: -33.8688,
    longitude: 151.2093,
    boundingBox: [-34.12, -33.58, 150.52, 151.34],
    category: 'place',
    type: 'city',
    importance: 0.92,
  },
  {
    id: 'static-demo-new-york',
    label: 'New York, New York, United States',
    displayName: 'New York, New York, United States',
    latitude: 40.7128,
    longitude: -74.006,
    boundingBox: [40.48, 40.92, -74.26, -73.7],
    category: 'place',
    type: 'city',
    importance: 0.96,
  },
  {
    id: 'static-demo-tokyo',
    label: 'Tokyo, Japan',
    displayName: 'Tokyo, Japan',
    latitude: 35.6762,
    longitude: 139.6503,
    boundingBox: [35.5, 35.9, 139.4, 139.9],
    category: 'place',
    type: 'city',
    importance: 0.94,
  },
  {
    id: 'static-demo-singapore',
    label: 'Singapore',
    displayName: 'Singapore',
    latitude: 1.3521,
    longitude: 103.8198,
    boundingBox: [1.15, 1.48, 103.6, 104.1],
    category: 'place',
    type: 'city',
    importance: 0.91,
  },
  {
    id: 'static-demo-paris',
    label: 'Paris, Île-de-France, France',
    displayName: 'Paris, Île-de-France, France',
    latitude: 48.8566,
    longitude: 2.3522,
    boundingBox: [48.81, 48.9, 2.22, 2.47],
    category: 'place',
    type: 'city',
    importance: 0.93,
  },
  {
    id: 'static-demo-berlin',
    label: 'Berlin, Germany',
    displayName: 'Berlin, Germany',
    latitude: 52.52,
    longitude: 13.405,
    boundingBox: [52.34, 52.68, 13.09, 13.76],
    category: 'place',
    type: 'city',
    importance: 0.9,
  },
  {
    id: 'static-demo-toronto',
    label: 'Toronto, Ontario, Canada',
    displayName: 'Toronto, Ontario, Canada',
    latitude: 43.6532,
    longitude: -79.3832,
    boundingBox: [43.58, 43.86, -79.64, -79.11],
    category: 'place',
    type: 'city',
    importance: 0.89,
  },
  {
    id: 'static-demo-dubai',
    label: 'Dubai, United Arab Emirates',
    displayName: 'Dubai, United Arab Emirates',
    latitude: 25.2048,
    longitude: 55.2708,
    boundingBox: [24.85, 25.36, 54.89, 55.58],
    category: 'place',
    type: 'city',
    importance: 0.88,
  },
];

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function toResult(seed: StaticPlaceSeed): PlaceSearchResult {
  return {
    ...seed,
    provider: 'static-demo',
  };
}

/**
 * Search the bundled static demo place dataset. Matching is substring-based on
 * label/displayName with exact and startsWith ranked ahead of contains.
 */
export function searchStaticDemoPlaces(
  query: string,
  limit: number,
): PlaceSearchResult[] {
  const normalized = normalizeQuery(query);
  if (!normalized || limit <= 0) {
    return [];
  }

  type Ranked = { score: number; place: PlaceSearchResult };
  const ranked: Ranked[] = [];

  for (const seed of STATIC_DEMO_PLACES) {
    const label = seed.label.toLowerCase();
    const display = seed.displayName.toLowerCase();
    let score = 0;
    if (label === normalized || display === normalized) {
      score = 300;
    } else if (label.startsWith(normalized) || display.startsWith(normalized)) {
      score = 200;
    } else if (label.includes(normalized) || display.includes(normalized)) {
      score = 100;
    } else {
      // Token match (e.g. "new york" hits "New York, New York, United States").
      const tokens = normalized.split(' ').filter(Boolean);
      if (
        tokens.length > 0 &&
        tokens.every((token) => label.includes(token) || display.includes(token))
      ) {
        score = 80;
      }
    }
    if (score > 0) {
      ranked.push({ score: score + seed.importance, place: toResult(seed) });
    }
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit).map((entry) => entry.place);
}
