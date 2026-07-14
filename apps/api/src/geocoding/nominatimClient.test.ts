import { afterEach, describe, expect, it, vi } from 'vitest';
import { searchNominatim } from './nominatimClient';

function stubFetch(impl: () => Promise<Response>): void {
  vi.stubGlobal('fetch', vi.fn(impl));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const sampleItem = {
  place_id: 123,
  display_name:
    'Bengaluru, Bangalore North, Bengaluru Urban, Karnataka, India',
  lat: '12.9768',
  lon: '77.5901',
  boundingbox: ['12.834', '13.143', '77.460', '77.784'],
  category: 'place',
  type: 'city',
  importance: 0.72,
};

describe('searchNominatim', () => {
  it('maps a Nominatim item to a PlaceSearchResult', async () => {
    stubFetch(async () => new Response(JSON.stringify([sampleItem]), { status: 200 }));
    const results = await searchNominatim('bengaluru', 5);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      id: '123',
      latitude: 12.9768,
      longitude: 77.5901,
      category: 'place',
      type: 'city',
      importance: 0.72,
      provider: 'nominatim',
    });
    expect(results[0].boundingBox).toEqual([12.834, 13.143, 77.46, 77.784]);
  });

  it('returns an empty array when there are no results', async () => {
    stubFetch(async () => new Response('[]', { status: 200 }));
    expect(await searchNominatim('nowhere-xyz', 5)).toEqual([]);
  });

  it('maps 403 to GEOCODING_UPSTREAM_FORBIDDEN', async () => {
    stubFetch(async () => new Response('Access denied', { status: 403 }));
    await expect(searchNominatim('sydney', 5)).rejects.toMatchObject({
      statusCode: 502,
      code: 'GEOCODING_UPSTREAM_FORBIDDEN',
    });
  });

  it('maps 429 to GEOCODING_UPSTREAM_RATE_LIMITED', async () => {
    stubFetch(async () => new Response('rate limited', { status: 429 }));
    await expect(searchNominatim('sydney', 5)).rejects.toMatchObject({
      statusCode: 502,
      code: 'GEOCODING_UPSTREAM_RATE_LIMITED',
    });
  });

  it('maps a non-array response to GEOCODING_UPSTREAM_MALFORMED_RESPONSE', async () => {
    stubFetch(async () => new Response('{}', { status: 200 }));
    await expect(searchNominatim('sydney', 5)).rejects.toMatchObject({
      statusCode: 502,
      code: 'GEOCODING_UPSTREAM_MALFORMED_RESPONSE',
    });
  });

  it('maps invalid JSON to GEOCODING_UPSTREAM_MALFORMED_RESPONSE', async () => {
    stubFetch(async () => new Response('not json', { status: 200 }));
    await expect(searchNominatim('sydney', 5)).rejects.toMatchObject({
      statusCode: 502,
      code: 'GEOCODING_UPSTREAM_MALFORMED_RESPONSE',
    });
  });

  it('maps an aborted request to GEOCODING_UPSTREAM_TIMEOUT', async () => {
    stubFetch(async () => {
      const error = new Error('aborted');
      error.name = 'AbortError';
      throw error;
    });
    await expect(searchNominatim('sydney', 5)).rejects.toMatchObject({
      statusCode: 504,
      code: 'GEOCODING_UPSTREAM_TIMEOUT',
    });
  });
});
