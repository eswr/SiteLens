import { describe, expect, it } from 'vitest';
import { parseCorsOrigin, VERCEL_PREVIEW_ORIGIN_RE } from './app.js';

describe('parseCorsOrigin', () => {
  it('returns true when unset (reflect / allow any in non-configured mode)', () => {
    expect(parseCorsOrigin(undefined)).toBe(true);
    expect(parseCorsOrigin('')).toBe(true);
    expect(parseCorsOrigin('   ')).toBe(true);
  });

  it('returns exact origins plus the Vercel preview pattern', () => {
    expect(parseCorsOrigin('https://sitelens-demo.vercel.app')).toEqual([
      'https://sitelens-demo.vercel.app',
      VERCEL_PREVIEW_ORIGIN_RE,
    ]);
  });

  it('returns an array for comma-separated origins plus the preview pattern', () => {
    expect(
      parseCorsOrigin(
        'https://sitelens-demo.vercel.app, http://localhost:5173',
      ),
    ).toEqual([
      'https://sitelens-demo.vercel.app',
      'http://localhost:5173',
      VERCEL_PREVIEW_ORIGIN_RE,
    ]);
  });
});

describe('VERCEL_PREVIEW_ORIGIN_RE', () => {
  it('matches SiteLens project preview hosts', () => {
    expect(
      VERCEL_PREVIEW_ORIGIN_RE.test(
        'https://sitelens-k5dk4dxqa-easwarendra-kokas-projects.vercel.app',
      ),
    ).toBe(true);
  });

  it('rejects production alias, other Vercel apps, and malformed hosts', () => {
    expect(
      VERCEL_PREVIEW_ORIGIN_RE.test('https://sitelens-demo.vercel.app'),
    ).toBe(false);
    expect(
      VERCEL_PREVIEW_ORIGIN_RE.test(
        'https://other-k5dk4dxqa-easwarendra-kokas-projects.vercel.app',
      ),
    ).toBe(false);
    expect(
      VERCEL_PREVIEW_ORIGIN_RE.test(
        'https://sitelens--easwarendra-kokas-projects.vercel.app',
      ),
    ).toBe(false);
    expect(
      VERCEL_PREVIEW_ORIGIN_RE.test(
        'http://sitelens-k5dk4dxqa-easwarendra-kokas-projects.vercel.app',
      ),
    ).toBe(false);
    expect(
      VERCEL_PREVIEW_ORIGIN_RE.test(
        'https://sitelens-k5dk4dxqa-easwarendra-kokas-projects.vercel.app.evil.com',
      ),
    ).toBe(false);
  });
});
