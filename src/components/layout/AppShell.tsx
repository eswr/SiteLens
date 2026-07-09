import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import HeaderBar from './HeaderBar';
import Sidebar from './Sidebar';
import DetailsPanel from './DetailsPanel';
import SiteMap from '../map/SiteMap';
import MapStatusBadge from '../map/MapStatusBadge';

/**
 * Top-level dashboard layout.
 *
 * Fills the viewport height with a fixed header and a three-column body:
 * left sidebar (tools), center map, and right details panel. The center map
 * is positioned relative so MapLibre can absolutely fill it and resize with
 * the browser window.
 */
export default function AppShell() {
  return (
    <Box
      sx={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        backgroundColor: 'background.default',
      }}
    >
      <HeaderBar />
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Sidebar />
        <Box
          component="main"
          sx={{ flex: 1, minWidth: 120, position: 'relative' }}
        >
          <Paper
            elevation={0}
            square
            sx={{ position: 'absolute', inset: 0, overflow: 'hidden' }}
          >
            <SiteMap />
          </Paper>
          <MapStatusBadge />
        </Box>
        <DetailsPanel />
      </Box>
    </Box>
  );
}
