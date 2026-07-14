import { ThemeProvider } from '@mui/material/styles';
import type { ReactNode } from 'react';
import { theme } from '../theme/theme';

/** MUI theme wrapper for Vitest renders (keeps Fast Refresh happy on this file). */
export function ThemeTestProviders({ children }: { children: ReactNode }) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
