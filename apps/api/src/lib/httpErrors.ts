import type { FastifyReply } from 'fastify';
import type { ApiErrorEnvelope } from '@sitelens/shared';
import { loadConfig } from '../config';

/**
 * Send a 503 when the database is unavailable. In development, include a hint
 * on how to bring the database up; never fall back silently.
 */
export function sendDatabaseUnavailable(
  reply: FastifyReply,
  error: unknown,
): void {
  const { isProduction } = loadConfig();
  reply.request.log.error(error);
  const body: ApiErrorEnvelope = {
    error: {
      code: 'SERVICE_UNAVAILABLE',
      message: 'The database is unavailable.',
      details: isProduction
        ? undefined
        : 'Run: npm run db:up && npm run db:migrate && npm run ingest:geojson',
    },
  };
  reply.code(503).send(body);
}
