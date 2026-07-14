import type { PlaceSearchResult } from '@sitelens/shared';
import { loadConfig } from '../config';
import { HttpError } from '../auth/requireCapability';

const REQUEST_TIMEOUT_MS = 5000;

interface NominatimItem {
  place_id?: number | string;
  display_name?: string;
  name?: string;
  lat?: string;
  lon?: string;
  boundingbox?: [string, string, string, string] | string[];
  category?: string;
  type?: string;
  importance?: number;
}

/** Short, human-friendly label from a Nominatim display name. */
function toLabel(displayName: string): string {
  const parts = displayName.split(',').map((part) => part.trim());
  if (parts.length <= 3) {
    return displayName;
  }
  // First segment plus the last two (region, country) reads well as a label.
  return [parts[0], parts[parts.length - 2], parts[parts.length - 1]].join(', ');
}

function toBoundingBox(
  raw: NominatimItem['boundingbox'],
): [number, number, number, number] | undefined {
  if (!Array.isArray(raw) || raw.length !== 4) {
    return undefined;
  }
  const nums = raw.map((value) => Number(value));
  if (nums.some((value) => !Number.isFinite(value))) {
    return undefined;
  }
  // Nominatim order: [south, north, west, east].
  return [nums[0], nums[1], nums[2], nums[3]];
}

function mapItem(item: NominatimItem): PlaceSearchResult | null {
  const latitude = Number(item.lat);
  const longitude = Number(item.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  const displayName = item.display_name ?? item.name ?? '';
  return {
    id: String(item.place_id ?? `${latitude},${longitude}`),
    label: displayName ? toLabel(displayName) : `${latitude}, ${longitude}`,
    displayName,
    latitude,
    longitude,
    boundingBox: toBoundingBox(item.boundingbox),
    category: item.category,
    type: item.type,
    importance:
      typeof item.importance === 'number' ? item.importance : undefined,
    provider: 'nominatim',
  };
}

function throwForStatus(status: number): never {
  if (status === 403) {
    throw new HttpError(
      502,
      'GEOCODING_UPSTREAM_FORBIDDEN',
      'The geocoding provider denied this network.',
    );
  }
  if (status === 429) {
    throw new HttpError(
      502,
      'GEOCODING_UPSTREAM_RATE_LIMITED',
      'The geocoding provider rate-limited the request.',
    );
  }
  throw new HttpError(
    502,
    'GEOCODING_UPSTREAM_ERROR',
    'The geocoding provider returned an error.',
  );
}

/**
 * Call the Nominatim `/search` endpoint and map results to `PlaceSearchResult`.
 * Throws typed `HttpError`s with distinguishable codes. Never calls Nominatim
 * from the browser. Does not leak upstream HTML bodies to clients.
 */
export async function searchNominatim(
  query: string,
  limit: number,
): Promise<PlaceSearchResult[]> {
  const config = loadConfig();
  const url = new URL(`${config.nominatimBaseUrl}/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', String(limit));
  url.searchParams.set('addressdetails', '0');
  url.searchParams.set('polygon_geojson', '0');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': config.nominatimUserAgent,
        Accept: 'application/json',
      },
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new HttpError(
        504,
        'GEOCODING_UPSTREAM_TIMEOUT',
        'The geocoding provider timed out.',
      );
    }
    throw new HttpError(
      502,
      'GEOCODING_UPSTREAM_ERROR',
      'The geocoding provider is unavailable.',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    throwForStatus(response.status);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new HttpError(
      502,
      'GEOCODING_UPSTREAM_MALFORMED_RESPONSE',
      'The geocoding provider returned a malformed response.',
    );
  }

  if (!Array.isArray(payload)) {
    throw new HttpError(
      502,
      'GEOCODING_UPSTREAM_MALFORMED_RESPONSE',
      'The geocoding provider returned an unexpected response.',
    );
  }

  return payload
    .map((item) => mapItem(item as NominatimItem))
    .filter((item): item is PlaceSearchResult => item !== null);
}
