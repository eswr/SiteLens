import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type { ApiEnvelope, ApiErrorEnvelope } from '@sitelens/shared';
import {
  loadMockGeojson,
  type GeoFeature,
  type GeoFeatureCollection,
} from '../lib/loadMockGeojson';

const parcelParams = Type.Object({ id: Type.String() });
type ParcelParams = Static<typeof parcelParams>;

function matchesId(feature: GeoFeature, id: string): boolean {
  const props = feature.properties ?? {};
  return (
    String(feature.id ?? '') === id ||
    String(props.parcelId ?? '') === id ||
    String(props.id ?? '') === id
  );
}

/** `GET /api/parcels` and `GET /api/parcels/:id`. */
export async function parcelsRoutes(app: FastifyInstance): Promise<void> {
  app.get('/parcels', async () => {
    const collection = await loadMockGeojson('parcels');
    const body: ApiEnvelope<GeoFeatureCollection> = {
      data: collection,
      meta: {
        computedAt: new Date().toISOString(),
        count: collection.features.length,
      },
    };
    return body;
  });

  app.get<{ Params: ParcelParams }>(
    '/parcels/:id',
    { schema: { params: parcelParams } },
    async (request, reply) => {
      const { id } = request.params;
      const collection = await loadMockGeojson('parcels');
      const feature = collection.features.find((item) => matchesId(item, id));

      if (!feature) {
        const body: ApiErrorEnvelope = {
          error: { code: 'NOT_FOUND', message: `Parcel not found: ${id}` },
        };
        reply.code(404);
        return body;
      }

      const body: ApiEnvelope<GeoFeature> = { data: feature };
      return body;
    },
  );
}
