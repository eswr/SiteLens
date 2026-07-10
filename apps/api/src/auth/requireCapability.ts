import type { FastifyRequest } from 'fastify';
import type { CapabilityFlags } from '@sitelens/shared';
import { getCapabilities } from './capabilities';

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

const CAPABILITY_MESSAGES: Partial<Record<keyof CapabilityFlags, string>> = {
  canRunAnalysis:
    'This capability requires a planner or enterprise account.',
  canGenerateSummary:
    'This capability requires a planner or enterprise account.',
  canIngestData: 'This capability requires an admin account.',
  canViewAllLayers:
    'Full data access requires a planner or enterprise account.',
};

/** Throw `403` if the request lacks the given capability. */
export function requireCapability(
  request: FastifyRequest,
  capability: keyof CapabilityFlags,
): void {
  const capabilities = getCapabilities(request.auth?.user ?? null);
  if (!capabilities[capability]) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      CAPABILITY_MESSAGES[capability] ??
        'You do not have access to this capability.',
    );
  }
}
