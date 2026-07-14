import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type { ApiEnvelope, ApiErrorEnvelope } from '@sitelens/shared';
import { getParcelById, getParcels } from '../db/spatialRepository';
import type { GeoFeature } from '../db/sql';
import { sendDatabaseUnavailable } from '../lib/httpErrors';
import { cached } from '../cache/cacheJson';
import { CACHE_TTL, parcelDetailKey, parcelsKey } from '../cache/cacheKeys';
import { accessScope } from '../auth/capabilities';
import { resolveBilling } from '../billing/billingService';
import {
  assertPlanningContextExists,
  resolvePlanningContextIdParam,
} from '../lib/planningContextParam';

const parcelParams = Type.Object({ id: Type.String() });
type ParcelParams = Static<typeof parcelParams>;

const parcelsQuery = Type.Object({
  planningContextId: Type.Optional(Type.String()),
});
type ParcelsQuery = Static<typeof parcelsQuery>;

/** `GET /api/parcels` and `GET /api/parcels/:id`, scoped by planning context. */
export async function parcelsRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: ParcelsQuery }>('/parcels', async (request, reply) => {
    const resolved = resolvePlanningContextIdParam(
      request.query.planningContextId,
    );
    if (!resolved.ok) {
      const body: ApiErrorEnvelope = {
        error: { code: 'INVALID_CONTEXT', message: resolved.message },
      };
      reply.code(400);
      return body;
    }

    const { user, billing } = await resolveBilling(request);
    const scope = accessScope(billing);
    const parcelLimit = billing.plan.limits.parcelLimit;
    const limited = parcelLimit !== null;
    try {
      const exists = await assertPlanningContextExists(resolved.planningContextId);
      if (!exists.ok) {
        const body: ApiErrorEnvelope = {
          error: { code: 'INVALID_CONTEXT', message: exists.message },
        };
        reply.code(exists.status);
        return body;
      }

      const key = parcelsKey(resolved.planningContextId, scope);
      const { data: collection, cache, computedAt } = await cached({
        key,
        ttlSeconds: CACHE_TTL.parcels,
        compute: async () => {
          const full = await getParcels(resolved.planningContextId);
          if (parcelLimit === null) {
            return full;
          }
          return {
            type: 'FeatureCollection' as const,
            features: full.features.slice(0, parcelLimit),
          };
        },
      });
      const body: ApiEnvelope<typeof collection> = {
        data: collection,
        meta: {
          requestId: request.id,
          cache,
          cacheKey: key,
          computedAt,
          count: collection.features.length,
          planningContextId: resolved.planningContextId,
          access: {
            role: user?.role,
            plan: billing.plan.id,
            limited,
          },
        },
      };
      return body;
    } catch (error) {
      sendDatabaseUnavailable(reply, error);
      return reply;
    }
  });

  app.get<{ Params: ParcelParams; Querystring: ParcelsQuery }>(
    '/parcels/:id',
    { schema: { params: parcelParams, querystring: parcelsQuery } },
    async (request, reply) => {
      const resolved = resolvePlanningContextIdParam(
        request.query.planningContextId,
      );
      if (!resolved.ok) {
        const body: ApiErrorEnvelope = {
          error: { code: 'INVALID_CONTEXT', message: resolved.message },
        };
        reply.code(400);
        return body;
      }
      const { id } = request.params;
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

        const key = parcelDetailKey(resolved.planningContextId, id);
        const { data: feature, cache, computedAt } = await cached({
          key,
          ttlSeconds: CACHE_TTL.parcelDetail,
          compute: () => getParcelById(resolved.planningContextId, id),
        });
        if (!feature) {
          const body: ApiErrorEnvelope = {
            error: { code: 'NOT_FOUND', message: `Parcel not found: ${id}` },
          };
          reply.code(404);
          return body;
        }
        const body: ApiEnvelope<GeoFeature> = {
          data: feature,
          meta: {
            requestId: request.id,
            cache,
            cacheKey: key,
            computedAt,
            planningContextId: resolved.planningContextId,
          },
        };
        return body;
      } catch (error) {
        sendDatabaseUnavailable(reply, error);
        return reply;
      }
    },
  );
}
