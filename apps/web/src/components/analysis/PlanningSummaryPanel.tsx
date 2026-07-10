import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Button from '@mui/material/Button';
import Divider from '@mui/material/Divider';
import Alert from '@mui/material/Alert';
import CircularProgress from '@mui/material/CircularProgress';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import RefreshIcon from '@mui/icons-material/Refresh';
import { useAiSummaryStore } from '../../store/aiSummaryStore';
import { useAnalysisStore } from '../../store/analysisStore';
import AnalysisEngineChip from './AnalysisEngineChip';
import type {
  PlanningSummary,
  PlanningSummarySeverity,
} from '../../types/aiSummary';

const SEVERITY_COLOR: Record<PlanningSummarySeverity, string> = {
  positive: '#16a34a',
  neutral: '#64748b',
  warning: '#d97706',
  risk: '#dc2626',
};

const DEMO_CAVEAT =
  'This is a deterministic mock AI summary generated from portfolio GeoJSON data. It is not official planning advice.';

function Card({
  children,
  sx,
}: {
  children: React.ReactNode;
  sx?: object;
}) {
  return (
    <Box
      sx={{
        p: 1.5,
        borderRadius: 2,
        border: 1,
        borderColor: 'divider',
        backgroundColor: 'background.paper',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function SummaryContent({ summary }: { summary: PlanningSummary }) {
  const clearSummary = useAiSummaryStore((state) => state.clearSummary);
  const generateSummary = useAiSummaryStore((state) => state.generateSummary);
  const analysisResult = useAnalysisStore((state) => state.analysisResult);
  const generatedAt = new Date(summary.generatedAt).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const metrics: { label: string; value: string }[] = [
    { label: 'Area (ha)', value: `${summary.sourceMetrics.areaHectares}` },
    { label: 'Parcels', value: `${summary.sourceMetrics.parcelCount}` },
    {
      label: 'Avg dev. score',
      value:
        summary.sourceMetrics.averageDevelopmentScore === null
          ? '—'
          : `${summary.sourceMetrics.averageDevelopmentScore}`,
    },
    { label: 'Constraints', value: `${summary.sourceMetrics.constraintCount}` },
    {
      label: 'Nearby transit',
      value: `${summary.sourceMetrics.nearbyTransitCount}`,
    },
    {
      label: 'Development apps',
      value: `${summary.sourceMetrics.developmentActivityCount}`,
    },
  ];

  return (
    <Stack spacing={1.5}>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 1,
          flexWrap: 'wrap',
        }}
      >
        <Chip
          icon={<AutoAwesomeIcon />}
          size="small"
          color="primary"
          variant="outlined"
          label="AI-assisted summary"
          sx={{ fontWeight: 600 }}
        />
        <Typography variant="caption" color="text.secondary">
          Generated {generatedAt}
        </Typography>
        <AnalysisEngineChip showWarning={false} />
        <Box sx={{ flexGrow: 1 }} />
        <Button
          size="small"
          variant="text"
          startIcon={<RefreshIcon fontSize="small" />}
          onClick={() => generateSummary(analysisResult)}
        >
          Regenerate
        </Button>
      </Box>

      <Card sx={{ backgroundColor: '#eff6ff', borderColor: '#bfdbfe' }}>
        <Typography variant="overline" sx={{ display: 'block', mb: 0.5 }}>
          Executive summary
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.primary' }}>
          {summary.executiveSummary}
        </Typography>
      </Card>

      <Card>
        <Typography variant="overline" sx={{ display: 'block', mb: 0.5 }}>
          Site context
        </Typography>
        <Typography variant="body2" color="text.secondary">
          {summary.siteContext}
        </Typography>
      </Card>

      {summary.sections.map((section) => (
        <Card key={section.title}>
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              gap: 1,
              mb: 0.5,
              justifyContent: 'space-between',
            }}
          >
            <Typography variant="subtitle2">{section.title}</Typography>
            {section.severity && (
              <Chip
                size="small"
                label={section.severity}
                variant="outlined"
                sx={{
                  height: 20,
                  textTransform: 'capitalize',
                  color: SEVERITY_COLOR[section.severity],
                  borderColor: SEVERITY_COLOR[section.severity],
                }}
              />
            )}
          </Box>
          <Typography variant="body2" color="text.secondary">
            {section.body}
          </Typography>
        </Card>
      ))}

      <Card>
        <Typography variant="overline" sx={{ display: 'block', mb: 0.5 }}>
          Recommended next checks
        </Typography>
        <Box component="ul" sx={{ m: 0, pl: 2.5 }}>
          {summary.recommendedNextChecks.map((check) => (
            <Typography
              key={check}
              component="li"
              variant="body2"
              color="text.secondary"
              sx={{ mb: 0.5 }}
            >
              {check}
            </Typography>
          ))}
        </Box>
      </Card>

      <Card>
        <Typography variant="overline" sx={{ display: 'block', mb: 1 }}>
          Source metrics
        </Typography>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 1,
          }}
        >
          {metrics.map((metric) => (
            <Box
              key={metric.label}
              sx={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 1,
                px: 1,
                py: 0.5,
                borderRadius: 1,
                backgroundColor: 'background.default',
              }}
            >
              <Typography variant="caption" color="text.secondary">
                {metric.label}
              </Typography>
              <Typography variant="caption" sx={{ fontWeight: 700 }}>
                {metric.value}
              </Typography>
            </Box>
          ))}
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: 'block', mt: 1 }}
        >
          These are the exact analysis metrics used to generate the summary.
        </Typography>
      </Card>

      <Divider />

      <Box>
        <Typography variant="overline" sx={{ display: 'block', mb: 0.5 }}>
          Demo caveat
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
          {DEMO_CAVEAT}
        </Typography>
        <Box component="ul" sx={{ m: 0.5, pl: 2.5 }}>
          {summary.dataCaveats.map((caveat) => (
            <Typography
              key={caveat}
              component="li"
              variant="caption"
              color="text.secondary"
            >
              {caveat}
            </Typography>
          ))}
        </Box>
      </Box>

      <Button size="small" variant="outlined" color="inherit" onClick={clearSummary}>
        Clear summary
      </Button>
    </Stack>
  );
}

/** AI Summary tab: generate + display the deterministic mock planning summary. */
export default function PlanningSummaryPanel() {
  const summary = useAiSummaryStore((state) => state.summary);
  const isGenerating = useAiSummaryStore((state) => state.isGenerating);
  const error = useAiSummaryStore((state) => state.error);
  const generateSummary = useAiSummaryStore((state) => state.generateSummary);
  const analysisResult = useAnalysisStore((state) => state.analysisResult);
  const isAnalyzing = useAnalysisStore((state) => state.isAnalyzing);

  if (isGenerating) {
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
        <Typography variant="body2">Generating planning summary…</Typography>
      </Box>
    );
  }

  if (summary) {
    return <SummaryContent summary={summary} />;
  }

  if (!analysisResult) {
    return (
      <Card sx={{ textAlign: 'center' }}>
        <Typography variant="body2" color="text.secondary">
          Draw and analyze an area of interest to generate a planning summary.
        </Typography>
      </Card>
    );
  }

  return (
    <Stack spacing={1.5}>
      {error && <Alert severity="error">{error}</Alert>}
      <Card sx={{ textAlign: 'center' }}>
        <AutoAwesomeIcon color="primary" sx={{ mb: 0.5 }} />
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Generate a deterministic, on-device planning summary from this area's
          analysis metrics.
        </Typography>
        <Button
          fullWidth
          variant="contained"
          size="small"
          startIcon={<AutoAwesomeIcon fontSize="small" />}
          disabled={isAnalyzing}
          onClick={() => generateSummary(analysisResult)}
        >
          Generate planning summary
        </Button>
      </Card>
      <Typography variant="caption" color="text.secondary">
        {DEMO_CAVEAT}
      </Typography>
    </Stack>
  );
}
