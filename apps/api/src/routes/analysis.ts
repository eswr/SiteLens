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
import { cached } from '../cache/cacheJson';
import { analysisKey, CACHE_TTL } from '../cache/cacheKeys';
import { accessScope } from '../auth/capabilities';
import {
  assertFeature,
  assertUsageWithinLimit,
  resolveBilling,
} from '../billing/billingService';
import { recordUsage } from '../billing/billingRepository';

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
      // Entitlement gate driven by the billing plan (throws 403 otherwise).
      const { user, billing } = await resolveBilling(request);
      assertFeature(billing, 'analysis:run');
      if (user) {
        await assertUsageWithinLimit(
          user.id,
          'analysis:run',
          billing.plan.limits.analysisRunsPerMonth,
        );
      }

      const scope = accessScope(billing);
      const geometry = request.body.geometry as
        | GeoJsonPolygon
        | GeoJsonMultiPolygon;
      try {
        const { data: result, cache, computedAt } = await cached({
          key: analysisKey(geometry, scope),
          ttlSeconds: CACHE_TTL.analysis,
          compute: () => analyzeArea(geometry),
        });
        // Meter successful backend analyses (never for Turf fallback).
        if (user) {
          await recordUsage(user.id, 'analysis:run');
        }
        const body: ApiEnvelope<AnalyzeAreaResponse> = {
          data: { result, engine: 'postgis' },
          meta: {
            requestId: request.id,
            cache,
            cacheKey: analysisKey(geometry, scope),
            computedAt,
            access: {
              role: user?.role,
              plan: billing.plan.id,
            },
          },
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
