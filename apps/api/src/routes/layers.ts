import type { FastifyInstance } from 'fastify';
import type { ApiEnvelope, LayerSummary } from '@sitelens/shared';
import { getLayers } from '../db/spatialRepository';
import { sendDatabaseUnavailable } from '../lib/httpErrors';

/** `GET /api/layers` — layer metadata with feature counts, from PostGIS. */
export async function layersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/layers', async (_request, reply) => {
    try {
      const layers = await getLayers();
      const body: ApiEnvelope<LayerSummary[]> = {
        data: layers,
        meta: { computedAt: new Date().toISOString(), count: layers.length },
      };
      return body;
    } catch (error) {
      sendDatabaseUnavailable(reply, error);
      return reply;
    }
  });
}
