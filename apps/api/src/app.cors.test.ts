import { describe, expect, it } from 'vitest';
import { parseCorsOrigin } from './app';

describe('parseCorsOrigin', () => {
  it('returns true when unset (reflect / allow any in non-configured mode)', () => {
    expect(parseCorsOrigin(undefined)).toBe(true);
    expect(parseCorsOrigin('')).toBe(true);
    expect(parseCorsOrigin('   ')).toBe(true);
  });

  it('returns a single origin string', () => {
    expect(parseCorsOrigin('https://sitelens-demo.vercel.app')).toBe(
      'https://sitelens-demo.vercel.app',
    );
  });

  it('returns an array for comma-separated origins', () => {
    expect(
      parseCorsOrigin(
        'https://sitelens-demo.vercel.app, http://localhost:5173',
      ),
    ).toEqual([
      'https://sitelens-demo.vercel.app',
      'http://localhost:5173',
    ]);
  });
});
