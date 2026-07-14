import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  LayerSummary,
  PlanningLayerId,
} from '@sitelens/shared';
import { getLayerFeatures, getLayers } from '../db/spatialRepository.js';
import { sendDatabaseUnavailable } from '../lib/httpErrors.js';
import { cached } from '../cache/cacheJson.js';
import { CACHE_TTL, layersKey } from '../cache/cacheKeys.js';
import {
  assertPlanningContextExists,
  resolvePlanningContextIdParam,
} from '../lib/planningContextParam.js';

const LAYER_IDS = new Set<PlanningLayerId>([
  'parcels',
  'zoning',
  'constraints',
  'transit',
  'developmentActivity',
]);

const layersQuery = Type.Object({
  planningContextId: Type.Optional(Type.String()),
});
type LayersQuery = Static<typeof layersQuery>;

const layerGeoJsonParams = Type.Object({ layerId: Type.String() });
type LayerGeoJsonParams = Static<typeof layerGeoJsonParams>;

/** `GET /api/layers` — layer metadata with feature counts for a planning context. */
export async function layersRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: LayersQuery }>(
    '/layers',
    { schema: { querystring: layersQuery } },
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
      try {
        const exists = await assertPlanningContextExists(resolved.planningContextId);
        if (!exists.ok) {
          const body: ApiErrorEnvelope = {
            error: { code: 'INVALID_CONTEXT', message: exists.message },
          };
          reply.code(exists.status);
          return body;
        }

        const key = layersKey(resolved.planningContextId);
        const { data, cache, computedAt } = await cached({
          key,
          ttlSeconds: CACHE_TTL.layers,
          compute: () => getLayers(resolved.planningContextId),
        });
        const body: ApiEnvelope<LayerSummary[]> = {
          data,
          meta: {
            requestId: request.id,
            cache,
            cacheKey: key,
            computedAt,
            count: data.length,
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

  /** GeoJSON features for one layer within a planning context (map + local index). */
  app.get<{ Params: LayerGeoJsonParams; Querystring: LayersQuery }>(
    '/layers/:layerId/geojson',
    { schema: { params: layerGeoJsonParams, querystring: layersQuery } },
    async (request, reply) => {
      const layerId = request.params.layerId as PlanningLayerId;
      if (!LAYER_IDS.has(layerId)) {
        const body: ApiErrorEnvelope = {
          error: { code: 'NOT_FOUND', message: `Unknown layer: ${layerId}` },
        };
        reply.code(404);
        return body;
      }
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
        const data = await getLayerFeatures(resolved.planningContextId, layerId);
        const body: ApiEnvelope<typeof data> = {
          data,
          meta: {
            requestId: request.id,
            count: data.features.length,
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
