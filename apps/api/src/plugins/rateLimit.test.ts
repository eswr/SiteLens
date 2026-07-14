import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import Fastify from 'fastify';
import { registerAuth } from '../auth/authPlugin.js';
import { buildApp } from '../app.js';
import * as geocodingService from '../geocoding/geocodingService.js';
import {
  hashRateLimitKey,
  isPrivilegedRateLimitSubject,
  RATE_LIMITS,
  rateLimitKeyGenerator,
  registerRateLimit,
  tieredRateLimitConfig,
} from './rateLimit.js';

describe('rateLimit helpers', () => {
  it('treats planner and admin as privileged', () => {
    expect(
      isPrivilegedRateLimitSubject({
        auth: { user: { role: 'planner' }, isAuthenticated: true },
      } as FastifyRequest),
    ).toBe(true);
    expect(
      isPrivilegedRateLimitSubject({
        auth: { user: { role: 'admin' }, isAuthenticated: true },
      } as FastifyRequest),
    ).toBe(true);
    expect(
      isPrivilegedRateLimitSubject({
        auth: { user: { role: 'viewer' }, isAuthenticated: true },
      } as FastifyRequest),
    ).toBe(false);
    expect(
      isPrivilegedRateLimitSubject({
        auth: { user: null, isAuthenticated: false },
      } as FastifyRequest),
    ).toBe(false);
  });

  it('keys by hashed API key when present, otherwise by IP', () => {
    expect(
      rateLimitKeyGenerator({
        headers: { 'x-api-key': 'demo-planner-key' },
        ip: '1.2.3.4',
      } as FastifyRequest),
    ).toBe(`key:${hashRateLimitKey('demo-planner-key')}`);
    expect(
      rateLimitKeyGenerator({
        headers: {},
        ip: '1.2.3.4',
      } as FastifyRequest),
    ).toBe('ip:1.2.3.4');
  });

  it('does not embed the raw API key in the bucket id', () => {
    const key = rateLimitKeyGenerator({
      headers: { 'x-api-key': 'demo-planner-key' },
      ip: '1.2.3.4',
    } as FastifyRequest);
    expect(key).not.toContain('demo-planner-key');
    expect(key).toMatch(/^key:[0-9a-f]{16}$/);
  });
});

describe('rateLimit plugin (fake route)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    registerAuth(app);
    await registerRateLimit(app);
    app.get(
      '/test-limited',
      { config: tieredRateLimitConfig(RATE_LIMITS.geocodeSearch) },
      async () => ({ ok: true }),
    );
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 after exceeding the free-tier limit', async () => {
    const max = RATE_LIMITS.geocodeSearch.free;
    let lastStatus = 0;
    for (let i = 0; i < max + 1; i += 1) {
      const response = await app.inject({
        method: 'GET',
        url: '/test-limited',
      });
      lastStatus = response.statusCode;
      if (i < max) {
        expect(response.statusCode).toBe(200);
      }
    }
    expect(lastStatus).toBe(429);
  });

  it('allows a higher budget for planner keys', async () => {
    const freeMax = RATE_LIMITS.geocodeSearch.free;
    let statusAfterFreePlusOne = 0;
    for (let i = 0; i < freeMax + 1; i += 1) {
      const response = await app.inject({
        method: 'GET',
        url: '/test-limited',
        headers: { 'x-api-key': 'demo-planner-key' },
      });
      statusAfterFreePlusOne = response.statusCode;
    }
    expect(statusAfterFreePlusOne).not.toBe(429);
    expect(statusAfterFreePlusOne).toBe(200);
  });
});

describe('geocode route rateLimit wiring', () => {
  it('applies free-tier limit headers without calling live Nominatim', async () => {
    const spy = vi.spyOn(geocodingService, 'searchPlaces').mockResolvedValue({
      response: {
        results: [],
        attribution: 'test',
        provider: 'static-demo',
      },
      cache: 'miss',
      computedAt: new Date().toISOString(),
    });

    const app = await buildApp({ enableRateLimit: true });
    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/geocode/search?q=sydney',
      });
      expect(response.statusCode).toBe(200);
      expect(Number(response.headers['x-ratelimit-limit'])).toBe(
        RATE_LIMITS.geocodeSearch.free,
      );
      expect(spy).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
      await app.close();
    }
  });
});
