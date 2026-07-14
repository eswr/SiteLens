import { describe, expect, it } from 'vitest';
import { searchNominatim } from './nominatimClient';

// Live Nominatim test. Skipped unless RUN_GEOCODING_LIVE_TESTS=true, so it never
// runs in the default test suite or on regular CI (it makes a real network call).
const runLive = process.env.RUN_GEOCODING_LIVE_TESTS === 'true';

describe.skipIf(!runLive)('searchNominatim (live)', () => {
  it('returns real results for a well-known place', async () => {
    const results = await searchNominatim('Sydney', 3);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].provider).toBe('nominatim');
    expect(Number.isFinite(results[0].latitude)).toBe(true);
  }, 15000);
});
