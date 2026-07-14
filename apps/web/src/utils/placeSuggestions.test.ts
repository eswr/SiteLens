import { describe, expect, it } from 'vitest';
import { STATIC_PLACE_SUGGESTIONS } from '../data/staticPlaceSuggestions';
import {
  MIN_SUGGESTION_QUERY_LENGTH,
  normalizePlaceQuery,
  rankPlaceSuggestions,
} from './placeSuggestions';

describe('placeSuggestions', () => {
  it('normalizes whitespace and case', () => {
    expect(normalizePlaceQuery('  New   York ')).toBe('new york');
  });

  it('ranks local suggestions only (no network dependency)', () => {
    const ranked = rankPlaceSuggestions('syd', STATIC_PLACE_SUGGESTIONS, 3);
    expect(ranked.length).toBeGreaterThan(0);
    expect(ranked[0]?.id).toBe('static-demo-sydney');
    expect(ranked.every((s) => s.provider === 'static-demo')).toBe(true);
  });

  it('rejects queries shorter than MIN_SUGGESTION_QUERY_LENGTH', () => {
    expect(MIN_SUGGESTION_QUERY_LENGTH).toBe(2);
    expect(rankPlaceSuggestions('a', STATIC_PLACE_SUGGESTIONS)).toEqual([]);
  });
});
