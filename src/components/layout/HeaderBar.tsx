import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Typography from '@mui/material/Typography';
import PublicIcon from '@mui/icons-material/Public';

/** Top application bar showing the SiteLens brand and tagline. */
export default function HeaderBar() {
  return (
    <AppBar
      position="static"
      elevation={0}
      color="default"
      sx={{
        backgroundColor: 'background.paper',
        borderBottom: 1,
        borderColor: 'divider',
      }}
    >
      <Toolbar sx={{ gap: 1.5 }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 40,
            height: 40,
            borderRadius: 2,
            color: 'primary.contrastText',
            backgroundColor: 'primary.main',
          }}
        >
          <PublicIcon fontSize="small" />
        </Box>
        <Box sx={{ display: 'flex', flexDirection: 'column' }}>
          <Typography variant="h6" component="h1" sx={{ lineHeight: 1.2 }}>
            SiteLens
          </Typography>
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ lineHeight: 1.2 }}
          >
            Geospatial Planning Intelligence Demo
          </Typography>
        </Box>
      </Toolbar>
    </AppBar>
  );
}
