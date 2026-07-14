import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  BuildPlanningContextResponse,
  PlanningContext,
  PlanningContextDetailResponse,
} from '@sitelens/shared';
import {
  assertFeature,
  assertUsageWithinLimit,
  resolveBilling,
} from '../billing/billingService';
import { recordUsage } from '../billing/billingRepository';
import { sendDatabaseUnavailable } from '../lib/httpErrors';
import {
  buildExternalPlanningContext,
  PlanningContextBuildError,
} from '../externalData/planningContextBuilder';
import {
  countContextFeatures,
  getPlanningContext,
  listPlanningContexts,
} from '../externalData/planningContextRepository';

const buildBody = Type.Object({
  place: Type.Object({
    id: Type.String(),
    label: Type.String(),
    displayName: Type.String(),
    latitude: Type.Number(),
    longitude: Type.Number(),
    boundingBox: Type.Optional(
      Type.Tuple([Type.Number(), Type.Number(), Type.Number(), Type.Number()]),
    ),
    provider: Type.String(),
  }),
  source: Type.Optional(Type.Literal('external-osm')),
});
type BuildBody = Static<typeof buildBody>;

const contextParams = Type.Object({ id: Type.String() });
type ContextParams = Static<typeof contextParams>;

/** Planning-context list / detail / build routes. */
export async function planningContextsRoutes(
  app: FastifyInstance,
): Promise<void> {
  app.get('/planning-contexts', async (request, reply) => {
    try {
      const contexts = await listPlanningContexts();
      const body: ApiEnvelope<PlanningContext[]> = {
        data: contexts,
        meta: { requestId: request.id, count: contexts.length },
      };
      return body;
    } catch (error) {
      sendDatabaseUnavailable(reply, error);
      return reply;
    }
  });

  app.get<{ Params: ContextParams }>(
    '/planning-contexts/:id',
    { schema: { params: contextParams } },
    async (request, reply) => {
      try {
        const context = await getPlanningContext(request.params.id);
        if (!context) {
          const body: ApiErrorEnvelope = {
            error: {
              code: 'NOT_FOUND',
              message: `Planning context not found: ${request.params.id}`,
            },
          };
          reply.code(404);
          return body;
        }
        const counts = await countContextFeatures(context.id);
        const body: ApiEnvelope<PlanningContextDetailResponse> = {
          data: { context, counts },
          meta: {
            requestId: request.id,
            planningContextId: context.id,
          },
        };
        return body;
      } catch (error) {
        sendDatabaseUnavailable(reply, error);
        return reply;
      }
    },
  );

  app.post<{ Body: BuildBody }>(
    '/planning-contexts/build',
    { schema: { body: buildBody } },
    async (request, reply) => {
      const { user, billing } = await resolveBilling(request);
      assertFeature(billing, 'external-context:build');

      try {
        const result = await buildExternalPlanningContext(
          {
            place: request.body.place,
            source: request.body.source ?? 'external-osm',
          },
          {
            beforeLiveFetch: async () => {
              // Checked only before a live Overpass call (not for fresh reuse).
              if (user) {
                await assertUsageWithinLimit(
                  user.id,
                  'external-context:build',
                  billing.plan.limits.externalContextBuildsPerMonth,
                );
              }
            },
          },
        );

        if (user && result.reused !== true) {
          await recordUsage(user.id, 'external-context:build');
        }

        const body: ApiEnvelope<BuildPlanningContextResponse> = {
          data: result,
          meta: {
            requestId: request.id,
            planningContextId: result.context.id,
            access: { role: user?.role, plan: billing.plan.id },
          },
        };
        return body;
      } catch (error) {
        if (error instanceof PlanningContextBuildError) {
          const body: ApiErrorEnvelope = {
            error: { code: error.code, message: error.message },
          };
          reply.code(error.statusCode);
          return body;
        }
        // Entitlement HttpError from assertUsageWithinLimit / assertFeature.
        throw error;
      }
    },
  );
}
