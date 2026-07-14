import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClientProvider } from '@tanstack/react-query';
import { theme } from '../theme/theme';
import AppShell from '../components/layout/AppShell';
import PlanningContextBuildWatcher from '../components/planning/PlanningContextBuildWatcher';
import { queryClient } from '../query/queryClient';

/** Application root: theme, React Query, and dashboard shell. */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <PlanningContextBuildWatcher />
        <AppShell />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
