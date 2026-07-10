import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type {
  ApiEnvelope,
  PlanningSummaryResponse,
  SpatialAnalysisResult,
} from '@sitelens/shared';
import {
  assertFeature,
  assertUsageWithinLimit,
  resolveBilling,
} from '../billing/billingService';
import { recordUsage } from '../billing/billingRepository';
import { accessScope } from '../auth/capabilities';
import { cached } from '../cache/cacheJson';
import { CACHE_TTL, planningSummaryKey } from '../cache/cacheKeys';
import { generatePlanningSummary } from '../summary/generatePlanningSummary';

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
    { schema: { body: planningSummaryBody } },
    async (request) => {
      // Entitlement gate driven by the billing plan (throws 403 otherwise).
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

      const { data: summary, cache, computedAt } = await cached({
        key: planningSummaryKey(scope, analysisResult),
        ttlSeconds: CACHE_TTL.summary,
        compute: async () =>
          generatePlanningSummary({
            analysisResult,
            context: request.body.context,
          }),
      });

      // Meter successful backend summaries (never for local fallback).
      if (user) {
        await recordUsage(user.id, 'summary:generate');
      }

      const body: ApiEnvelope<PlanningSummaryResponse> = {
        data: { summary, engine: 'deterministic-backend' },
        meta: {
          requestId: request.id,
          cache,
          computedAt,
          access: { role: user?.role, plan: billing.plan.id },
        },
      };
      return body;
    },
  );
}
