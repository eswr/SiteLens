import type { FastifyInstance } from 'fastify';
import type { AuthContext } from '@sitelens/shared';
import { getAuthContext } from './getAuthContext.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Auth context resolved from the request's API key (anonymous by default). */
    auth: AuthContext;
  }
}

/**
 * Attach `request.auth` to every request. Never rejects unauthenticated
 * requests globally — capability guards enforce access per route.
 */
export function registerAuth(app: FastifyInstance): void {
  app.decorateRequest('auth', null as unknown as AuthContext);
  app.addHook('onRequest', async (request) => {
    request.auth = getAuthContext(request);
  });
}
