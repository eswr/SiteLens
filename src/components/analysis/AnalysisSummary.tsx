import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import CircularProgress from '@mui/material/CircularProgress';
import InsightsIcon from '@mui/icons-material/Insights';
import { useAnalysisStore } from '../../store/analysisStore';
import { useUiStore } from '../../store/uiStore';
import { LAYER_COLORS } from '../../data/layers';
import type { SpatialAnalysisResult } from '../../types/analysis';

function formatNumber(value: number): string {
  return value.toLocaleString('en-AU');
}

function SectionCard({
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
      }}
    >
      <Typography variant="overline" sx={{ display: 'block', mb: 0.75 }}>
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ flex: 1 }}>
      <Typography variant="h6" sx={{ lineHeight: 1.2 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

/** Compact rendering of a completed spatial-analysis result. */
export function AnalysisResultView({
  result,
}: {
  result: SpatialAnalysisResult;
}) {
  return (
    <Stack spacing={1.5}>
      <SectionCard title="Area of interest">
        <Stack direction="row" spacing={1}>
          <Stat label="Area (m²)" value={formatNumber(result.areaSqm)} />
          <Stat label="Hectares" value={`${result.areaHectares}`} />
        </Stack>
      </SectionCard>

      <SectionCard title="Parcels">
        <Stack direction="row" spacing={1}>
          <Stat label="In area" value={`${result.parcelCount}`} />
          <Stat
            label="Avg dev. score"
            value={
              result.averageDevelopmentScore === null
                ? '—'
                : `${result.averageDevelopmentScore}`
            }
          />
        </Stack>
      </SectionCard>

      <SectionCard title="Zoning breakdown">
        {result.zoningBreakdown.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No zoning overlays in this area.
          </Typography>
        ) : (
          <Stack
            direction="row"
            spacing={0.75}
            useFlexGap
            sx={{ flexWrap: 'wrap' }}
          >
            {result.zoningBreakdown.map((zone) => (
              <Chip
                key={zone.zoneCode}
                size="small"
                label={`${zone.zoneCode} · ${zone.zoneName} (${zone.count})`}
                sx={{
                  borderColor: LAYER_COLORS.zoning,
                  color: LAYER_COLORS.zoning,
                }}
                variant="outlined"
              />
            ))}
          </Stack>
        )}
      </SectionCard>

      <SectionCard title="Constraints">
        {result.intersectingConstraints.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No intersecting constraints.
          </Typography>
        ) : (
          <Stack spacing={0.75}>
            {result.intersectingConstraints.map((constraint) => (
              <Box key={constraint.id}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                  <Box
                    sx={{
                      width: 10,
                      height: 10,
                      borderRadius: '2px',
                      backgroundColor: LAYER_COLORS.constraints,
                    }}
                  />
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {constraint.constraintType}
                  </Typography>
                  <Chip
                    size="small"
                    label={`${constraint.riskLevel} risk`}
                    variant="outlined"
                    sx={{ height: 18 }}
                  />
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {constraint.description}
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </SectionCard>

      <SectionCard title="Nearby transit">
        {result.nearbyTransit.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No transit within 1.5 km of the area centroid.
          </Typography>
        ) : (
          <Stack spacing={0.5}>
            {result.nearbyTransit.map((stop) => (
              <Box
                key={stop.id}
                sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}
              >
                <Typography variant="body2" noWrap>
                  {stop.name}
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                  >
                    {' '}
                    · {stop.mode}
                  </Typography>
                </Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {formatNumber(stop.distanceMeters)} m
                </Typography>
              </Box>
            ))}
          </Stack>
        )}
      </SectionCard>

      <SectionCard title="Development activity">
        <Typography variant="body2" sx={{ mb: 0.75 }}>
          {result.developmentActivityCount} application
          {result.developmentActivityCount === 1 ? '' : 's'} in area
        </Typography>
        {result.developmentActivityByStatus.length > 0 && (
          <Stack
            direction="row"
            spacing={0.75}
            useFlexGap
            sx={{ flexWrap: 'wrap' }}
          >
            {result.developmentActivityByStatus.map((item) => (
              <Chip
                key={item.status}
                size="small"
                label={`${item.status} (${item.count})`}
                variant="outlined"
                sx={{
                  borderColor: LAYER_COLORS.developmentActivity,
                  color: LAYER_COLORS.developmentActivity,
                }}
              />
            ))}
          </Stack>
        )}
      </SectionCard>

      <Divider />
      <Typography variant="caption" color="text.secondary">
        Analysis is based on mock portfolio GeoJSON data, not official planning
        records.
      </Typography>
    </Stack>
  );
}

/** Compact summary for the sidebar: a few key metrics plus an analytics cue. */
export function AnalysisSummaryCompact() {
  const isAnalyzing = useAnalysisStore((state) => state.isAnalyzing);
  const error = useAnalysisStore((state) => state.error);
  const result = useAnalysisStore((state) => state.analysisResult);
  const setDetailsTab = useUiStore((state) => state.setDetailsTab);

  if (isAnalyzing) {
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
        <Typography variant="body2">Analyzing area…</Typography>
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!result) {
    return null;
  }

  return (
    <Stack spacing={1}>
      <Stack direction="row" spacing={1}>
        <Stat label="Area (ha)" value={`${result.areaHectares}`} />
        <Stat label="Parcels" value={`${result.parcelCount}`} />
        <Stat
          label="Avg score"
          value={
            result.averageDevelopmentScore === null
              ? '—'
              : `${result.averageDevelopmentScore}`
          }
        />
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {result.intersectingConstraints.length} constraint
        {result.intersectingConstraints.length === 1 ? '' : 's'} ·{' '}
        {result.nearbyTransit.length} nearby transit ·{' '}
        {result.developmentActivityCount} dev. app
        {result.developmentActivityCount === 1 ? '' : 's'}
      </Typography>
      <Button
        size="small"
        variant="outlined"
        startIcon={<InsightsIcon fontSize="small" />}
        onClick={() => setDetailsTab('analytics')}
      >
        View detailed analytics
      </Button>
    </Stack>
  );
}

/** Store-connected analysis summary: shows loading, error, or the result. */
export default function AnalysisSummary() {
  const isAnalyzing = useAnalysisStore((state) => state.isAnalyzing);
  const error = useAnalysisStore((state) => state.error);
  const analysisResult = useAnalysisStore((state) => state.analysisResult);

  if (isAnalyzing) {
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
        <Typography variant="body2">Analyzing area…</Typography>
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!analysisResult) {
    return null;
  }

  return <AnalysisResultView result={analysisResult} />;
}
