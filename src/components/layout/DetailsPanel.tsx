import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useMapStore } from '../../store/mapStore';
import { LAYER_BY_ID, LAYER_COLORS } from '../../data/layers';
import type { PlanningLayerId } from '../../types/planning';
import type { SelectedFeature } from '../../types/map';

/** Property key used as the panel title, per layer. */
const TITLE_KEY: Record<PlanningLayerId, string> = {
  parcels: 'name',
  zoning: 'zoneName',
  constraints: 'constraintType',
  transit: 'name',
  developmentActivity: 'projectName',
};

/** Property keys to omit from the metadata list (already shown as title/id). */
const HIDDEN_KEYS = new Set(['id']);

function formatKey(key: string): string {
  const withSpaces = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ');
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'number') {
    const formatted = value.toLocaleString('en-AU');
    return key.toLowerCase().includes('sqm') ? `${formatted} m²` : formatted;
  }
  return String(value);
}

function SelectedFeatureDetails({ feature }: { feature: SelectedFeature }) {
  const config = LAYER_BY_ID[feature.layerId];
  const titleKey = TITLE_KEY[feature.layerId];
  const title =
    (feature.properties[titleKey] as string | undefined) ??
    feature.featureId ??
    'Selected feature';

  const entries = Object.entries(feature.properties).filter(
    ([key]) => !HIDDEN_KEYS.has(key) && key !== titleKey,
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
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
              borderRadius:
                config.geometryType === 'point' ? '50%' : '3px',
              backgroundColor: LAYER_COLORS[feature.layerId],
            }}
          />
          <Chip label={config.label} size="small" variant="outlined" />
        </Box>
        <Typography variant="subtitle1">{title}</Typography>
        <Typography variant="body2" color="text.secondary">
          {feature.geometryType}
          {feature.coordinates
            ? ` · ${feature.coordinates[1].toFixed(4)}, ${feature.coordinates[0].toFixed(4)}`
            : ''}
        </Typography>
      </Box>

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

      <Divider />
      <Typography variant="caption" color="text.secondary">
        Mock planning data shown for portfolio/demo purposes only.
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

/** Right-hand inspector panel. Shows metadata for the selected feature. */
export default function DetailsPanel() {
  const selectedFeature = useMapStore((state) => state.selectedFeature);

  return (
    <Box
      component="aside"
      aria-label="Details"
      sx={{
        width: 320,
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
      ) : (
        <EmptyState />
      )}
    </Box>
  );
}
