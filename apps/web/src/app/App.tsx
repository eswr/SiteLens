import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '../theme/theme';
import AppShell from '../components/layout/AppShell';

/** Application root: applies the MUI theme and renders the dashboard shell. */
export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AppShell />
    </ThemeProvider>
  );
}
