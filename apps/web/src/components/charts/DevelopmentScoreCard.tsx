import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import LinearProgress from '@mui/material/LinearProgress';

interface Band {
  label: string;
  color: string;
  interpretation: string;
}

function bandFor(score: number): Band {
  if (score >= 70) {
    return {
      label: 'High',
      color: '#16a34a',
      interpretation:
        'Strong indicative development potential across parcels in this demo dataset.',
    };
  }
  if (score >= 40) {
    return {
      label: 'Moderate',
      color: '#d97706',
      interpretation:
        'Moderate indicative development potential across parcels in this demo dataset.',
    };
  }
  return {
    label: 'Low',
    color: '#dc2626',
    interpretation:
      'Limited indicative development potential across parcels in this demo dataset.',
  };
}

/** Polished card summarizing the average development score of parcels in the AOI. */
export default function DevelopmentScoreCard({
  averageDevelopmentScore,
  parcelCount,
}: {
  averageDevelopmentScore: number | null;
  parcelCount: number;
}) {
  if (averageDevelopmentScore === null) {
    return (
      <Box>
        <Typography variant="h4" sx={{ fontWeight: 700 }}>
          —
        </Typography>
        <Typography variant="body2" color="text.secondary">
          No parcels intersect this area, so no development score is available.
        </Typography>
      </Box>
    );
  }

  const band = bandFor(averageDevelopmentScore);

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1 }}>
        <Typography variant="h4" sx={{ fontWeight: 700, lineHeight: 1 }}>
          {averageDevelopmentScore}
        </Typography>
        <Typography variant="body2" color="text.secondary">
          / 100
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <Chip
          size="small"
          label={band.label}
          sx={{
            fontWeight: 700,
            color: band.color,
            borderColor: band.color,
          }}
          variant="outlined"
        />
      </Box>
      <LinearProgress
        variant="determinate"
        value={Math.min(100, Math.max(0, averageDevelopmentScore))}
        aria-label={`Average development score ${averageDevelopmentScore} out of 100 (${band.label})`}
        sx={{
          my: 1,
          height: 8,
          borderRadius: 4,
          backgroundColor: '#e2e8f0',
          '& .MuiLinearProgress-bar': {
            backgroundColor: band.color,
            borderRadius: 4,
          },
        }}
      />
      <Typography variant="body2" color="text.secondary">
        {band.interpretation}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Average across {parcelCount} parcel{parcelCount === 1 ? '' : 's'} in the
        area.
      </Typography>
    </Box>
  );
}
