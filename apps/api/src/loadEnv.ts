import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

/**
 * Load apps/api env files:
 * - production → `.env.production` (optional; Fly usually uses secrets)
 * - otherwise → `.env.local`, then fallback `.env` for older checkouts
 *
 * Override with `DOTENV_CONFIG_PATH` or `APP_ENV=production|development`.
 */
export function loadEnv(): void {
  if (process.env.DOTENV_CONFIG_PATH) {
    loadDotenv({ path: process.env.DOTENV_CONFIG_PATH, override: false });
    return;
  }

  const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const appEnv = (
    process.env.APP_ENV ??
    process.env.NODE_ENV ??
    'development'
  ).toLowerCase();

  const preferred =
    appEnv === 'production'
      ? resolve(apiRoot, '.env.production')
      : resolve(apiRoot, '.env.local');
  const legacy = resolve(apiRoot, '.env');

  if (existsSync(preferred)) {
    loadDotenv({ path: preferred, override: false });
    return;
  }

  if (existsSync(legacy)) {
    loadDotenv({ path: legacy, override: false });
  }
}

loadEnv();
