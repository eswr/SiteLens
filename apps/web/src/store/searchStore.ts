import { create } from 'zustand';
import { buildFeatureIndex } from '../utils/featureIndex';
import type { IndexedFeature } from '../utils/featureIndex';
import { getSelectedPlanningContextId } from './planningContextStore';

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
  /** Context id the current index was built for. */
  indexedContextId: string | null;
  /** Build the index for the selected planning context. */
  initialize: () => Promise<void>;
  /** Drop the index so the next initialize rebuilds for the new context. */
  invalidateIndex: () => void;
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
  indexedContextId: null,

  initialize: async () => {
    const contextId = getSelectedPlanningContextId();
    const { index, isLoading, indexedContextId } = get();
    if (isLoading) {
      return;
    }
    if (index && indexedContextId === contextId) {
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const built = await buildFeatureIndex(contextId);
      set({
        index: built,
        indexedContextId: contextId,
        isLoading: false,
      });
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

  invalidateIndex: () =>
    set({ index: null, indexedContextId: null, results: [] }),

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
