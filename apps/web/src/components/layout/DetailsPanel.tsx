import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Button from '@mui/material/Button';
import Stack from '@mui/material/Stack';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import CenterFocusStrongIcon from '@mui/icons-material/CenterFocusStrong';
import CloseIcon from '@mui/icons-material/Close';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import PublicIcon from '@mui/icons-material/Public';
import { useMapStore } from '../../store/mapStore';
import { useAnalysisStore } from '../../store/analysisStore';
import { usePlaceSearchStore } from '../../store/placeSearchStore';
import { useUiStore } from '../../store/uiStore';
import AnalysisSummary from '../analysis/AnalysisSummary';
import AnalyticsDashboard from '../analysis/AnalyticsDashboard';
import PlanningSummaryPanel from '../analysis/PlanningSummaryPanel';
import AnalysisEngineChip from '../analysis/AnalysisEngineChip';
import { LAYER_BY_ID, LAYER_COLORS } from '../../data/layers';
import { PRIORITY_KEYS, TITLE_KEY, getFeatureTitle } from '../../data/featureDisplay';
import type { SelectedFeature } from '../../types/map';

function formatKey(key: string): string {
  const withSpaces = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ');
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === '') {
    return '—';
  }
  if (typeof value === 'number') {
    const formatted = value.toLocaleString('en-AU');
    return key.toLowerCase().includes('sqm') ? `${formatted} m²` : formatted;
  }
  return String(value);
}

function MetadataTable({
  entries,
}: {
  entries: [string, unknown][];
}) {
  return (
    <Box
      sx={{
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        overflow: 'hidden',
      }}
    >
      {entries.map(([key, value], index) => (
        <Box
          key={key}
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 2,
            px: 1.5,
            py: 1,
            borderTop: index === 0 ? 0 : 1,
            borderColor: 'divider',
          }}
        >
          <Typography variant="body2" color="text.secondary">
            {formatKey(key)}
          </Typography>
          <Typography
            variant="body2"
            sx={{ fontWeight: 600, textAlign: 'right' }}
          >
            {formatValue(key, value)}
          </Typography>
        </Box>
      ))}
    </Box>
  );
}

function SelectedFeatureDetails({ feature }: { feature: SelectedFeature }) {
  const config = LAYER_BY_ID[feature.layerId];
  const titleKey = TITLE_KEY[feature.layerId];
  const title = getFeatureTitle(feature.layerId, feature.properties);

  const requestFlyToFeature = useMapStore((state) => state.requestFlyToFeature);
  const setSelectedFeature = useMapStore((state) => state.setSelectedFeature);
  const areaOfInterest = useAnalysisStore((state) => state.areaOfInterest);

  const priorityKeys = PRIORITY_KEYS[feature.layerId].filter(
    (key) => key !== titleKey && feature.properties[key] !== undefined,
  );
  const shownKeys = new Set([...priorityKeys, titleKey, 'id']);
  const otherEntries = Object.entries(feature.properties).filter(
    ([key]) => !shownKeys.has(key),
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      {areaOfInterest && (
        <Button
          size="small"
          variant="text"
          startIcon={<ArrowBackIcon fontSize="small" />}
          onClick={() => setSelectedFeature(null)}
          sx={{ alignSelf: 'flex-start' }}
        >
          Back to AOI analysis
        </Button>
      )}
      <Box
        sx={{
          p: 2,
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          backgroundColor: 'background.paper',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Box
            sx={{
              width: 12,
              height: 12,
              borderRadius: config.geometryType === 'point' ? '50%' : '3px',
              backgroundColor: LAYER_COLORS[feature.layerId],
            }}
          />
          <Chip label={config.label} size="small" variant="outlined" />
        </Box>
        <Typography variant="subtitle1">{title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {feature.geometryType} · {feature.center[1].toFixed(4)},{' '}
          {feature.center[0].toFixed(4)}
        </Typography>
      </Box>

      <Stack direction="row" spacing={1}>
        <Button
          fullWidth
          size="small"
          variant="contained"
          startIcon={<CenterFocusStrongIcon fontSize="small" />}
          onClick={() =>
            requestFlyToFeature({
              center: feature.center,
              bbox: feature.bbox,
              geometryType: feature.geometryType,
            })
          }
        >
          Zoom to feature
        </Button>
        <Button
          fullWidth
          size="small"
          variant="outlined"
          color="inherit"
          startIcon={<CloseIcon fontSize="small" />}
          onClick={() => setSelectedFeature(null)}
        >
          Clear selection
        </Button>
      </Stack>

      {priorityKeys.length > 0 && (
        <Box>
          <Typography variant="overline" sx={{ display: 'block', mb: 0.5 }}>
            Key facts
          </Typography>
          <MetadataTable
            entries={priorityKeys.map((key) => [key, feature.properties[key]])}
          />
        </Box>
      )}

      {otherEntries.length > 0 && (
        <Box>
          <Typography variant="overline" sx={{ display: 'block', mb: 0.5 }}>
            Metadata
          </Typography>
          <MetadataTable entries={otherEntries} />
        </Box>
      )}

      <Divider />
      <Typography variant="caption" color="text.secondary">
        Mock planning data shown for portfolio/demo purposes only.
      </Typography>
    </Box>
  );
}

function PlaceDetails() {
  const selectedPlace = usePlaceSearchStore((state) => state.selectedPlace);
  const attribution = usePlaceSearchStore((state) => state.attribution);
  const fallback = usePlaceSearchStore((state) => state.fallback);
  const clearSelectedPlace = usePlaceSearchStore(
    (state) => state.clearSelectedPlace,
  );
  if (!selectedPlace) {
    return null;
  }
  const typeLabel = [selectedPlace.category, selectedPlace.type]
    .filter(Boolean)
    .join(' · ');
  const providerLabel =
    selectedPlace.provider === 'static-demo'
      ? 'Demo fallback'
      : 'Nominatim';
  const isDemoFallback =
    selectedPlace.provider === 'static-demo' || Boolean(fallback?.active);

  return (
    <Box sx={{ mt: 1.5, display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box
        sx={{
          p: 2,
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          backgroundColor: 'background.paper',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <PublicIcon fontSize="small" sx={{ color: '#2563eb' }} />
          <Chip
            label={`Provider: ${providerLabel}`}
            size="small"
            variant="outlined"
            color={selectedPlace.provider === 'static-demo' ? 'warning' : 'default'}
          />
          {typeLabel && (
            <Chip
              label={typeLabel}
              size="small"
              variant="outlined"
              sx={{ textTransform: 'capitalize' }}
            />
          )}
        </Box>
        <Typography variant="subtitle1">{selectedPlace.label}</Typography>
        <Typography variant="body2" color="text.secondary">
          {selectedPlace.displayName}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {selectedPlace.latitude.toFixed(4)},{' '}
          {selectedPlace.longitude.toFixed(4)}
        </Typography>
        {isDemoFallback && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            This place came from the bundled demo fallback because the live
            geocoding provider was unavailable.
          </Typography>
        )}
      </Box>

      <Button
        size="small"
        variant="outlined"
        color="inherit"
        startIcon={<CloseIcon fontSize="small" />}
        onClick={() => clearSelectedPlace()}
      >
        Clear place
      </Button>

      <Divider />
      <Typography variant="caption" color="text.secondary">
        {attribution ?? '© OpenStreetMap contributors; geocoding by Nominatim'}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Worldwide place lookup only. AOI spatial analysis applies to the local
        SiteLens planning dataset.
      </Typography>
    </Box>
  );
}

function EmptyState() {
  return (
    <Box
      sx={{
        mt: 1.5,
        p: 2,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: 1,
      }}
    >
      <InfoOutlinedIcon color="disabled" />
      <Typography variant="body2" color="text.secondary">
        Select a parcel or planning layer to inspect details.
      </Typography>
    </Box>
  );
}

function AoiPanel() {
  const analysisResult = useAnalysisStore((state) => state.analysisResult);
  const isAnalyzing = useAnalysisStore((state) => state.isAnalyzing);
  const detailsTab = useUiStore((state) => state.detailsTab);
  const setDetailsTab = useUiStore((state) => state.setDetailsTab);

  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="subtitle1" sx={{ mb: 1 }}>
        Area of Interest Analysis
      </Typography>
      <Box sx={{ mb: 1.5 }}>
        <AnalysisEngineChip />
      </Box>
      <Tabs
        value={detailsTab}
        onChange={(_, value) => setDetailsTab(value)}
        variant="fullWidth"
        sx={{
          mb: 1.5,
          minHeight: 40,
          '& .MuiTab-root': {
            minHeight: 40,
            minWidth: 0,
            px: 0.75,
            fontSize: '0.78rem',
            textTransform: 'none',
            whiteSpace: 'nowrap',
          },
        }}
      >
        <Tab value="summary" label="Summary" />
        <Tab value="analytics" label="Analytics" />
        <Tab value="aiSummary" label="AI Summary" />
      </Tabs>
      {detailsTab === 'summary' && <AnalysisSummary />}
      {detailsTab === 'analytics' && (
        <AnalyticsDashboard result={analysisResult} isLoading={isAnalyzing} />
      )}
      {detailsTab === 'aiSummary' && <PlanningSummaryPanel />}
    </Box>
  );
}

/** Right-hand inspector panel. Shows feature details, or AOI analysis, or a prompt. */
export default function DetailsPanel() {
  const selectedFeature = useMapStore((state) => state.selectedFeature);
  const areaOfInterest = useAnalysisStore((state) => state.areaOfInterest);
  const isAnalyzing = useAnalysisStore((state) => state.isAnalyzing);
  const selectedPlace = usePlaceSearchStore((state) => state.selectedPlace);

  const showAoi = !selectedFeature && (Boolean(areaOfInterest) || isAnalyzing);
  const showPlace = !selectedFeature && !showAoi && Boolean(selectedPlace);

  return (
    <Box
      component="aside"
      aria-label="Details"
      sx={{
        width: { xs: 280, md: 320 },
        flexShrink: 0,
        height: '100%',
        overflowY: 'auto',
        p: 2,
        backgroundColor: 'background.default',
        borderLeft: 1,
        borderColor: 'divider',
      }}
    >
      <Typography variant="overline">Details</Typography>
      {selectedFeature ? (
        <Box sx={{ mt: 1.5 }}>
          <SelectedFeatureDetails feature={selectedFeature} />
        </Box>
      ) : showAoi ? (
        <AoiPanel />
      ) : showPlace ? (
        <PlaceDetails />
      ) : (
        <EmptyState />
      )}
    </Box>
  );
}
