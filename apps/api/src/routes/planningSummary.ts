import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { ApiErrorEnvelope } from '@sitelens/shared';
import { assertFeature, resolveBilling } from '../billing/billingService';

/** Validated minimal body: optional area id and/or precomputed metrics. */
const planningSummaryBody = Type.Object({
  areaId: Type.Optional(Type.String()),
  metrics: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
});

/**
 * `POST /api/planning-summary` — planner/enterprise-gated, typed placeholder.
 * Backend summary wiring (no external LLM) arrives in a later step.
 */
export async function planningSummaryRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.post(
    '/planning-summary',
    { schema: { body: planningSummaryBody } },
    async (request, reply) => {
      // Entitlement gate driven by the billing plan (throws 403 otherwise).
      const { billing } = await resolveBilling(request);
      assertFeature(billing, 'summary:generate');
      const body: ApiErrorEnvelope = {
        error: {
          code: 'NOT_IMPLEMENTED',
          message:
            'Backend planning summary generation will be wired up in a later step. The frontend currently generates a deterministic local summary.',
        },
      };
      reply.code(501);
      return body;
    },
  );
}
