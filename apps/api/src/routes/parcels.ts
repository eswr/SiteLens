import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type { ApiEnvelope, ApiErrorEnvelope } from '@sitelens/shared';
import { getParcelById, getParcels } from '../db/spatialRepository';
import type { GeoFeature } from '../db/sql';
import { sendDatabaseUnavailable } from '../lib/httpErrors';

const parcelParams = Type.Object({ id: Type.String() });
type ParcelParams = Static<typeof parcelParams>;

/** `GET /api/parcels` and `GET /api/parcels/:id`, from PostGIS. */
export async function parcelsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/parcels', async (_request, reply) => {
    try {
      const collection = await getParcels();
      const body: ApiEnvelope<typeof collection> = {
        data: collection,
        meta: {
          computedAt: new Date().toISOString(),
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
        const feature = await getParcelById(id);
        if (!feature) {
          const body: ApiErrorEnvelope = {
            error: { code: 'NOT_FOUND', message: `Parcel not found: ${id}` },
          };
          reply.code(404);
          return body;
        }
        const body: ApiEnvelope<GeoFeature> = { data: feature };
        return body;
      } catch (error) {
        sendDatabaseUnavailable(reply, error);
        return reply;
      }
    },
  );
}
