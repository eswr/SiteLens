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
import { analyzeArea, InvalidGeometryError } from '../db/spatialRepository.js';
import { sendDatabaseUnavailable } from '../lib/httpErrors.js';
import { cached } from '../cache/cacheJson.js';
import { analysisKey, CACHE_TTL } from '../cache/cacheKeys.js';
import { accessScope } from '../auth/capabilities.js';
import {
  assertFeature,
  assertUsageWithinLimit,
  resolveBilling,
} from '../billing/billingService.js';
import { recordUsage } from '../billing/billingRepository.js';
import {
  assertPlanningContextExists,
  resolvePlanningContextIdParam,
} from '../lib/planningContextParam.js';

const analyzeAreaBody = Type.Object({
  geometry: Type.Object({
    type: Type.Union([Type.Literal('Polygon'), Type.Literal('MultiPolygon')]),
    coordinates: Type.Array(Type.Unknown()),
  }),
  planningContextId: Type.Optional(Type.String()),
});
type AnalyzeAreaBody = Static<typeof analyzeAreaBody>;

/** `POST /api/analyze-area` — PostGIS analysis scoped to a planning context. */
export async function analysisRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: AnalyzeAreaBody }>(
    '/analyze-area',
    { schema: { body: analyzeAreaBody } },
    async (request, reply) => {
      const resolved = resolvePlanningContextIdParam(
        request.body.planningContextId,
      );
      if (!resolved.ok) {
        const body: ApiErrorEnvelope = {
          error: { code: 'INVALID_CONTEXT', message: resolved.message },
        };
        reply.code(400);
        return body;
      }

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
        const exists = await assertPlanningContextExists(
          resolved.planningContextId,
        );
        if (!exists.ok) {
          const body: ApiErrorEnvelope = {
            error: { code: 'INVALID_CONTEXT', message: exists.message },
          };
          reply.code(exists.status);
          return body;
        }

        const key = analysisKey(resolved.planningContextId, geometry, scope);
        const { data: result, cache, computedAt } = await cached({
          key,
          ttlSeconds: CACHE_TTL.analysis,
          compute: () => analyzeArea(resolved.planningContextId, geometry),
        });
        if (user) {
          await recordUsage(user.id, 'analysis:run');
        }
        const body: ApiEnvelope<AnalyzeAreaResponse> = {
          data: { result, engine: 'postgis' },
          meta: {
            requestId: request.id,
            cache,
            cacheKey: key,
            computedAt,
            planningContextId: resolved.planningContextId,
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
