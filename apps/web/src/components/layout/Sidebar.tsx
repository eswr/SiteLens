import { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import Divider from '@mui/material/Divider';
import TextField from '@mui/material/TextField';
import InputAdornment from '@mui/material/InputAdornment';
import List from '@mui/material/List';
import ListItemButton from '@mui/material/ListItemButton';
import CircularProgress from '@mui/material/CircularProgress';
import Alert from '@mui/material/Alert';
import Chip from '@mui/material/Chip';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import MenuItem from '@mui/material/MenuItem';
import SearchIcon from '@mui/icons-material/Search';
import PublicIcon from '@mui/icons-material/Public';
import GestureIcon from '@mui/icons-material/Gesture';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import {
  PLANNING_LAYERS,
  LAYER_COLORS,
  LAYER_BY_ID,
  layerLabelsForSource,
} from '../../data/layers';
import { useLayerStore } from '../../store/layerStore';
import { useSearchStore } from '../../store/searchStore';
import { useMapStore } from '../../store/mapStore';
import PlanningContextHealthCard from '../planning/PlanningContextHealthCard';
import { useAnalysisStore, MIN_AOI_POINTS } from '../../store/analysisStore';
import { useUiStore } from '../../store/uiStore';
import { useAiSummaryStore } from '../../store/aiSummaryStore';
import { useAuthStore } from '../../store/authStore';
import {
  usePlaceSearchStore,
  MIN_PLACE_QUERY_LENGTH,
  MIN_SUGGESTION_QUERY_LENGTH,
} from '../../store/placeSearchStore';
import { usePlanningContextStore } from '../../store/planningContextStore';
import {
  usePlanningContextDetail,
  usePlanningContexts,
} from '../../query/planningContextQueries';
import { isApiConfigured } from '../../api/client';
import { AnalysisSummaryCompact } from '../analysis/AnalysisSummary';
import { DemoAccessSwitcher } from './AccessControls';
import type { IndexedFeature } from '../../utils/featureIndex';
import type {
  PlaceSearchResult,
  PlaceSuggestion,
  PlaceSuggestionSource,
} from '../../api/geocodingApi';
import type { PlanningLayerId } from '../../types/planning';

const SUGGESTION_SOURCE_LABEL: Record<PlaceSuggestionSource, string> = {
  'static-demo': 'Demo suggestion',
  recent: 'Recent',
  'cached-search-result': 'From last search',
};

function providerChipLabel(provider: PlaceSearchResult['provider']): string {
  return provider === 'static-demo' ? 'Demo fallback' : 'Nominatim';
}

function flyToPlace(
  place: Pick<
    PlaceSearchResult,
    'latitude' | 'longitude' | 'boundingBox'
  >,
  requestFlyToFeature: (payload: {
    center: [number, number];
    bbox?: [number, number, number, number];
    geometryType: string;
  }) => void,
) {
  const bbox = place.boundingBox
    ? ([
        place.boundingBox[2],
        place.boundingBox[0],
        place.boundingBox[3],
        place.boundingBox[1],
      ] as [number, number, number, number])
    : undefined;
  requestFlyToFeature({
    center: [place.longitude, place.latitude],
    bbox,
    geometryType: bbox ? 'Polygon' : 'Point',
  });
}

function LayerColorDot({
  layerId,
  point,
}: {
  layerId: PlanningLayerId;
  point: boolean;
}) {
  return (
    <Box
      sx={{
        width: 12,
        height: 12,
        flexShrink: 0,
        borderRadius: point ? '50%' : '3px',
        backgroundColor: LAYER_COLORS[layerId],
      }}
    />
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        flexShrink: 0,
        p: 1.5,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper',
      }}
    >
      {children}
    </Box>
  );
}

function PlanningSearchInner() {
  const [input, setInput] = useState('');
  const initialize = useSearchStore((state) => state.initialize);
  const setQuery = useSearchStore((state) => state.setQuery);
  const clearSearch = useSearchStore((state) => state.clearSearch);
  const results = useSearchStore((state) => state.results);
  const isLoading = useSearchStore((state) => state.isLoading);
  const error = useSearchStore((state) => state.error);
  const query = useSearchStore((state) => state.query);

  const setSelectedFeature = useMapStore((state) => state.setSelectedFeature);
  const requestFlyToFeature = useMapStore((state) => state.requestFlyToFeature);
  const setLayerVisible = useLayerStore((state) => state.setLayerVisible);
  const cancelDrawing = useAnalysisStore((state) => state.cancelDrawing);
  const clearSelectedPlace = usePlaceSearchStore(
    (state) => state.clearSelectedPlace,
  );

  const selectedContextId = usePlanningContextStore(
    (state) => state.selectedContextId,
  );
  const dataRevision = usePlanningContextStore((state) => state.dataRevision);

  useEffect(() => {
    void initialize();
  }, [initialize, selectedContextId, dataRevision]);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(input), 200);
    return () => clearTimeout(timer);
  }, [input, setQuery]);

  const handleSelect = (record: IndexedFeature) => {
    // Selecting a search result exits any in-progress AOI drawing.
    cancelDrawing();
    // A planning-feature selection clears any selected worldwide place.
    clearSelectedPlace();
    setLayerVisible(record.layerId, true);
    setSelectedFeature({
      layerId: record.layerId,
      featureId: record.id,
      sourceId: record.sourceId,
      geometryType: record.geometry.type,
      properties: record.properties,
      center: record.center,
      bbox: record.bbox,
    });
    requestFlyToFeature({
      center: record.center,
      bbox: record.bbox,
      geometryType: record.geometry.type,
    });
    clearSearch();
    setInput('');
  };

  const showEmpty =
    query.trim() !== '' && !isLoading && !error && results.length === 0;

  return (
    <>
      <TextField
        fullWidth
        size="small"
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Search parcels, zones, transit, constraints..."
        disabled={isLoading || Boolean(error)}
        slotProps={{
          input: {
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" color="disabled" />
              </InputAdornment>
            ),
          },
          htmlInput: { 'aria-label': 'Search planning features' },
        }}
      />

      {isLoading && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mt: 1.5,
            color: 'text.secondary',
          }}
        >
          <CircularProgress size={16} />
          <Typography variant="body2">Loading search index…</Typography>
        </Box>
      )}

      {error && (
        <Alert severity="error" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}

      {showEmpty && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
          No matches for “{query.trim()}”.
        </Typography>
      )}

      {results.length > 0 && (
        <List dense disablePadding sx={{ mt: 1 }}>
          {results.map((record) => {
            const config = LAYER_BY_ID[record.layerId];
            return (
              <ListItemButton
                key={`${record.layerId}-${record.id}`}
                onClick={() => handleSelect(record)}
                sx={{ borderRadius: 1, alignItems: 'flex-start', gap: 1 }}
              >
                <Box sx={{ mt: 0.75 }}>
                  <LayerColorDot
                    layerId={record.layerId}
                    point={config.geometryType === 'point'}
                  />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                    {record.label}
                  </Typography>
                  {record.subtitle && (
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {record.subtitle}
                    </Typography>
                  )}
                </Box>
                <Chip
                  label={config.label}
                  size="small"
                  variant="outlined"
                  sx={{ flexShrink: 0, height: 20 }}
                />
              </ListItemButton>
            );
          })}
        </List>
      )}
    </>
  );
}

const PLACE_CACHE_LABEL: Record<string, string> = {
  hit: 'cache hit',
  miss: 'cache miss',
  disabled: 'cache disabled',
  error: 'cache error',
};

function PlacesSearchInner() {
  const query = usePlaceSearchStore((state) => state.query);
  const updateQuery = usePlaceSearchStore((state) => state.updateQuery);
  const search = usePlaceSearchStore((state) => state.search);
  const selectPlace = usePlaceSearchStore((state) => state.selectPlace);
  const selectSuggestion = usePlaceSearchStore(
    (state) => state.selectSuggestion,
  );
  const selectHighlightedSuggestion = usePlaceSearchStore(
    (state) => state.selectHighlightedSuggestion,
  );
  const highlightNextSuggestion = usePlaceSearchStore(
    (state) => state.highlightNextSuggestion,
  );
  const highlightPreviousSuggestion = usePlaceSearchStore(
    (state) => state.highlightPreviousSuggestion,
  );
  const clearSuggestions = usePlaceSearchStore(
    (state) => state.clearSuggestions,
  );
  const highlightSuggestion = usePlaceSearchStore(
    (state) => state.highlightSuggestion,
  );
  const suggestions = usePlaceSearchStore((state) => state.suggestions);
  const isSuggesting = usePlaceSearchStore((state) => state.isSuggesting);
  const highlightedSuggestionIndex = usePlaceSearchStore(
    (state) => state.highlightedSuggestionIndex,
  );
  const requestFlyToFeature = useMapStore((state) => state.requestFlyToFeature);
  const results = usePlaceSearchStore((state) => state.results);
  const isLoading = usePlaceSearchStore((state) => state.isLoading);
  const error = usePlaceSearchStore((state) => state.error);
  const cacheStatus = usePlaceSearchStore((state) => state.cacheStatus);
  const attribution = usePlaceSearchStore((state) => state.attribution);
  const provider = usePlaceSearchStore((state) => state.provider);
  const fallback = usePlaceSearchStore((state) => state.fallback);

  const apiConfigured = isApiConfigured();
  const trimmedQuery = query.trim();
  const canSubmit =
    apiConfigured &&
    trimmedQuery.length >= MIN_PLACE_QUERY_LENGTH &&
    !isLoading;
  const showSuggestionPanel =
    isSuggesting || trimmedQuery.length >= MIN_SUGGESTION_QUERY_LENGTH;
  const activeDescendantId =
    highlightedSuggestionIndex >= 0
      ? `place-suggestion-${highlightedSuggestionIndex}`
      : undefined;

  const submit = () => {
    if (!isLoading) {
      clearSuggestions();
      void search(query);
    }
  };

  const handleSelectResult = (place: PlaceSearchResult) => {
    selectPlace(place);
    flyToPlace(place, requestFlyToFeature);
  };

  const handleSelectSuggestion = (suggestion: PlaceSuggestion) => {
    selectSuggestion(suggestion);
    flyToPlace(suggestion, requestFlyToFeature);
  };

  if (!apiConfigured) {
    return (
      <Alert severity="info">
        Worldwide place search requires backend API mode. Set{' '}
        <code>VITE_API_BASE_URL</code> to enable it.
      </Alert>
    );
  }

  return (
    <>
      <Typography
        variant="caption"
        color="text.secondary"
        sx={{ display: 'block', mb: 1 }}
      >
        Suggestions are local: bundled demo places, recent selections, and
        results from this session’s explicit searches. Live geocoding runs only
        when you press Search.
      </Typography>
      <Stack direction="row" spacing={1}>
        <TextField
          fullWidth
          size="small"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              highlightNextSuggestion();
              return;
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              highlightPreviousSuggestion();
              return;
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              clearSuggestions();
              return;
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              if (
                isSuggesting &&
                highlightedSuggestionIndex >= 0 &&
                suggestions[highlightedSuggestionIndex]
              ) {
                const suggestion = suggestions[highlightedSuggestionIndex]!;
                selectHighlightedSuggestion();
                flyToPlace(suggestion, requestFlyToFeature);
                return;
              }
              submit();
            }
          }}
          placeholder="Search worldwide places…"
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <PublicIcon fontSize="small" color="disabled" />
                </InputAdornment>
              ),
            },
            htmlInput: {
              'aria-label': 'Search worldwide places',
              'aria-autocomplete': 'list',
              'aria-expanded': suggestions.length > 0,
              'aria-controls':
                suggestions.length > 0
                  ? 'place-suggestion-listbox'
                  : undefined,
              'aria-activedescendant': activeDescendantId,
              role: 'combobox',
            },
          }}
        />
      </Stack>

      {showSuggestionPanel && (
        <Box
          sx={{
            mt: 1,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            overflow: 'hidden',
            backgroundColor: 'background.paper',
          }}
        >
          {suggestions.length > 0 && (
            <>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ px: 1.5, pt: 1, display: 'block' }}
              >
                Suggestions
              </Typography>
              <List
                id="place-suggestion-listbox"
                role="listbox"
                dense
                disablePadding
                aria-label="Place suggestions"
              >
                {suggestions.map((suggestion, index) => {
                  const highlighted = index === highlightedSuggestionIndex;
                  return (
                    <ListItemButton
                      id={`place-suggestion-${index}`}
                      key={`${suggestion.source}-${suggestion.id}`}
                      role="option"
                      aria-selected={highlighted}
                      selected={highlighted}
                      onMouseEnter={() => highlightSuggestion(index)}
                      onClick={() => handleSelectSuggestion(suggestion)}
                      sx={{
                        borderRadius: 0,
                        alignItems: 'flex-start',
                        gap: 1,
                        py: 1,
                      }}
                    >
                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body2"
                          sx={{ fontWeight: 600 }}
                          noWrap
                        >
                          {suggestion.label}
                        </Typography>
                        <Typography
                          variant="caption"
                          color="text.secondary"
                          noWrap
                          sx={{ display: 'block' }}
                        >
                          {suggestion.displayName}
                        </Typography>
                        <Box
                          sx={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 0.5,
                            mt: 0.5,
                          }}
                        >
                          <Chip
                            label={SUGGESTION_SOURCE_LABEL[suggestion.source]}
                            size="small"
                            variant="outlined"
                            color={
                              suggestion.source === 'static-demo'
                                ? 'warning'
                                : 'default'
                            }
                            sx={{ height: 18, fontSize: '0.65rem' }}
                          />
                          <Chip
                            label={providerChipLabel(suggestion.provider)}
                            size="small"
                            variant="outlined"
                            sx={{ height: 18, fontSize: '0.65rem' }}
                          />
                        </Box>
                      </Box>
                    </ListItemButton>
                  );
                })}
              </List>
            </>
          )}
          <Box sx={{ px: 1.5, py: 1, borderTop: 1, borderColor: 'divider' }}>
            {trimmedQuery.length >= MIN_PLACE_QUERY_LENGTH ? (
              <Button
                fullWidth
                size="small"
                variant="text"
                disabled={!canSubmit}
                startIcon={<SearchIcon fontSize="small" />}
                onClick={submit}
                sx={{ justifyContent: 'flex-start', textTransform: 'none' }}
              >
                Search live geocoder for &ldquo;{trimmedQuery}&rdquo;
              </Button>
            ) : (
              <Typography variant="caption" color="text.secondary">
                Type at least 3 characters to search the live geocoder.
              </Typography>
            )}
          </Box>
        </Box>
      )}

      <Button
        fullWidth
        size="small"
        variant="contained"
        sx={{ mt: 1 }}
        disabled={!canSubmit}
        startIcon={<SearchIcon fontSize="small" />}
        onClick={submit}
      >
        Search places
      </Button>

      {isLoading && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            mt: 1.5,
            color: 'text.secondary',
          }}
        >
          <CircularProgress size={16} />
          <Typography variant="body2">Searching places…</Typography>
        </Box>
      )}

      {error && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          {error}
        </Alert>
      )}

      {fallback?.active && (
        <Alert severity="info" sx={{ mt: 1.5 }}>
          {fallback.message}
        </Alert>
      )}

      {results.length > 0 && (
        <>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 1,
              mt: 1.5,
              mb: 0.5,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {results.length} result{results.length === 1 ? '' : 's'}
            </Typography>
            {provider && (
              <Chip
                label={providerChipLabel(provider)}
                size="small"
                variant="outlined"
                color={provider === 'static-demo' ? 'warning' : 'default'}
                sx={{ height: 18, fontSize: '0.65rem' }}
              />
            )}
            {cacheStatus && PLACE_CACHE_LABEL[cacheStatus] && (
              <Chip
                label={PLACE_CACHE_LABEL[cacheStatus]}
                size="small"
                variant="outlined"
                sx={{ height: 18, fontSize: '0.65rem' }}
              />
            )}
          </Box>
          <List dense disablePadding>
            {results.map((place) => {
              const typeLabel = [place.category, place.type]
                .filter(Boolean)
                .join(' · ');
              return (
                <ListItemButton
                  key={place.id}
                  onClick={() => handleSelectResult(place)}
                  sx={{ borderRadius: 1, alignItems: 'flex-start', gap: 1 }}
                >
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                      {place.label}
                    </Typography>
                    {typeLabel && (
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        sx={{ textTransform: 'capitalize' }}
                        noWrap
                      >
                        {typeLabel}
                      </Typography>
                    )}
                  </Box>
                  <Chip
                    label={providerChipLabel(place.provider)}
                    size="small"
                    variant="outlined"
                    sx={{ flexShrink: 0, height: 20 }}
                  />
                </ListItemButton>
              );
            })}
          </List>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: 'block', mt: 1 }}
          >
            {attribution ??
              '© OpenStreetMap contributors; geocoding by Nominatim'}
          </Typography>
        </>
      )}
    </>
  );
}

function PlanningContextSection() {
  const loadContexts = usePlanningContextStore((state) => state.loadContexts);
  const contexts = usePlanningContextStore((state) => state.contexts);
  const selectedContextId = usePlanningContextStore(
    (state) => state.selectedContextId,
  );
  const selectedContext = usePlanningContextStore(
    (state) => state.selectedContext,
  );
  const selectedCounts = usePlanningContextStore(
    (state) => state.selectedCounts,
  );
  const countsLoading = usePlanningContextStore((state) => state.countsLoading);
  const lastBuildReused = usePlanningContextStore(
    (state) => state.lastBuildReused,
  );
  const selectContext = usePlanningContextStore((state) => state.selectContext);
  const isLoading = usePlanningContextStore((state) => state.isLoading);
  const buildingStub = usePlanningContextStore((state) => state.buildingStub);
  const isBuilding = usePlanningContextStore((state) => state.isBuilding);
  const {
    data: queriedContexts,
    isLoading: listLoading,
    isFetching: listFetching,
  } = usePlanningContexts();
  const { data: queriedDetail } = usePlanningContextDetail(selectedContextId, {
    enabled:
      Boolean(selectedContextId) && !isBuilding && buildingStub == null,
  });

  useEffect(() => {
    // Bootstrap selection once; list/detail freshness comes from Query.
    void loadContexts();
  }, [loadContexts]);

  useEffect(() => {
    if (!queriedContexts || queriedContexts.length === 0) {
      return;
    }
    usePlanningContextStore.setState((state) => ({
      contexts: queriedContexts,
      isLoading: false,
      selectedContext:
        queriedContexts.find((c) => c.id === state.selectedContextId) ??
        state.selectedContext,
    }));
  }, [queriedContexts]);

  useEffect(() => {
    if (!queriedDetail) {
      return;
    }
    usePlanningContextStore.setState((state) => {
      if (state.selectedContextId !== queriedDetail.context.id) {
        return state;
      }
      if (state.isBuilding || state.buildingStub) {
        return state;
      }
      return {
        selectedContext: queriedDetail.context,
        selectedCounts: queriedDetail.counts,
        countsLoading: false,
        contexts: state.contexts.map((c) =>
          c.id === queriedDetail.context.id ? queriedDetail.context : c,
        ),
      };
    });
  }, [queriedDetail]);

  return (
    <SectionCard>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Planning context
        {listFetching && !listLoading ? (
          <Typography
            component="span"
            variant="caption"
            color="text.secondary"
            sx={{ ml: 1 }}
          >
            refreshing…
          </Typography>
        ) : null}
      </Typography>
      <TextField
        select
        fullWidth
        size="small"
        label="Context"
        value={selectedContextId}
        disabled={isLoading || listLoading || contexts.length === 0}
        onChange={(event) => selectContext(event.target.value)}
        slotProps={{
          htmlInput: { 'aria-label': 'Select planning context' },
        }}
      >
        {contexts.map((context) => (
          <MenuItem
            key={context.id}
            value={context.id}
            disabled={context.status !== 'ready'}
          >
            {context.label}
            {context.status !== 'ready' ? ` · ${context.status}` : ''}
          </MenuItem>
        ))}
      </TextField>
      {selectedContext && (
        <PlanningContextHealthCard
          context={selectedContext}
          counts={selectedCounts}
          countsLoading={countsLoading}
          lastBuildReused={lastBuildReused}
        />
      )}
      {!isApiConfigured() && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
          External planning contexts require backend API mode.
        </Typography>
      )}
    </SectionCard>
  );
}

function SearchSection() {
  const [mode, setMode] = useState<'planning' | 'places'>('planning');
  return (
    <SectionCard>
      <Tabs
        value={mode}
        onChange={(_, value) => setMode(value as 'planning' | 'places')}
        variant="fullWidth"
        sx={{
          mb: 1.5,
          minHeight: 36,
          '& .MuiTab-root': {
            minHeight: 36,
            textTransform: 'none',
            fontSize: '0.78rem',
          },
        }}
      >
        <Tab value="planning" label="Planning features" />
        <Tab value="places" label="Places" />
      </Tabs>
      {mode === 'planning' ? <PlanningSearchInner /> : <PlacesSearchInner />}
    </SectionCard>
  );
}

function AnalysisSection() {
  const isDrawing = useAnalysisStore((state) => state.isDrawing);
  const draftPoints = useAnalysisStore((state) => state.draftPoints);
  const areaOfInterest = useAnalysisStore((state) => state.areaOfInterest);
  const analysisResult = useAnalysisStore((state) => state.analysisResult);
  const startDrawing = useAnalysisStore((state) => state.startDrawing);
  const completeDrawing = useAnalysisStore((state) => state.completeDrawing);
  const undoLastPoint = useAnalysisStore((state) => state.undoLastPoint);
  const cancelDrawing = useAnalysisStore((state) => state.cancelDrawing);
  const clearAnalysis = useAnalysisStore((state) => state.clearAnalysis);

  const setDetailsTab = useUiStore((state) => state.setDetailsTab);
  const aiSummary = useAiSummaryStore((state) => state.summary);
  const generateSummary = useAiSummaryStore((state) => state.generateSummary);
  const analysisEngine = useAnalysisStore((state) => state.analysisEngine);
  const canRunAnalysis = useAuthStore(
    (state) => state.capabilities.canRunAnalysis,
  );
  const canGenerateSummary = useAuthStore(
    (state) => state.capabilities.canGenerateSummary,
  );
  const analysisBlocked = isApiConfigured() && !canRunAnalysis;
  const summaryBlocked = isApiConfigured() && !canGenerateSummary;

  const summaryButtonLabel = !isApiConfigured()
    ? 'Generate AI summary'
    : canGenerateSummary
      ? 'Generate backend summary'
      : 'Generate local demo summary';

  const handleGenerateAi = () => {
    // Selected map features take over the Details panel; clear so the AI
    // Summary tab is actually visible after generation.
    useMapStore.getState().setSelectedFeature(null);
    setDetailsTab('aiSummary');
    if (!aiSummary) {
      void generateSummary(analysisResult, analysisEngine ?? undefined);
    }
  };

  const pointCount = draftPoints.length;

  return (
    <SectionCard>
      {isDrawing ? (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Click on the map to add points. Complete the area when you have at
            least {MIN_AOI_POINTS} points.
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {pointCount} point{pointCount === 1 ? '' : 's'} added
          </Typography>
          <Stack spacing={1} sx={{ mt: 1 }}>
            <Button
              fullWidth
              size="small"
              variant="contained"
              disabled={pointCount < MIN_AOI_POINTS}
              onClick={() => completeDrawing()}
            >
              Complete area
            </Button>
            <Stack direction="row" spacing={1}>
              <Button
                fullWidth
                size="small"
                variant="outlined"
                color="inherit"
                disabled={pointCount < 1}
                onClick={() => undoLastPoint()}
              >
                Undo point
              </Button>
              <Button
                fullWidth
                size="small"
                variant="outlined"
                color="inherit"
                onClick={() => cancelDrawing()}
              >
                Cancel
              </Button>
            </Stack>
          </Stack>
        </>
      ) : areaOfInterest ? (
        <Stack spacing={1.5}>
          <Stack direction="row" spacing={1}>
            <Button
              fullWidth
              size="small"
              variant="outlined"
              startIcon={<GestureIcon fontSize="small" />}
              onClick={() => startDrawing()}
            >
              Draw new
            </Button>
            <Button
              fullWidth
              size="small"
              variant="outlined"
              color="inherit"
              onClick={() => clearAnalysis()}
            >
              Clear analysis
            </Button>
          </Stack>
          <AnalysisSummaryCompact />
          <Button
            fullWidth
            size="small"
            variant="contained"
            startIcon={<AutoAwesomeIcon fontSize="small" />}
            onClick={handleGenerateAi}
          >
            {summaryButtonLabel}
          </Button>
          {summaryBlocked && (
            <Typography variant="caption" color="text.secondary">
              Backend summary requires Pro or Enterprise; Free mode uses a local
              demo summary.
            </Typography>
          )}
        </Stack>
      ) : (
        <>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
            Draw an area of interest to analyze parcels, zoning, constraints,
            transit, and development activity.
          </Typography>
          <Button
            fullWidth
            size="small"
            variant="contained"
            startIcon={<GestureIcon fontSize="small" />}
            onClick={() => startDrawing()}
          >
            Draw area
          </Button>
          {analysisBlocked && (
            <Typography
              variant="caption"
              color="warning.main"
              sx={{ display: 'block', mt: 1 }}
            >
              Backend PostGIS analysis requires the Pro or Enterprise plan;
              local Turf.js will be used at this plan level.
            </Typography>
          )}
        </>
      )}
    </SectionCard>
  );
}

function LayerToggles() {
  const visibleLayerIds = useLayerStore((state) => state.visibleLayerIds);
  const toggleLayer = useLayerStore((state) => state.toggleLayer);
  const selectedContext = usePlanningContextStore(
    (state) => state.selectedContext,
  );
  const labels = layerLabelsForSource(
    selectedContext?.source !== 'local-demo' &&
      selectedContext?.source !== undefined,
  );

  return (
    <Box
      sx={{
        flexShrink: 0,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      {PLANNING_LAYERS.map((layer, index) => {
        const checked = visibleLayerIds.includes(layer.id);
        return (
          <Box
            key={layer.id}
            sx={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 1,
              px: 1.5,
              py: 1,
              borderTop: index === 0 ? 0 : 1,
              borderColor: 'divider',
            }}
          >
            <Box sx={{ mt: 0.5 }}>
              <LayerColorDot layerId={layer.id} point={false} />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2">
                {labels[layer.id].label}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                {labels[layer.id].description}
              </Typography>
            </Box>
            <Switch
              size="small"
              checked={checked}
              onChange={() => toggleLayer(layer.id)}
              slotProps={{
                input: {
                  'aria-label': `Toggle ${labels[layer.id].label} layer`,
                },
              }}
            />
          </Box>
        );
      })}
    </Box>
  );
}

function Legend() {
  const selectedContext = usePlanningContextStore(
    (state) => state.selectedContext,
  );
  const labels = layerLabelsForSource(
    selectedContext?.source !== 'local-demo' &&
      selectedContext?.source !== undefined,
  );
  return (
    <SectionCard>
      <Typography variant="subtitle2" sx={{ mb: 1 }}>
        Legend
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
        {PLANNING_LAYERS.map((layer) => (
          <Box
            key={layer.id}
            sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
          >
            <LayerColorDot
              layerId={layer.id}
              point={layer.geometryType === 'point'}
            />
            <Typography variant="body2" color="text.secondary">
              {labels[layer.id].label}
            </Typography>
          </Box>
        ))}
      </Box>
    </SectionCard>
  );
}

/** Left navigation rail: search, analysis, live layer toggles, and legend. */
export default function Sidebar() {
  return (
    <Box
      component="nav"
      aria-label="Tools"
      sx={{
        width: { xs: 240, md: 280 },
        flexShrink: 0,
        height: '100%',
        overflowY: 'auto',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        backgroundColor: 'background.default',
        borderRight: 1,
        borderColor: 'divider',
      }}
    >
      <Typography variant="overline">Planning context</Typography>
      <PlanningContextSection />

      <Typography variant="overline">Search</Typography>
      <SearchSection />

      <Typography variant="overline">Analysis</Typography>
      <AnalysisSection />

      <Divider sx={{ my: 0.5 }} />

      <Typography variant="overline">Planning Layers</Typography>
      <LayerToggles />
      <Legend />

      <Divider sx={{ my: 0.5 }} />

      <Box sx={{ flexShrink: 0 }}>
        <DemoAccessSwitcher />
      </Box>

      <Box component="footer" sx={{ flexShrink: 0, pb: 1 }}>
        <Typography variant="overline" sx={{ display: 'block' }}>
          About
        </Typography>
        <Typography variant="caption" color="text.secondary">
          SiteLens can use the bundled Sydney Demo or build open-map planning
          context for a selected worldwide place. External contexts are not
          official zoning, cadastre, or development-application data.
        </Typography>
      </Box>
    </Box>
  );
}
