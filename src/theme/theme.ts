import { createTheme } from '@mui/material/styles';

/**
 * SiteLens theme.
 *
 * A clean, professional look: neutral surfaces, restrained accent color, and
 * clear typography suited to a data/analysis dashboard. Intentionally avoids
 * flashy colors so map data and future charts remain the visual focus.
 */
export const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#2563eb',
    },
    secondary: {
      main: '#0f766e',
    },
    background: {
      default: '#f1f5f9',
      paper: '#ffffff',
    },
    text: {
      primary: '#0f172a',
      secondary: '#475569',
    },
    divider: '#e2e8f0',
  },
  shape: {
    borderRadius: 10,
  },
  typography: {
    fontFamily:
      '"Inter", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    h6: {
      fontWeight: 700,
      letterSpacing: '-0.01em',
    },
    subtitle1: {
      fontWeight: 600,
    },
    subtitle2: {
      fontWeight: 600,
      color: '#475569',
    },
    body2: {
      color: '#475569',
    },
    overline: {
      fontWeight: 700,
      letterSpacing: '0.08em',
      color: '#64748b',
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
        },
      },
    },
  },
});
