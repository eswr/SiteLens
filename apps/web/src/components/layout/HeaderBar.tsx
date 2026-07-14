import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Typography from '@mui/material/Typography';
import Chip from '@mui/material/Chip';
import PublicIcon from '@mui/icons-material/Public';
import PlaceIcon from '@mui/icons-material/Place';
import { Link as RouterLink } from 'react-router-dom';
import { useMapStore } from '../../store/mapStore';
import { usePlanningContextStore } from '../../store/planningContextStore';
import { getFeatureTitle } from '../../data/featureDisplay';
import { AccessStatusChip } from './AccessControls';

/** Top application bar showing the SiteLens brand and tagline. */
export default function HeaderBar() {
  const selectedFeature = useMapStore((state) => state.selectedFeature);
  const selectedContext = usePlanningContextStore(
    (state) => state.selectedContext,
  );
  const selectedName = selectedFeature
    ? getFeatureTitle(selectedFeature.layerId, selectedFeature.properties)
    : null;

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

        <Box sx={{ flexGrow: 1 }} />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {selectedContext && (
            <Chip
              color={
                selectedContext.source === 'local-demo' ? 'default' : 'info'
              }
              variant="outlined"
              label={selectedContext.label}
              sx={{
                maxWidth: 220,
                fontWeight: 600,
                display: { xs: 'none', md: 'flex' },
              }}
            />
          )}
          {selectedName && (
            <Chip
              icon={<PlaceIcon />}
              color="primary"
              variant="outlined"
              label={`Selected: ${selectedName}`}
              sx={{
                maxWidth: 260,
                fontWeight: 600,
                display: { xs: 'none', sm: 'flex' },
              }}
            />
          )}
          <Button
            component={RouterLink}
            to="/about"
            color="inherit"
            size="small"
            sx={{ fontWeight: 600, textTransform: 'none' }}
          >
            About
          </Button>
          <AccessStatusChip />
        </Box>
      </Toolbar>
    </AppBar>
  );
}
