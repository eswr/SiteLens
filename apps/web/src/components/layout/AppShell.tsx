import { useEffect } from 'react';
import Alert from '@mui/material/Alert';
import Box from '@mui/material/Box';
import Paper from '@mui/material/Paper';
import Snackbar from '@mui/material/Snackbar';
import HeaderBar from './HeaderBar';
import Sidebar from './Sidebar';
import DetailsPanel from './DetailsPanel';
import SiteMap from '../map/SiteMap';
import MapStatusBadge from '../map/MapStatusBadge';
import { useAuthStore } from '../../store/authStore';
import { useBillingStore } from '../../store/billingStore';
import { usePlanningContextStore } from '../../store/planningContextStore';

/**
 * Top-level dashboard layout.
 *
 * Fills the viewport height with a fixed header and a three-column body:
 * left sidebar (tools), center map, and right details panel. The center map
 * is positioned relative so MapLibre can absolutely fill it and resize with
 * the browser window.
 */
export default function AppShell() {
  const initializeAuth = useAuthStore((state) => state.initialize);
  const initializeBilling = useBillingStore((state) => state.initialize);
  const buildNotice = usePlanningContextStore((state) => state.buildNotice);
  const clearBuildNotice = usePlanningContextStore(
    (state) => state.clearBuildNotice,
  );

  useEffect(() => {
    void initializeAuth();
    void initializeBilling();
  }, [initializeAuth, initializeBilling]);

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
      <Snackbar
        open={Boolean(buildNotice)}
        autoHideDuration={8000}
        onClose={(_event, reason) => {
          if (reason === 'clickaway') return;
          clearBuildNotice();
        }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert
          severity="info"
          variant="filled"
          onClose={() => clearBuildNotice()}
          sx={{ width: '100%', maxWidth: 520 }}
        >
          {buildNotice}
        </Alert>
      </Snackbar>
    </Box>
  );
}
