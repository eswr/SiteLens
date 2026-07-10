import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { ApiErrorEnvelope } from '@sitelens/shared';

/** Validated body: a GeoJSON Polygon geometry. */
const analyzeAreaBody = Type.Object({
  geometry: Type.Object({
    type: Type.Literal('Polygon'),
    coordinates: Type.Array(Type.Array(Type.Array(Type.Number()))),
  }),
});

/**
 * `POST /api/analyze-area` — typed + validated placeholder.
 * Real spatial analysis will be implemented with PostGIS in a later step.
 */
export async function analysisRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    '/analyze-area',
    { schema: { body: analyzeAreaBody } },
    async (_request, reply) => {
      const body: ApiErrorEnvelope = {
        error: {
          code: 'NOT_IMPLEMENTED',
          message:
            'Backend spatial analysis will be implemented with PostGIS in Step 10.',
        },
      };
      reply.code(501);
      return body;
    },
  );
}
