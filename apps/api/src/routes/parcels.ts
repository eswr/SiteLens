import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type { ApiEnvelope, ApiErrorEnvelope } from '@sitelens/shared';
import { getParcelById, getParcels } from '../db/spatialRepository';
import type { GeoFeature } from '../db/sql';
import { sendDatabaseUnavailable } from '../lib/httpErrors';
import { cached } from '../cache/cacheJson';
import { CACHE_TTL, parcelDetailKey, parcelsKey } from '../cache/cacheKeys';

const parcelParams = Type.Object({ id: Type.String() });
type ParcelParams = Static<typeof parcelParams>;

/** `GET /api/parcels` and `GET /api/parcels/:id`, from PostGIS (cached). */
export async function parcelsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/parcels', async (request, reply) => {
    try {
      const { data: collection, cache, computedAt } = await cached({
        key: parcelsKey(),
        ttlSeconds: CACHE_TTL.parcels,
        compute: getParcels,
      });
      const body: ApiEnvelope<typeof collection> = {
        data: collection,
        meta: {
          requestId: request.id,
          cache,
          cacheKey: parcelsKey(),
          computedAt,
          count: collection.features.length,
        },
      };
      return body;
    } catch (error) {
      sendDatabaseUnavailable(reply, error);
      return reply;
    }
  });

  app.get<{ Params: ParcelParams }>(
    '/parcels/:id',
    { schema: { params: parcelParams } },
    async (request, reply) => {
      const { id } = request.params;
      try {
        const { data: feature, cache, computedAt } = await cached({
          key: parcelDetailKey(id),
          ttlSeconds: CACHE_TTL.parcelDetail,
          compute: () => getParcelById(id),
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
            cacheKey: parcelDetailKey(id),
            computedAt,
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
