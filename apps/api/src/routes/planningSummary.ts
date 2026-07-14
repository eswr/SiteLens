import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  PlanningSummaryResponse,
  SpatialAnalysisResult,
} from '@sitelens/shared';
import { LOCAL_DEMO_SYDNEY_CONTEXT_ID } from '@sitelens/shared';
import {
  assertFeature,
  assertUsageWithinLimit,
  resolveBilling,
} from '../billing/billingService.js';
import { recordUsage } from '../billing/billingRepository.js';
import { accessScope } from '../auth/capabilities.js';
import { cached } from '../cache/cacheJson.js';
import { CACHE_TTL, planningSummaryKey } from '../cache/cacheKeys.js';
import { generatePlanningSummary } from '../summary/generatePlanningSummary.js';
import { resolvePlanningContextIdParam } from '../lib/planningContextParam.js';
import {
  RATE_LIMITS,
  tieredRateLimitConfig,
} from '../plugins/rateLimit.js';

const zoningItem = Type.Object({
  zoneCode: Type.String(),
  zoneName: Type.String(),
  count: Type.Number(),
});
const constraintItem = Type.Object({
  id: Type.String(),
  constraintType: Type.String(),
  riskLevel: Type.String(),
  description: Type.String(),
});
const transitItem = Type.Object({
  id: Type.String(),
  name: Type.String(),
  mode: Type.String(),
  distanceMeters: Type.Number(),
});
const activityItem = Type.Object({
  status: Type.String(),
  count: Type.Number(),
});

const analysisResultSchema = Type.Object({
  areaSqm: Type.Number(),
  areaHectares: Type.Number(),
  parcelCount: Type.Number(),
  averageDevelopmentScore: Type.Union([Type.Number(), Type.Null()]),
  zoningBreakdown: Type.Array(zoningItem),
  intersectingConstraints: Type.Array(constraintItem),
  nearbyTransit: Type.Array(transitItem),
  developmentActivityCount: Type.Number(),
  developmentActivityByStatus: Type.Array(activityItem),
  planningContextId: Type.Optional(Type.String()),
});

const planningSummaryBody = Type.Object({
  analysisResult: analysisResultSchema,
  context: Type.Optional(
    Type.Object({
      label: Type.Optional(Type.String()),
      sourceEngine: Type.Optional(
        Type.Union([
          Type.Literal('postgis'),
          Type.Literal('turf-local'),
          Type.Literal('turf-fallback'),
        ]),
      ),
      planningContextId: Type.Optional(Type.String()),
      planningContextSource: Type.Optional(
        Type.Union([
          Type.Literal('local-demo'),
          Type.Literal('external-osm'),
          Type.Literal('external-overture'),
          Type.Literal('synthetic-fallback'),
        ]),
      ),
    }),
  ),
});
type PlanningSummaryBody = Static<typeof planningSummaryBody>;

/**
 * `POST /api/planning-summary` — backend-owned deterministic planning summary.
 *
 * Gated by the `summary:generate` plan feature, metered per plan, and cached in
 * Redis (plan-scoped). No external LLM is called; generation is deterministic.
 */
export async function planningSummaryRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post<{ Body: PlanningSummaryBody }>(
    '/planning-summary',
    {
      schema: { body: planningSummaryBody },
      config: tieredRateLimitConfig(RATE_LIMITS.planningSummary),
    },
    async (request, reply) => {
      const resolved = resolvePlanningContextIdParam(
        request.body.context?.planningContextId,
      );
      if (!resolved.ok) {
        const body: ApiErrorEnvelope = {
          error: { code: 'INVALID_CONTEXT', message: resolved.message },
        };
        reply.code(400);
        return body;
      }

      const { user, billing } = await resolveBilling(request);
      assertFeature(billing, 'summary:generate');
      if (user) {
        await assertUsageWithinLimit(
          user.id,
          'summary:generate',
          billing.plan.limits.summaryRunsPerMonth,
        );
      }

      const scope = accessScope(billing);
      const analysisResult = request.body.analysisResult as SpatialAnalysisResult;
      const context = {
        ...request.body.context,
        planningContextId: resolved.planningContextId,
        planningContextSource:
          request.body.context?.planningContextSource ??
          (resolved.planningContextId === LOCAL_DEMO_SYDNEY_CONTEXT_ID
            ? ('local-demo' as const)
            : ('external-osm' as const)),
      };

      const key = planningSummaryKey(
        resolved.planningContextId,
        scope,
        analysisResult,
      );
      const { data: summary, cache, computedAt } = await cached({
        key,
        ttlSeconds: CACHE_TTL.summary,
        compute: async () =>
          generatePlanningSummary({
            analysisResult,
            context,
          }),
      });

      if (user) {
        await recordUsage(user.id, 'summary:generate');
      }

      const body: ApiEnvelope<PlanningSummaryResponse> = {
        data: { summary, engine: 'deterministic-backend' },
        meta: {
          requestId: request.id,
          cache,
          computedAt,
          planningContextId: resolved.planningContextId,
          access: { role: user?.role, plan: billing.plan.id },
        },
      };
      return body;
    },
  );
}
