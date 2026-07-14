import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { extractApiKeyHeader } from '../auth/getAuthContext.js';

/** Whether the request should get the loftier planner/admin bucket. */
export function isPrivilegedRateLimitSubject(request: FastifyRequest): boolean {
  const role = request.auth?.user?.role;
  return role === 'planner' || role === 'admin';
}

/** Short SHA-256 digest so raw API keys never appear in rate-limit storage. */
export function hashRateLimitKey(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

/**
 * Prefer API key (when present) so demo roles share a stable bucket; else IP.
 * Keys are hashed — never store the raw secret in the in-memory limiter.
 */
export function rateLimitKeyGenerator(request: FastifyRequest): string {
  const apiKey = extractApiKeyHeader(request);
  if (apiKey) {
    return `key:${hashRateLimitKey(apiKey)}`;
  }
  return `ip:${request.ip}`;
}

export interface TieredRateLimit {
  /** Anonymous / viewer / free-plan keys. */
  free: number;
  /** Planner and admin demo keys. */
  privileged: number;
  timeWindow?: string | number;
}

/** Route `config` snippet with a tiered max for `@fastify/rate-limit`. */
export function tieredRateLimitConfig(limits: TieredRateLimit): {
  rateLimit: {
    max: (request: FastifyRequest) => number;
    timeWindow: string | number;
  };
} {
  return {
    rateLimit: {
      max: (request) =>
        isPrivilegedRateLimitSubject(request)
          ? limits.privileged
          : limits.free,
      timeWindow: limits.timeWindow ?? '1 minute',
    },
  };
}

/** Fixed max (same for all callers) — e.g. demo-plan / webhook. */
export function fixedRateLimitConfig(
  max: number,
  timeWindow: string | number = '1 minute',
): { rateLimit: { max: number; timeWindow: string | number } } {
  return { rateLimit: { max, timeWindow } };
}

/** Sensitive-route presets used across the API. */
export const RATE_LIMITS = {
  geocodeSearch: { free: 20, privileged: 60 },
  planningContextBuild: { free: 5, privileged: 20 },
  analyzeArea: { free: 30, privileged: 120 },
  planningSummary: { free: 30, privileged: 120 },
  demoPlan: 10,
  billingWebhook: 60,
} as const;

export interface RegisterRateLimitOptions {
  /** Soft global ceiling for all routes. */
  globalMax?: number;
}

/** Register `@fastify/rate-limit` with API-key-aware key generation. */
export async function registerRateLimit(
  app: FastifyInstance,
  options: RegisterRateLimitOptions = {},
): Promise<void> {
  await app.register(rateLimit, {
    global: true,
    max: options.globalMax ?? 200,
    timeWindow: '1 minute',
    keyGenerator: rateLimitKeyGenerator,
    addHeadersOnExceeding: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
    },
    addHeaders: {
      'x-ratelimit-limit': true,
      'x-ratelimit-remaining': true,
      'x-ratelimit-reset': true,
      'retry-after': true,
    },
  });
}
