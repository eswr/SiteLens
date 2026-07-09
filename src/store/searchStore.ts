import { create } from 'zustand';
import { buildFeatureIndex } from '../utils/featureIndex';
import type { IndexedFeature } from '../utils/featureIndex';

const MAX_RESULTS = 8;

/** Build a lowercased haystack from a record's label, subtitle, and properties. */
function haystackFor(record: IndexedFeature): string {
  const propValues = Object.values(record.properties)
    .filter((value) => typeof value === 'string' || typeof value === 'number')
    .join(' ');
  return `${record.label} ${record.subtitle} ${propValues}`.toLowerCase();
}

interface SearchState {
  query: string;
  results: IndexedFeature[];
  /** True while the feature index is being built. */
  isLoading: boolean;
  error: string | null;
  /** The built index, or `null` before it loads. */
  index: IndexedFeature[] | null;
  /** Build the index once (idempotent). Safe to call on mount. */
  initialize: () => Promise<void>;
  /** Update the query string and recompute results against the loaded index. */
  setQuery: (query: string) => void;
  /** Run a search for `query` against the loaded index. */
  search: (query: string) => void;
  /** Reset the query and results. */
  clearSearch: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  results: [],
  isLoading: false,
  error: null,
  index: null,

  initialize: async () => {
    const { index, isLoading } = get();
    if (index || isLoading) {
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const built = await buildFeatureIndex();
      set({ index: built, isLoading: false });
      // Re-run any query entered while the index was loading.
      const { query } = get();
      if (query.trim()) {
        get().search(query);
      }
    } catch (error) {
      set({
        isLoading: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load search index.',
      });
    }
  },

  setQuery: (query) => {
    set({ query });
    get().search(query);
  },

  search: (query) => {
    const { index } = get();
    const trimmed = query.trim().toLowerCase();
    if (!trimmed || !index) {
      set({ results: [] });
      return;
    }
    const matches = index
      .filter((record) => haystackFor(record).includes(trimmed))
      .slice(0, MAX_RESULTS);
    set({ results: matches });
  },

  clearSearch: () => set({ query: '', results: [] }),
}));
