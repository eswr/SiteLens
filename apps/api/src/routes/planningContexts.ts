import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  BuildPlanningContextJobResponse,
  PlanningContext,
  PlanningContextBuildJobStatusResponse,
  PlanningContextDetailResponse,
} from '@sitelens/shared';
import {
  assertFeature,
  assertUsageWithinLimit,
  resolveBilling,
} from '../billing/billingService';
import { sendDatabaseUnavailable } from '../lib/httpErrors';
import {
  enqueuePlanningContextBuild,
  PlanningContextBuildError,
} from '../externalData/planningContextBuilder';
import { getBuildJob } from '../externalData/planningContextBuildJobRepository';
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

const jobParams = Type.Object({ jobId: Type.String({ minLength: 1 }) });
type JobParams = Static<typeof jobParams>;

/** Planning-context list / detail / build / job routes. */
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

  // Must be registered before `/planning-contexts/:id`.
  app.get<{ Params: JobParams }>(
    '/planning-contexts/jobs/:jobId',
    { schema: { params: jobParams } },
    async (request, reply) => {
      try {
        const job = await getBuildJob(request.params.jobId);
        if (!job) {
          const body: ApiErrorEnvelope = {
            error: {
              code: 'NOT_FOUND',
              message: `Build job not found: ${request.params.jobId}`,
            },
          };
          reply.code(404);
          return body;
        }
        const body: ApiEnvelope<PlanningContextBuildJobStatusResponse> = {
          data: { job },
          meta: {
            requestId: request.id,
            planningContextId: job.planningContextId,
          },
        };
        return body;
      } catch (error) {
        sendDatabaseUnavailable(reply, error);
        return reply;
      }
    },
  );

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
        const result = await enqueuePlanningContextBuild(
          {
            place: request.body.place,
            source: request.body.source ?? 'external-osm',
          },
          {
            userId: user?.id ?? null,
            beforeLiveFetch: async () => {
              // Checked only before enqueueing a live Overpass job (not reuse).
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

        const body: ApiEnvelope<BuildPlanningContextJobResponse> = {
          data: result,
          meta: {
            requestId: request.id,
            planningContextId: result.contextId,
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
