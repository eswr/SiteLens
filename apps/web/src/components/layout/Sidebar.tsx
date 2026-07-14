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
import SearchIcon from '@mui/icons-material/Search';
import PublicIcon from '@mui/icons-material/Public';
import GestureIcon from '@mui/icons-material/Gesture';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { PLANNING_LAYERS, LAYER_COLORS, LAYER_BY_ID } from '../../data/layers';
import { useLayerStore } from '../../store/layerStore';
import { useSearchStore } from '../../store/searchStore';
import { useMapStore } from '../../store/mapStore';
import { useAnalysisStore, MIN_AOI_POINTS } from '../../store/analysisStore';
import { useUiStore } from '../../store/uiStore';
import { useAiSummaryStore } from '../../store/aiSummaryStore';
import { useAuthStore } from '../../store/authStore';
import {
  usePlaceSearchStore,
  MIN_PLACE_QUERY_LENGTH,
} from '../../store/placeSearchStore';
import { isApiConfigured } from '../../api/client';
import { AnalysisSummaryCompact } from '../analysis/AnalysisSummary';
import { DemoAccessSwitcher } from './AccessControls';
import type { IndexedFeature } from '../../utils/featureIndex';
import type { PlaceSearchResult } from '../../api/geocodingApi';
import type { PlanningLayerId } from '../../types/planning';

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

  useEffect(() => {
    initialize();
  }, [initialize]);

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
  const [input, setInput] = useState('');
  const search = usePlaceSearchStore((state) => state.search);
  const selectPlace = usePlaceSearchStore((state) => state.selectPlace);
  const requestFlyToFeature = useMapStore((state) => state.requestFlyToFeature);
  const results = usePlaceSearchStore((state) => state.results);
  const isLoading = usePlaceSearchStore((state) => state.isLoading);
  const error = usePlaceSearchStore((state) => state.error);
  const cacheStatus = usePlaceSearchStore((state) => state.cacheStatus);
  const attribution = usePlaceSearchStore((state) => state.attribution);

  const apiConfigured = isApiConfigured();
  const canSubmit =
    apiConfigured && input.trim().length >= MIN_PLACE_QUERY_LENGTH && !isLoading;

  const submit = () => {
    if (!isLoading) {
      void search(input);
    }
  };

  const handleSelect = (place: PlaceSearchResult) => {
    selectPlace(place);
    // Reuse the shared fly-to path; place bbox is [south, north, west, east].
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
      <Stack direction="row" spacing={1}>
        <TextField
          fullWidth
          size="small"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
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
            htmlInput: { 'aria-label': 'Search worldwide places' },
          }}
        />
      </Stack>
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

      {results.length > 0 && (
        <>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              mt: 1.5,
              mb: 0.5,
            }}
          >
            <Typography variant="caption" color="text.secondary">
              {results.length} result{results.length === 1 ? '' : 's'}
            </Typography>
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
                  onClick={() => handleSelect(place)}
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
                    label="Nominatim"
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
            {attribution ?? '© OpenStreetMap contributors; geocoding by Nominatim'}
          </Typography>
        </>
      )}
    </>
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
    setDetailsTab('aiSummary');
    if (!aiSummary) {
      generateSummary(analysisResult, analysisEngine ?? undefined);
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
              <Typography variant="subtitle2">{layer.label}</Typography>
              <Typography variant="body2" color="text.secondary">
                {layer.description}
              </Typography>
            </Box>
            <Switch
              size="small"
              checked={checked}
              onChange={() => toggleLayer(layer.id)}
              slotProps={{
                input: { 'aria-label': `Toggle ${layer.label} layer` },
              }}
            />
          </Box>
        );
      })}
    </Box>
  );
}

function Legend() {
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
              {layer.label}
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
          SiteLens is a portfolio demo using mock GeoJSON data. It demonstrates
          geospatial frontend engineering, spatial analysis, analytics
          dashboards, and deterministic AI-assisted planning summaries.
        </Typography>
      </Box>
    </Box>
  );
}
