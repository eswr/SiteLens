import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.CAPTURE_BASE_URL ?? 'http://localhost:5173';
/** Prefer repo root (`npm run test:e2e:smoke` from root). */
const repoRoot = process.cwd();

/**
 * Demo-flow smoke. Expects API (:4000) + web (:5173) with
 * VITE_API_BASE_URL / VITE_DEMO_API_KEY, PostGIS seeded, and the build worker on.
 *
 * Local: npm run dev (or start api+web yourself), then npm run test:e2e:smoke
 * CI: workflow_dispatch job `e2e-demo-smoke` starts servers via webServer.
 */
export default defineConfig({
  testDir: '.',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  webServer: process.env.E2E_SKIP_WEBSERVER
    ? undefined
    : [
        {
          command: 'npm run build:shared && npm run dev -w apps/api',
          cwd: repoRoot,
          url: 'http://localhost:4000/health',
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            ...process.env,
            NODE_ENV: process.env.NODE_ENV ?? 'development',
            WEB_ORIGIN: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
            PORT: '4000',
            // Deterministic release gate: no live Overpass / Nominatim required.
            OVERPASS_ENABLED: process.env.OVERPASS_ENABLED ?? 'false',
            EXTERNAL_CONTEXT_SYNTHETIC_FALLBACK_ENABLED:
              process.env.EXTERNAL_CONTEXT_SYNTHETIC_FALLBACK_ENABLED ?? 'true',
            GEOCODING_STATIC_FALLBACK_ENABLED:
              process.env.GEOCODING_STATIC_FALLBACK_ENABLED ?? 'true',
          },
        },
        {
          command: 'npm run build:shared && npm run dev -w apps/web',
          cwd: repoRoot,
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            ...process.env,
            VITE_API_BASE_URL:
              process.env.VITE_API_BASE_URL ?? 'http://localhost:4000',
            VITE_DEMO_API_KEY:
              process.env.VITE_DEMO_API_KEY ?? 'demo-planner-key',
          },
        },
      ],
});
