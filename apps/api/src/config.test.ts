import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig, resolveWebOrigin } from './config.js';

describe('resolveWebOrigin', () => {
  it('defaults to local Vite when unset outside production', () => {
    expect(resolveWebOrigin('development', undefined)).toBe(
      'http://localhost:5173',
    );
    expect(resolveWebOrigin('development', '')).toBe('http://localhost:5173');
    expect(resolveWebOrigin('test', '   ')).toBe('http://localhost:5173');
  });

  it('uses the provided origin outside production', () => {
    expect(resolveWebOrigin('development', 'http://localhost:5174')).toBe(
      'http://localhost:5174',
    );
  });

  it('throws in production when WEB_ORIGIN is missing or blank', () => {
    expect(() => resolveWebOrigin('production', undefined)).toThrow(
      'WEB_ORIGIN is required in production',
    );
    expect(() => resolveWebOrigin('production', '')).toThrow(
      'WEB_ORIGIN is required in production',
    );
    expect(() => resolveWebOrigin('production', '   ')).toThrow(
      'WEB_ORIGIN is required in production',
    );
  });

  it('returns the trimmed origin in production', () => {
    expect(
      resolveWebOrigin('production', ' https://sitelens-demo.vercel.app '),
    ).toBe('https://sitelens-demo.vercel.app');
  });
});

describe('loadConfig WEB_ORIGIN', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalWebOrigin = process.env.WEB_ORIGIN;

  afterEach(() => {
    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }
    if (originalWebOrigin === undefined) {
      delete process.env.WEB_ORIGIN;
    } else {
      process.env.WEB_ORIGIN = originalWebOrigin;
    }
  });

  it('fails closed when NODE_ENV=production and WEB_ORIGIN is unset', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.WEB_ORIGIN;
    expect(() => loadConfig()).toThrow('WEB_ORIGIN is required in production');
  });
});

describe('loadConfig provider rate limits', () => {
  const keys = [
    'PROVIDER_RATE_LIMIT_BACKEND',
    'PROVIDER_COOLDOWN_TTL_MS',
    'PROVIDER_RATE_LIMIT_NAMESPACE',
    'EXTERNAL_CONTEXT_REBUILD_AFTER_DAYS',
    'NODE_ENV',
    'WEB_ORIGIN',
  ] as const;
  const originals = Object.fromEntries(
    keys.map((key) => [key, process.env[key]]),
  );

  afterEach(() => {
    for (const key of keys) {
      const value = originals[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('defaults provider spacer settings for demo-safe local use', () => {
    delete process.env.PROVIDER_RATE_LIMIT_BACKEND;
    delete process.env.PROVIDER_COOLDOWN_TTL_MS;
    delete process.env.PROVIDER_RATE_LIMIT_NAMESPACE;
    process.env.NODE_ENV = 'development';
    delete process.env.WEB_ORIGIN;
    const config = loadConfig();
    expect(config.providerRateLimitBackend).toBe('auto');
    expect(config.providerCooldownTtlMs).toBe(60_000);
    expect(config.providerRateLimitNamespace).toBe(
      'sitelens:provider-limits:v1',
    );
  });

  it('accepts explicit redis/memory backends', () => {
    process.env.NODE_ENV = 'development';
    process.env.PROVIDER_RATE_LIMIT_BACKEND = 'redis';
    expect(loadConfig().providerRateLimitBackend).toBe('redis');
    process.env.PROVIDER_RATE_LIMIT_BACKEND = 'memory';
    expect(loadConfig().providerRateLimitBackend).toBe('memory');
  });

  it('allows EXTERNAL_CONTEXT_REBUILD_AFTER_DAYS=0 to force rebuilds', () => {
    process.env.NODE_ENV = 'development';
    process.env.EXTERNAL_CONTEXT_REBUILD_AFTER_DAYS = '0';
    expect(loadConfig().externalContextRebuildAfterDays).toBe(0);
  });
});
