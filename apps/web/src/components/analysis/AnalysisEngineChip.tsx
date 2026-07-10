import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import Typography from '@mui/material/Typography';
import StorageIcon from '@mui/icons-material/Storage';
import FunctionsIcon from '@mui/icons-material/Functions';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import { useAnalysisStore } from '../../store/analysisStore';
import type { AnalysisEngine } from '../../store/analysisStore';
import type { CacheStatus } from '../../api/client';

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

/** Human label for a cache status (only shown for backend results). */
function cacheLabel(status: CacheStatus | null): string | null {
  switch (status) {
    case 'hit':
      return 'cache hit';
    case 'miss':
      return 'cache miss';
    case 'disabled':
      return 'cache disabled';
    case 'error':
      return 'cache error';
    case 'bypass':
      return 'cache bypass';
    default:
      return null;
  }
}

/** Subtle chip (+ optional warning + computed time) describing the analysis engine. */
export default function AnalysisEngineChip({
  showWarning = true,
}: {
  showWarning?: boolean;
}) {
  const engine = useAnalysisStore((state) => state.analysisEngine);
  const warning = useAnalysisStore((state) => state.analysisWarning);
  const cacheStatus = useAnalysisStore((state) => state.analysisCacheStatus);
  const computedAt = useAnalysisStore((state) => state.analysisComputedAt);

  if (!engine) {
    return null;
  }

  const meta = ENGINE_META[engine];
  const cacheSuffix = engine === 'postgis' ? cacheLabel(cacheStatus) : null;
  const label = cacheSuffix ? `${meta.label} · ${cacheSuffix}` : meta.label;

  let computedTime: string | null = null;
  if (computedAt) {
    const parsed = new Date(computedAt);
    if (!Number.isNaN(parsed.getTime())) {
      computedTime = parsed.toLocaleTimeString('en-AU', {
        hour: '2-digit',
        minute: '2-digit',
      });
    }
  }

  return (
    <Box>
      <Chip
        icon={meta.icon as React.ReactElement}
        size="small"
        variant="outlined"
        color={meta.color === 'default' ? undefined : meta.color}
        label={label}
        sx={{ fontWeight: 600 }}
      />
      {computedTime && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 0.25 }}
        >
          Computed at {computedTime}
        </Typography>
      )}
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
