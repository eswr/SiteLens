import { render, type RenderOptions } from '@testing-library/react';
import type { ReactElement } from 'react';
import { ThemeTestProviders } from './ThemeTestProviders';

/** Render UI under the SiteLens MUI theme (required for Chip/Typography). */
export function renderWithTheme(
  ui: ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) {
  return render(ui, { wrapper: ThemeTestProviders, ...options });
}
