import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { registerRequestLogger } from './plugins/requestLogger';
import { registerErrorHandler } from './plugins/errorHandler';
import { registerAuth } from './auth/authPlugin';
import { healthRoutes } from './routes/health';
import { meRoutes } from './routes/me';
import { billingRoutes } from './routes/billing';
import { layersRoutes } from './routes/layers';
import { parcelsRoutes } from './routes/parcels';
import { searchRoutes } from './routes/search';
import { analysisRoutes } from './routes/analysis';
import { planningSummaryRoutes } from './routes/planningSummary';

export interface BuildAppOptions {
  webOrigin?: string;
  isProduction?: boolean;
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

  await app.register(cors, { origin: options.webOrigin ?? true });

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
      await api.register(analysisRoutes);
      await api.register(planningSummaryRoutes);
    },
    { prefix: '/api' },
  );

  return app;
}
