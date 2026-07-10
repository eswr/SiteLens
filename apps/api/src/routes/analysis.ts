import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type {
  AnalyzeAreaResponse,
  ApiEnvelope,
  ApiErrorEnvelope,
  GeoJsonMultiPolygon,
  GeoJsonPolygon,
} from '@sitelens/shared';
import { analyzeArea, InvalidGeometryError } from '../db/spatialRepository';
import { sendDatabaseUnavailable } from '../lib/httpErrors';

/**
 * Validated body: a GeoJSON Polygon or MultiPolygon. Coordinates are validated
 * loosely here (present + array); PostGIS performs authoritative validation.
 */
const analyzeAreaBody = Type.Object({
  geometry: Type.Object({
    type: Type.Union([Type.Literal('Polygon'), Type.Literal('MultiPolygon')]),
    coordinates: Type.Array(Type.Unknown()),
  }),
});
type AnalyzeAreaBody = Static<typeof analyzeAreaBody>;

/** `POST /api/analyze-area` — real spatial analysis in PostGIS. */
export async function analysisRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: AnalyzeAreaBody }>(
    '/analyze-area',
    { schema: { body: analyzeAreaBody } },
    async (request, reply) => {
      const geometry = request.body.geometry as
        | GeoJsonPolygon
        | GeoJsonMultiPolygon;
      try {
        const result = await analyzeArea(geometry);
        const body: ApiEnvelope<AnalyzeAreaResponse> = {
          data: { result, engine: 'postgis' },
          meta: { computedAt: new Date().toISOString() },
        };
        return body;
      } catch (error) {
        if (error instanceof InvalidGeometryError) {
          const body: ApiErrorEnvelope = {
            error: { code: 'INVALID_GEOMETRY', message: error.message },
          };
          reply.code(400);
          return body;
        }
        sendDatabaseUnavailable(reply, error);
        return reply;
      }
    },
  );
}
