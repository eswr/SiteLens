import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { registerRequestLogger } from './plugins/requestLogger.js';
import { registerErrorHandler } from './plugins/errorHandler.js';
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

  registerRequestLogger(app);
  registerAuth(app);
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
