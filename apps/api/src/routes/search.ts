import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type { ApiEnvelope, SearchResultItem } from '@sitelens/shared';
import { LAYER_DEFS } from '../lib/layerConfig';
import { loadMockGeojson } from '../lib/loadMockGeojson';
import {
  buildHaystack,
  getFeatureSubtitle,
  getFeatureTitle,
} from '../lib/featureText';

const MAX_RESULTS = 8;

const searchQuery = Type.Object({ q: Type.Optional(Type.String()) });
type SearchQuery = Static<typeof searchQuery>;

/** `GET /api/search?q=` — search across mock features (top 8). */
export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: SearchQuery }>(
    '/search',
    { schema: { querystring: searchQuery } },
    async (request) => {
      const query = (request.query.q ?? '').trim().toLowerCase();
      if (!query) {
        const body: ApiEnvelope<SearchResultItem[]> = { data: [], meta: { count: 0 } };
        return body;
      }

      const collections = await Promise.all(
        LAYER_DEFS.map(async (def) => ({
          def,
          collection: await loadMockGeojson(def.file),
        })),
      );

      const results: SearchResultItem[] = [];
      for (const { def, collection } of collections) {
        for (const feature of collection.features) {
          const props = feature.properties ?? {};
          const label = getFeatureTitle(def.id, props);
          const subtitle = getFeatureSubtitle(def.id, props);
          if (buildHaystack(label, subtitle, props).includes(query)) {
            results.push({
              id: String(feature.id ?? props.id ?? ''),
              layerId: def.id,
              label,
              subtitle,
              properties: props,
              geometry: feature.geometry,
            });
          }
          if (results.length >= MAX_RESULTS) {
            break;
          }
        }
        if (results.length >= MAX_RESULTS) {
          break;
        }
      }

      const body: ApiEnvelope<SearchResultItem[]> = {
        data: results.slice(0, MAX_RESULTS),
        meta: { count: Math.min(results.length, MAX_RESULTS) },
      };
      return body;
    },
  );
}
