import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  SearchResultItem,
} from '@sitelens/shared';
import { searchFeatures } from '../db/spatialRepository.js';
import { sendDatabaseUnavailable } from '../lib/httpErrors.js';
import { cached } from '../cache/cacheJson.js';
import { CACHE_TTL, searchKey } from '../cache/cacheKeys.js';
import { accessScope } from '../auth/capabilities.js';
import { resolveBilling } from '../billing/billingService.js';
import {
  assertPlanningContextExists,
  resolvePlanningContextIdParam,
} from '../lib/planningContextParam.js';

const searchQuery = Type.Object({
  q: Type.Optional(Type.String()),
  planningContextId: Type.Optional(Type.String()),
});
type SearchQuery = Static<typeof searchQuery>;

/** `GET /api/search?q=` — search features within a planning context. */
export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: SearchQuery }>(
    '/search',
    { schema: { querystring: searchQuery } },
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

      const { user, billing } = await resolveBilling(request);
      const scope = accessScope(billing);
      const limit = billing.plan.limits.searchResults;
      const limited = !billing.features.includes('search:full');

      const query = (request.query.q ?? '').trim();
      if (!query) {
        const body: ApiEnvelope<SearchResultItem[]> = {
          data: [],
          meta: {
            requestId: request.id,
            cache: 'none',
            count: 0,
            planningContextId: resolved.planningContextId,
          },
        };
        return body;
      }
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

        const key = searchKey(resolved.planningContextId, query, scope);
        const { data: results, cache, computedAt } = await cached({
          key,
          ttlSeconds: CACHE_TTL.search,
          compute: () =>
            searchFeatures(resolved.planningContextId, query, limit),
        });
        const body: ApiEnvelope<SearchResultItem[]> = {
          data: results,
          meta: {
            requestId: request.id,
            cache,
            cacheKey: key,
            computedAt,
            count: results.length,
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
    },
  );
}
