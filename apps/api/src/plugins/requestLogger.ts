import type { FastifyInstance } from 'fastify';

/**
 * Lightweight request logging: attaches the request id to responses and logs a
 * compact line per request. Uses Fastify's built-in `reply.elapsedTime`.
 */
export function registerRequestLogger(app: FastifyInstance): void {
  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
  });

  app.addHook('onResponse', async (request, reply) => {
    const line = {
      level: 'info',
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMs: Math.round(reply.elapsedTime * 100) / 100,
    };
    // Intentionally plain stdout logging to avoid heavy logging deps for now.
    console.log(JSON.stringify(line));
  });
}
