import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import Typography from '@mui/material/Typography';
import type {
  PlanningContext,
  PlanningContextFeatureCounts,
  PlanningContextSource,
  PlanningContextStatus,
} from '@sitelens/shared';

const SPARSE_FEATURE_TOTAL = 10;

function providerLabel(source: PlanningContextSource): string {
  if (source === 'external-osm') return 'Overpass';
  if (source === 'external-overture') return 'Overture';
  if (source === 'synthetic-fallback') return 'Bundled';
  return 'Bundled';
}

function statusColor(
  status: PlanningContextStatus,
): 'success' | 'warning' | 'error' | 'default' | 'info' {
  if (status === 'ready') return 'success';
  if (status === 'building') return 'info';
  if (status === 'stale') return 'warning';
  if (status === 'failed') return 'error';
  return 'default';
}

function totalCounts(counts: PlanningContextFeatureCounts): number {
  return (
    counts.sites +
    counts.landUse +
    counts.constraints +
    counts.transit +
    counts.developmentActivity
  );
}

function formatLastBuilt(context: PlanningContext): string {
  if (
    context.source === 'local-demo' ||
    context.source === 'synthetic-fallback'
  ) {
    return 'Bundled fixture';
  }

  const date = new Date(context.updatedAt);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  return date.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function CountCell({ label, value }: { label: string; value: number }) {
  return (
    <Box
      sx={{
        p: 1,
        borderRadius: 1.5,
        border: 1,
        borderColor: 'divider',
        backgroundColor: 'background.default',
        minWidth: 0,
      }}
    >
      <Typography variant="subtitle2" sx={{ lineHeight: 1.2 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

export interface PlanningContextHealthCardProps {
  context: PlanningContext;
  counts: PlanningContextFeatureCounts | null;
  countsLoading?: boolean;
  lastBuildReused?: boolean | null;
}

/**
 * Selected planning-context health: provider, status, counts, and data-quality
 * badges. Feature totals come from build or GET /planning-contexts/:id.
 */
export default function PlanningContextHealthCard({
  context,
  counts,
  countsLoading = false,
  lastBuildReused = null,
}: PlanningContextHealthCardProps) {
  const sum = counts ? totalCounts(counts) : null;
  const isEmpty = sum === 0;
  const isSparse = sum !== null && sum > 0 && sum < SPARSE_FEATURE_TOTAL;
  const isSynthetic =
    context.source === 'local-demo' || context.source === 'synthetic-fallback';
  const isOpenMap =
    context.source === 'external-osm' || context.source === 'external-overture';

  return (
    <Box
      sx={{
        mt: 1,
        p: 1.5,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
      }}
    >
      <Typography variant="overline" sx={{ lineHeight: 1.2 }}>
        Planning Context Health
      </Typography>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        <Chip
          size="small"
          variant="outlined"
          label={`Provider: ${providerLabel(context.source)}`}
        />
        <Chip
          size="small"
          color={statusColor(context.status)}
          label={`Status: ${context.status}`}
        />
        {lastBuildReused === true && (
          <Chip size="small" color="info" variant="outlined" label="Reused" />
        )}
        {lastBuildReused === false && (
          <Chip
            size="small"
            color="success"
            variant="outlined"
            label="Newly built"
          />
        )}
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
        {isSynthetic && (
          <Chip size="small" variant="outlined" label="Synthetic demo" />
        )}
        {isOpenMap && (
          <Chip
            size="small"
            color="info"
            variant="outlined"
            label="Open-map derived"
          />
        )}
        <Chip
          size="small"
          color="warning"
          variant="outlined"
          label="Not official planning data"
        />
        {isEmpty && (
          <Chip size="small" color="warning" label="Empty context" />
        )}
        {isSparse && (
          <Chip size="small" color="warning" label="Sparse context" />
        )}
      </Box>

      {countsLoading && !counts ? (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            color: 'text.secondary',
          }}
        >
          <CircularProgress size={14} />
          <Typography variant="caption">Loading feature counts…</Typography>
        </Box>
      ) : counts ? (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
            gap: 0.75,
          }}
        >
          <CountCell label="Sites" value={counts.sites} />
          <CountCell label="Land use" value={counts.landUse} />
          <CountCell label="Constraints" value={counts.constraints} />
          <CountCell label="Transit" value={counts.transit} />
          <CountCell label="Activity" value={counts.developmentActivity} />
        </Box>
      ) : (
        <Typography variant="caption" color="text.secondary">
          Feature counts unavailable offline.
        </Typography>
      )}

      <Typography variant="caption" color="text.secondary">
        Last built: {formatLastBuilt(context)}
      </Typography>

      <Typography variant="caption" color="text.secondary">
        {context.disclaimer}
      </Typography>
    </Box>
  );
}
