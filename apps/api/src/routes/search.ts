import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type { ApiEnvelope, SearchResultItem } from '@sitelens/shared';
import { searchFeatures } from '../db/spatialRepository';
import { sendDatabaseUnavailable } from '../lib/httpErrors';
import { cached } from '../cache/cacheJson';
import { CACHE_TTL, searchKey } from '../cache/cacheKeys';
import { accessScope, getCapabilities } from '../auth/capabilities';

const FULL_RESULTS = 8;
const LIMITED_RESULTS = 5;

const searchQuery = Type.Object({ q: Type.Optional(Type.String()) });
type SearchQuery = Static<typeof searchQuery>;

/** `GET /api/search?q=` — search across features (gated result count), from PostGIS. */
export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: SearchQuery }>(
    '/search',
    { schema: { querystring: searchQuery } },
    async (request, reply) => {
      const capabilities = getCapabilities(request.auth?.user ?? null);
      const scope = accessScope(capabilities);
      const limited = !capabilities.canViewAllLayers;
      const limit = limited ? LIMITED_RESULTS : FULL_RESULTS;

      const query = (request.query.q ?? '').trim();
      if (!query) {
        const body: ApiEnvelope<SearchResultItem[]> = {
          data: [],
          meta: { requestId: request.id, cache: 'none', count: 0 },
        };
        return body;
      }
      try {
        const { data: results, cache, computedAt } = await cached({
          key: searchKey(query, scope),
          ttlSeconds: CACHE_TTL.search,
          compute: () => searchFeatures(query, limit),
        });
        const body: ApiEnvelope<SearchResultItem[]> = {
          data: results,
          meta: {
            requestId: request.id,
            cache,
            cacheKey: searchKey(query, scope),
            computedAt,
            count: results.length,
            access: {
              role: request.auth?.user?.role,
              plan: request.auth?.user?.plan,
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
