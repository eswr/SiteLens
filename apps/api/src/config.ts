/** API version reported by the health endpoints. */
export const API_VERSION = '0.1.0';

export interface AppConfig {
  port: number;
  nodeEnv: string;
  webOrigin: string;
  isProduction: boolean;
  databaseUrl: string;
  dbSsl: boolean;
  redisUrl: string;
  cacheEnabled: boolean;
  cacheDefaultTtlSeconds: number;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  enableDemoBilling: boolean;
}

const DEFAULT_DATABASE_URL =
  'postgres://sitelens:sitelens@localhost:54329/sitelens';
const DEFAULT_CACHE_TTL_SECONDS = 300;

/** Read runtime configuration from the environment, with safe defaults. */
export function loadConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV ?? 'development';
  const parsedPort = Number(process.env.PORT);
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 4000;
  const webOrigin = process.env.WEB_ORIGIN ?? 'http://localhost:5173';
  const databaseUrl = process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const dbSsl = (process.env.DB_SSL ?? 'false').toLowerCase() === 'true';

  const redisUrl = (process.env.REDIS_URL ?? '').trim();
  // Caching requires a Redis URL and is on by default unless explicitly disabled.
  const cacheEnabled =
    redisUrl.length > 0 &&
    (process.env.CACHE_ENABLED ?? 'true').toLowerCase() !== 'false';
  const parsedTtl = Number(process.env.CACHE_DEFAULT_TTL_SECONDS);
  const cacheDefaultTtlSeconds =
    Number.isFinite(parsedTtl) && parsedTtl > 0
      ? parsedTtl
      : DEFAULT_CACHE_TTL_SECONDS;

  const stripeSecretKey = (process.env.STRIPE_SECRET_KEY ?? '').trim();
  const stripeWebhookSecret = (process.env.STRIPE_WEBHOOK_SECRET ?? '').trim();
  // Demo plan switching is on by default in dev; must be opted-in for prod.
  const enableDemoBilling =
    (process.env.ENABLE_DEMO_BILLING ?? 'true').toLowerCase() === 'true';

  return {
    port,
    nodeEnv,
    webOrigin,
    isProduction: nodeEnv === 'production',
    databaseUrl,
    dbSsl,
    redisUrl,
    cacheEnabled,
    cacheDefaultTtlSeconds,
    stripeSecretKey,
    stripeWebhookSecret,
    enableDemoBilling,
  };
}
