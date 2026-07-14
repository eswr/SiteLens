import type { FastifyRequest } from 'fastify';

/** An error carrying an HTTP status + API error code for the error handler. */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/** Throw `401` if the request is not authenticated. */
export function requireAuthenticated(request: FastifyRequest): void {
  if (!request.auth?.isAuthenticated) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Authentication is required.');
  }
}

/** Throw `401`/`403` unless the caller is an authenticated admin demo user. */
export function requireAdmin(request: FastifyRequest): void {
  requireAuthenticated(request);
  if (request.auth.user?.role !== 'admin') {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'Admin access is required for this endpoint.',
    );
  }
}
