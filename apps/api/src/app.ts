import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import { registerRequestLogger } from './plugins/requestLogger.js';
import { registerErrorHandler } from './plugins/errorHandler.js';
import { registerRateLimit } from './plugins/rateLimit.js';
import { registerAuth } from './auth/authPlugin.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';
import { billingRoutes } from './routes/billing.js';
import { layersRoutes } from './routes/layers.js';
import { parcelsRoutes } from './routes/parcels.js';
import { searchRoutes } from './routes/search.js';
import { geocodingRoutes } from './routes/geocoding.js';
import { analysisRoutes } from './routes/analysis.js';
import { planningSummaryRoutes } from './routes/planningSummary.js';
import { planningContextsRoutes } from './routes/planningContexts.js';

export interface BuildAppOptions {
  webOrigin?: string;
  isProduction?: boolean;
  /**
   * Register `@fastify/rate-limit`. Defaults off under Vitest so unit inject
   * suites are not flaky; production/dev enable it.
   */
  enableRateLimit?: boolean;
}

/** Parse a single origin or comma-separated list for `@fastify/cors`. */
export function parseCorsOrigin(
  webOrigin: string | undefined,
): boolean | string | string[] {
  if (!webOrigin || webOrigin.trim().length === 0) {
    return true;
  }
  const origins = webOrigin
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (origins.length === 0) {
    return true;
  }
  if (origins.length === 1) {
    return origins[0];
  }
  return origins;
}

/**
 * Build a configured Fastify instance. Kept side-effect free (no `listen`) so
 * tests can use `app.inject(...)`.
 */
export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false,
    genReqId: (req) => {
      const header = req.headers['x-request-id'];
      return (Array.isArray(header) ? header[0] : header) ?? randomUUID();
    },
  });

  // WEB_ORIGIN may be a single origin or a comma-separated list (e.g. Vercel + local Vite).
  const corsOrigin = parseCorsOrigin(options.webOrigin);
  await app.register(cors, { origin: corsOrigin });

  // CSP is a frontend concern (MapLibre loads external styles/tiles).
  await app.register(helmet, { contentSecurityPolicy: false });

  registerRequestLogger(app);
  // Auth must run before rate-limit so keyGenerator / tiered max see request.auth.
  registerAuth(app);

  const enableRateLimit =
    options.enableRateLimit ?? process.env.VITEST !== 'true';
  if (enableRateLimit) {
    await registerRateLimit(app);
  }

  registerErrorHandler(app, { isProduction: options.isProduction ?? false });

  // Health is available at both /health and /api/health.
  await app.register(healthRoutes);

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(meRoutes);
      await api.register(billingRoutes);
      await api.register(layersRoutes);
      await api.register(parcelsRoutes);
      await api.register(searchRoutes);
      await api.register(geocodingRoutes);
      await api.register(analysisRoutes);
      await api.register(planningSummaryRoutes);
      await api.register(planningContextsRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}
