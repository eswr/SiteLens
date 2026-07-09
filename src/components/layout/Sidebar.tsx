import type { ReactNode } from 'react';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Switch from '@mui/material/Switch';
import Divider from '@mui/material/Divider';
import SearchIcon from '@mui/icons-material/Search';
import InsightsIcon from '@mui/icons-material/Insights';
import { PLANNING_LAYERS, LAYER_COLORS } from '../../data/layers';
import { useLayerStore } from '../../store/layerStore';

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
            <Box
              sx={{
                mt: 0.5,
                width: 12,
                height: 12,
                borderRadius: '3px',
                flexShrink: 0,
                backgroundColor: LAYER_COLORS[layer.id],
              }}
            />
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
            <Box
              sx={{
                width: 12,
                height: 12,
                borderRadius:
                  layer.geometryType === 'point' ? '50%' : '3px',
                backgroundColor: LAYER_COLORS[layer.id],
              }}
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

/** Left navigation rail: live planning-layer toggles, legend, and placeholder tools. */
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
      <Typography variant="overline">Planning Layers</Typography>
      <LayerToggles />
      <Legend />

      <Divider sx={{ my: 0.5 }} />

      <Typography variant="overline">Tools</Typography>
      <PlaceholderSection
        icon={<SearchIcon fontSize="small" />}
        title="Search"
        description="Find addresses, parcels, and precincts on the map."
      />
      <PlaceholderSection
        icon={<InsightsIcon fontSize="small" />}
        title="Analysis"
        description="Run spatial analysis and view generated insights."
      />
    </Box>
  );
}
