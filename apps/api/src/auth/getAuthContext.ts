import type { FastifyRequest } from 'fastify';
import type { AuthContext } from '@sitelens/shared';
import { getUserForApiKey } from './demoUsers';

/** Extract the API key from `x-api-key` or `Authorization: Bearer <key>`. */
function extractApiKey(request: FastifyRequest): string | undefined {
  const headerKey = request.headers['x-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }
  const auth = request.headers.authorization;
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) {
    return auth.slice(7).trim() || undefined;
  }
  return undefined;
}

/**
 * Build the auth context for a request. Unknown or missing keys resolve to an
 * anonymous context (no hard failure) — route guards decide access.
 */
export function getAuthContext(request: FastifyRequest): AuthContext {
  const user = getUserForApiKey(extractApiKey(request));
  return { user, isAuthenticated: user !== null };
}
