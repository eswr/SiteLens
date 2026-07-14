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
