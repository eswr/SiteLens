import type { FastifyInstance } from 'fastify';
import type { ApiEnvelope, HealthResponse } from '@sitelens/shared';
import { API_VERSION } from '../config.js';

/** Registers `GET /health` (also mounted under `/api` by the app factory). */
export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/health', async () => {
    const data: HealthResponse = {
      status: 'ok',
      service: 'sitelens-api',
      version: API_VERSION,
      timestamp: new Date().toISOString(),
    };
    const body: ApiEnvelope<HealthResponse> = { data };
    return body;
  });
}
