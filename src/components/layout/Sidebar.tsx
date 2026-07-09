import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
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
import SearchIcon from '@mui/icons-material/Search';
import InsightsIcon from '@mui/icons-material/Insights';
import { PLANNING_LAYERS, LAYER_COLORS, LAYER_BY_ID } from '../../data/layers';
import { useLayerStore } from '../../store/layerStore';
import { useSearchStore } from '../../store/searchStore';
import { useMapStore } from '../../store/mapStore';
import type { IndexedFeature } from '../../utils/featureIndex';

interface PlaceholderSectionProps {
  icon: ReactNode;
  title: string;
  description: string;
}

function PlaceholderSection({
  icon,
  title,
  description,
}: PlaceholderSectionProps) {
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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
        <Box sx={{ display: 'flex', color: 'primary.main' }}>{icon}</Box>
        <Typography variant="subtitle2">{title}</Typography>
      </Box>
      <Typography variant="body2" color="text.secondary">
        {description}
      </Typography>
    </Box>
  );
}

function LayerColorDot({
  layerId,
  point,
}: {
  layerId: IndexedFeature['layerId'];
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
  const requestFlyToFeature = useMapStore(
    (state) => state.requestFlyToFeature,
  );
  const setLayerVisible = useLayerStore((state) => state.setLayerVisible);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Debounce the query update by ~200ms.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(input), 200);
    return () => clearTimeout(timer);
  }, [input, setQuery]);

  const handleSelect = (record: IndexedFeature) => {
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

  const showEmpty = query.trim() !== '' && !isLoading && !error && results.length === 0;

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
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
        <Box sx={{ display: 'flex', color: 'primary.main' }}>
          <SearchIcon fontSize="small" />
        </Box>
        <Typography variant="subtitle2">Search</Typography>
      </Box>

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
    </Box>
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
    </Box>
  );
}

/** Left navigation rail: search, live layer toggles, legend, and placeholder tools. */
export default function Sidebar() {
  return (
    <Box
      component="nav"
      aria-label="Tools"
      sx={{
        width: 280,
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

      <Typography variant="overline">Planning Layers</Typography>
      <LayerToggles />
      <Legend />

      <Divider sx={{ my: 0.5 }} />

      <Typography variant="overline">Tools</Typography>
      <PlaceholderSection
        icon={<InsightsIcon fontSize="small" />}
        title="Analysis"
        description="Run spatial analysis and view generated insights."
      />
    </Box>
  );
}
