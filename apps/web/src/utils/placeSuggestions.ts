import type {
  PlaceSearchResult,
  PlaceSuggestion,
  PlaceSuggestionSource,
} from '../api/geocodingApi';

export const MIN_SUGGESTION_QUERY_LENGTH = 2;
export const DEFAULT_SUGGESTION_LIMIT = 6;

/** Collapse whitespace and lowercase for comparison. */
export function normalizePlaceQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, ' ');
}

function matchRank(normalizedQuery: string, suggestion: PlaceSuggestion): number {
  const label = suggestion.label.toLowerCase();
  const displayName = suggestion.displayName.toLowerCase();

  if (label === normalizedQuery) {
    return 500;
  }
  if (label.startsWith(normalizedQuery)) {
    return 400;
  }
  if (displayName.startsWith(normalizedQuery)) {
    return 300;
  }

  const tokens = normalizedQuery.split(' ').filter(Boolean);
  if (
    tokens.length > 0 &&
    tokens.every((token) => {
      const labelTokens = label.split(/[\s,]+/).filter(Boolean);
      const displayTokens = displayName.split(/[\s,]+/).filter(Boolean);
      return (
        labelTokens.some((t) => t.startsWith(token)) ||
        displayTokens.some((t) => t.startsWith(token))
      );
    })
  ) {
    return 200;
  }

  if (label.includes(normalizedQuery) || displayName.includes(normalizedQuery)) {
    return 100;
  }

  return 0;
}

/**
 * Rank and filter local place suggestions. No network calls.
 * Empty / short queries return [].
 */
export function rankPlaceSuggestions(
  query: string,
  suggestions: PlaceSuggestion[],
  limit: number = DEFAULT_SUGGESTION_LIMIT,
): PlaceSuggestion[] {
  const normalized = normalizePlaceQuery(query);
  if (normalized.length < MIN_SUGGESTION_QUERY_LENGTH || limit <= 0) {
    return [];
  }

  const seen = new Set<string>();
  const ranked: { score: number; suggestion: PlaceSuggestion }[] = [];

  for (const suggestion of suggestions) {
    if (seen.has(suggestion.id)) {
      continue;
    }
    const base = matchRank(normalized, suggestion);
    if (base <= 0) {
      continue;
    }
    seen.add(suggestion.id);
    ranked.push({
      score: base + (suggestion.importance ?? 0),
      suggestion,
    });
  }

  ranked.sort((a, b) => b.score - a.score);
  return ranked.slice(0, limit).map((entry) => entry.suggestion);
}

/** Map an explicit search result into a cacheable local suggestion. */
export function placeResultToSuggestion(
  result: PlaceSearchResult,
  source: PlaceSuggestionSource = 'cached-search-result',
): PlaceSuggestion {
  return {
    ...result,
    source,
  };
}

/** Drop suggestion metadata for map/details PlaceSearchResult consumers. */
export function suggestionToPlaceResult(
  suggestion: PlaceSuggestion,
): PlaceSearchResult {
  const { source: _source, ...place } = suggestion;
  return place;
}
