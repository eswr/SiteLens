import type { FastifyError, FastifyInstance } from 'fastify';
import type { ApiErrorEnvelope } from '@sitelens/shared';

/**
 * Centralized error + not-found handling returning consistent JSON envelopes.
 * Stack traces are never returned; 5xx messages are generic in production.
 */
export function registerErrorHandler(
  app: FastifyInstance,
  options: { isProduction: boolean },
): void {
  app.setNotFoundHandler((request, reply) => {
    const body: ApiErrorEnvelope = {
      error: {
        code: 'NOT_FOUND',
        message: `Route not found: ${request.method} ${request.url}`,
      },
    };
    reply.code(404).send(body);
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    // Fastify/Ajv validation errors.
    if (error.validation) {
      const body: ApiErrorEnvelope = {
        error: {
          code: 'BAD_REQUEST',
          message: 'Request validation failed',
          details: error.validation,
        },
      };
      reply.code(400).send(body);
      return;
    }

    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 500) {
      request.log.error(error);
    }
    const code =
      statusCode >= 500 ? 'INTERNAL_ERROR' : (error.code ?? 'ERROR');
    const message =
      statusCode >= 500 && options.isProduction
        ? 'Internal server error'
        : error.message;

    const body: ApiErrorEnvelope = { error: { code, message } };
    reply.code(statusCode).send(body);
  });
}
