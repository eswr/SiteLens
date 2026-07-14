import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { theme } from '../theme/theme';
import AppShell from '../components/layout/AppShell';
import PlanningContextBuildWatcher from '../components/planning/PlanningContextBuildWatcher';
import AboutPage from '../pages/AboutPage';
import { queryClient } from '../query/queryClient';

/** Application root: theme, React Query, routing, and dashboard shell. */
export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <BrowserRouter>
          <Routes>
            <Route
              path="/"
              element={
                <>
                  <PlanningContextBuildWatcher />
                  <AppShell />
                </>
              }
            />
            <Route path="/about" element={<AboutPage />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
