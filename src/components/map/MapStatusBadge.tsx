import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import { useMapStore } from '../../store/mapStore';
import { useAnalysisStore } from '../../store/analysisStore';

interface Status {
  label: string;
  color: string;
}

/** A small, non-interactive overlay reflecting the current workflow state. */
export default function MapStatusBadge() {
  const selectedFeature = useMapStore((state) => state.selectedFeature);
  const isDrawing = useAnalysisStore((state) => state.isDrawing);
  const areaOfInterest = useAnalysisStore((state) => state.areaOfInterest);

  let status: Status;
  if (isDrawing) {
    status = { label: 'Drawing area', color: '#db2777' };
  } else if (selectedFeature) {
    status = { label: 'Feature selected', color: '#2563eb' };
  } else if (areaOfInterest) {
    status = { label: 'Area analyzed', color: '#0f766e' };
  } else {
    status = { label: 'No selection', color: '#64748b' };
  }

  return (
    <Box
      sx={{
        position: 'absolute',
        left: 12,
        bottom: 12,
        zIndex: 1,
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 1,
        px: 1.25,
        py: 0.5,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        backgroundColor: 'rgba(255, 255, 255, 0.92)',
        boxShadow: 1,
      }}
    >
      <Box
        sx={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          backgroundColor: status.color,
        }}
      />
      <Typography variant="caption" sx={{ fontWeight: 600 }}>
        {status.label}
      </Typography>
    </Box>
  );
}
