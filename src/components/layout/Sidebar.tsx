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
import SearchIcon from '@mui/icons-material/Search';
import GestureIcon from '@mui/icons-material/Gesture';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import { PLANNING_LAYERS, LAYER_COLORS, LAYER_BY_ID } from '../../data/layers';
import { useLayerStore } from '../../store/layerStore';
import { useSearchStore } from '../../store/searchStore';
import { useMapStore } from '../../store/mapStore';
import { useAnalysisStore, MIN_AOI_POINTS } from '../../store/analysisStore';
import { useUiStore } from '../../store/uiStore';
import { useAiSummaryStore } from '../../store/aiSummaryStore';
import { AnalysisSummaryCompact } from '../analysis/AnalysisSummary';
import type { IndexedFeature } from '../../utils/featureIndex';
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

function SearchSection() {
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
    <SectionCard>
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

  const handleGenerateAi = () => {
    setDetailsTab('aiSummary');
    if (!aiSummary) {
      generateSummary(analysisResult);
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
            Generate AI summary
          </Button>
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
    </Box>
  );
}
