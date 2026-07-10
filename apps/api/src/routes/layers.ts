import type { FastifyInstance } from 'fastify';
import type { ApiEnvelope, LayerSummary } from '@sitelens/shared';
import { LAYER_DEFS } from '../lib/layerConfig';
import { loadMockGeojson } from '../lib/loadMockGeojson';

/** `GET /api/layers` — layer metadata with feature counts. */
export async function layersRoutes(app: FastifyInstance): Promise<void> {
  app.get('/layers', async () => {
    const layers: LayerSummary[] = await Promise.all(
      LAYER_DEFS.map(async (def) => {
        const collection = await loadMockGeojson(def.file);
        return {
          id: def.id,
          label: def.label,
          description: def.description,
          geometryType: def.geometryType,
          featureCount: collection.features.length,
        };
      }),
    );
    const body: ApiEnvelope<LayerSummary[]> = {
      data: layers,
      meta: { computedAt: new Date().toISOString(), count: layers.length },
    };
    return body;
  });
}
