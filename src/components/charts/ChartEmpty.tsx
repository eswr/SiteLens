import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';

/** Shared empty-state block for charts with no data. */
export default function ChartEmpty({ message }: { message: string }) {
  return (
    <Box
      sx={{
        height: 120,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        px: 1,
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {message}
      </Typography>
    </Box>
  );
}
