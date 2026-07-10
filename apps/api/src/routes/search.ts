import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type { ApiEnvelope, SearchResultItem } from '@sitelens/shared';
import { searchFeatures } from '../db/spatialRepository';
import { sendDatabaseUnavailable } from '../lib/httpErrors';
import { cached } from '../cache/cacheJson';
import { CACHE_TTL, searchKey } from '../cache/cacheKeys';

const MAX_RESULTS = 8;

const searchQuery = Type.Object({ q: Type.Optional(Type.String()) });
type SearchQuery = Static<typeof searchQuery>;

/** `GET /api/search?q=` — search across features (top 8), from PostGIS (cached). */
export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: SearchQuery }>(
    '/search',
    { schema: { querystring: searchQuery } },
    async (request, reply) => {
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
          key: searchKey(query),
          ttlSeconds: CACHE_TTL.search,
          compute: () => searchFeatures(query, MAX_RESULTS),
        });
        const body: ApiEnvelope<SearchResultItem[]> = {
          data: results,
          meta: {
            requestId: request.id,
            cache,
            cacheKey: searchKey(query),
            computedAt,
            count: results.length,
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
