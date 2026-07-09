import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Divider from '@mui/material/Divider';
import CircularProgress from '@mui/material/CircularProgress';
import type { SpatialAnalysisResult } from '../../types/analysis';
import ZoningBreakdownChart from '../charts/ZoningBreakdownChart';
import DevelopmentActivityChart from '../charts/DevelopmentActivityChart';
import ConstraintRiskChart from '../charts/ConstraintRiskChart';
import DevelopmentScoreCard from '../charts/DevelopmentScoreCard';

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper',
      }}
    >
      <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        minWidth: 0,
      }}
    >
      <Typography variant="overline" sx={{ display: 'block', mb: 1 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

/**
 * Recharts-based analytics for a completed AOI.
 *
 * Renders headline metrics and four charts in a single-column, responsive
 * layout suited to the details panel. Shows loading and empty states.
 */
export default function AnalyticsDashboard({
  result,
  isLoading = false,
}: {
  result: SpatialAnalysisResult | null;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          color: 'text.secondary',
        }}
      >
        <CircularProgress size={16} />
        <Typography variant="body2">Generating analytics…</Typography>
      </Box>
    );
  }

  if (!result) {
    return (
      <Box
        sx={{
          p: 2,
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          textAlign: 'center',
        }}
      >
        <Typography variant="body2" color="text.secondary">
          Draw an area of interest to generate planning analytics.
        </Typography>
      </Box>
    );
  }

  const metrics: { label: string; value: string }[] = [
    { label: 'Area (ha)', value: `${result.areaHectares}` },
    { label: 'Parcels', value: `${result.parcelCount}` },
    {
      label: 'Avg dev. score',
      value:
        result.averageDevelopmentScore === null
          ? '—'
          : `${result.averageDevelopmentScore}`,
    },
    { label: 'Development apps', value: `${result.developmentActivityCount}` },
    { label: 'Constraints', value: `${result.intersectingConstraints.length}` },
    { label: 'Nearby transit', value: `${result.nearbyTransit.length}` },
  ];

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 1,
        }}
      >
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </Box>

      <ChartCard title="Development score">
        <DevelopmentScoreCard
          averageDevelopmentScore={result.averageDevelopmentScore}
          parcelCount={result.parcelCount}
        />
      </ChartCard>

      <ChartCard title="Zoning breakdown">
        <ZoningBreakdownChart data={result.zoningBreakdown} />
      </ChartCard>

      <ChartCard title="Development activity by status">
        <DevelopmentActivityChart data={result.developmentActivityByStatus} />
      </ChartCard>

      <ChartCard title="Constraints by risk level">
        <ConstraintRiskChart data={result.intersectingConstraints} />
      </ChartCard>

      <Divider />
      <Typography variant="caption" color="text.secondary">
        Charts use mock portfolio GeoJSON data, not official planning records.
      </Typography>
    </Box>
  );
}
