import type { FastifyInstance } from 'fastify';
import type { ApiEnvelope, LayerSummary } from '@sitelens/shared';
import { getLayers } from '../db/spatialRepository';
import { sendDatabaseUnavailable } from '../lib/httpErrors';
import { cached } from '../cache/cacheJson';
import { CACHE_TTL, layersKey } from '../cache/cacheKeys';

/** `GET /api/layers` — layer metadata with feature counts, from PostGIS (cached). */
export async function layersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/layers', async (request, reply) => {
    try {
      const { data, cache, computedAt } = await cached({
        key: layersKey(),
        ttlSeconds: CACHE_TTL.layers,
        compute: getLayers,
      });
      const body: ApiEnvelope<LayerSummary[]> = {
        data,
        meta: {
          requestId: request.id,
          cache,
          cacheKey: layersKey(),
          computedAt,
          count: data.length,
        },
      };
      return body;
    } catch (error) {
      sendDatabaseUnavailable(reply, error);
      return reply;
    }
  });
}
