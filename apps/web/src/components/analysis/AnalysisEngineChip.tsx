import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import StorageIcon from '@mui/icons-material/Storage';
import FunctionsIcon from '@mui/icons-material/Functions';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useAnalysisStore } from '../../store/analysisStore';
import type { AnalysisEngine } from '../../store/analysisStore';

type ChipColor = 'success' | 'default' | 'warning';

const ENGINE_META: Record<
  Exclude<AnalysisEngine, null>,
  { label: string; color: ChipColor; icon: React.ReactNode }
> = {
  postgis: {
    label: 'PostGIS API',
    color: 'success',
    icon: <StorageIcon fontSize="small" />,
  },
  'turf-local': {
    label: 'Local Turf',
    color: 'default',
    icon: <FunctionsIcon fontSize="small" />,
  },
  'turf-fallback': {
    label: 'Turf fallback',
    color: 'warning',
    icon: <WarningAmberIcon fontSize="small" />,
  },
};

/** Subtle chip (+ optional warning) showing which engine produced the analysis. */
export default function AnalysisEngineChip({
  showWarning = true,
}: {
  showWarning?: boolean;
}) {
  const engine = useAnalysisStore((state) => state.analysisEngine);
  const warning = useAnalysisStore((state) => state.analysisWarning);

  if (!engine) {
    return null;
  }

  const meta = ENGINE_META[engine];

  return (
    <Box>
      <Chip
        icon={meta.icon as React.ReactElement}
        size="small"
        variant="outlined"
        color={meta.color === 'default' ? undefined : meta.color}
        label={meta.label}
        sx={{ fontWeight: 600 }}
      />
      {showWarning && warning && (
        <Typography
          variant="caption"
          color="warning.main"
          sx={{ display: 'block', mt: 0.5 }}
        >
          {warning}
        </Typography>
      )}
    </Box>
  );
}
