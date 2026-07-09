import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

/** Right-hand inspector panel. Shows placeholder guidance until a feature is selected. */
export default function DetailsPanel() {
  return (
    <Box
      component="aside"
      aria-label="Details"
      sx={{
        width: 320,
        flexShrink: 0,
        height: '100%',
        overflowY: 'auto',
        p: 2,
        backgroundColor: 'background.default',
        borderLeft: 1,
        borderColor: 'divider',
      }}
    >
      <Typography variant="overline">Details</Typography>
      <Box
        sx={{
          mt: 1.5,
          p: 2,
          borderRadius: 2,
          border: 1,
          borderColor: 'divider',
          backgroundColor: 'background.paper',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 1,
        }}
      >
        <InfoOutlinedIcon color="disabled" />
        <Typography variant="body2" color="text.secondary">
          Select a parcel or planning layer to inspect details.
        </Typography>
      </Box>
    </Box>
  );
}
