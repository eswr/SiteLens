import type { FastifyInstance } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { Static } from '@sinclair/typebox';
import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  PlaceSearchResponse,
} from '@sitelens/shared';
import { DEFAULT_NOMINATIM_USER_AGENT, loadConfig } from '../config';
import { HttpError } from '../auth/requireCapability';
import { MIN_QUERY_LENGTH, searchPlaces } from '../geocoding/geocodingService';

const geocodeQuery = Type.Object({
  q: Type.Optional(Type.String()),
  limit: Type.Optional(Type.Number()),
});
type GeocodeQuery = Static<typeof geocodeQuery>;

let warnedAboutUserAgent = false;

/** Ensure geocoding is enabled and (in production) properly identified. */
function assertGeocodingReady(): void {
  const config = loadConfig();
  if (!config.geocodingEnabled) {
    throw new HttpError(
      503,
      'GEOCODING_DISABLED',
      'Worldwide place search is disabled. Set GEOCODING_ENABLED=true to enable it.',
    );
  }
  const uaMissingOrDefault =
    config.nominatimUserAgent.length === 0 ||
    config.nominatimUserAgent === DEFAULT_NOMINATIM_USER_AGENT ||
    config.nominatimUserAgent.includes('replace-with-your-email');
  if (uaMissingOrDefault) {
    if (config.isProduction) {
      throw new HttpError(
        503,
        'GEOCODING_MISCONFIGURED',
        'NOMINATIM_USER_AGENT must be set to a valid identifying value in production.',
      );
    }
    if (!warnedAboutUserAgent) {
      warnedAboutUserAgent = true;
      console.warn(
        '[geocoding] Using the default placeholder NOMINATIM_USER_AGENT. Set a real identifying value before deploying.',
      );
    }
  }
}

/** `GET /api/geocode/search?q=&limit=` — worldwide place search (Nominatim proxy). */
export async function geocodingRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: GeocodeQuery }>(
    '/geocode/search',
    { schema: { querystring: geocodeQuery } },
    async (request, reply) => {
      try {
        assertGeocodingReady();

        const query = (request.query.q ?? '').trim();
        if (query.length < MIN_QUERY_LENGTH) {
          throw new HttpError(
            400,
            'BAD_REQUEST',
            `Query "q" must be at least ${MIN_QUERY_LENGTH} characters.`,
          );
        }

        const { response, cache, computedAt } = await searchPlaces(
          query,
          request.query.limit,
        );

        const body: ApiEnvelope<PlaceSearchResponse> = {
          data: response,
          meta: { requestId: request.id, cache, computedAt },
        };
        return body;
      } catch (error) {
        // Preserve geocoding-specific codes (the global handler relabels 5xx).
        if (error instanceof HttpError) {
          if (error.statusCode >= 500) {
            request.log.error(error);
          }
          const body: ApiErrorEnvelope = {
            error: { code: error.code, message: error.message },
          };
          reply.code(error.statusCode).send(body);
          return reply;
        }
        throw error;
      }
    },
  );
}
