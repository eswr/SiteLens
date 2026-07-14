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
  geocodingEnabled: boolean;
  nominatimBaseUrl: string;
  nominatimUserAgent: string;
  geocodingMinIntervalMs: number;
  geocodingCacheTtlSeconds: number;
  /** Bundled static places when live Nominatim is blocked/unavailable. */
  geocodingStaticFallbackEnabled: boolean;
  /** After 403/429/outage, skip Nominatim for this long (process-local). */
  geocodingUpstreamErrorCooldownMs: number;
  /** TTL for cached static-demo place-search responses. */
  geocodingStaticFallbackTtlSeconds: number;
  overpassEnabled: boolean;
  overpassBaseUrl: string;
  overpassUserAgent: string;
  overpassTimeoutMs: number;
  overpassMinIntervalMs: number;
  externalContextCacheTtlSeconds: number;
  externalContextMaxBboxAreaDeg2: number;
  externalContextRebuildAfterDays: number;
  externalContextSyntheticFallbackEnabled: boolean;
  /** In-process planning-context build worker (demo queue). */
  planningContextWorkerEnabled: boolean;
  planningContextWorkerPollMs: number;
  /** Lease duration while a job is running (ms). */
  planningContextJobLockMs: number;
  /**
   * How often a long-running build extends its lease (ms).
   * `0` disables heartbeat; default is roughly lockMs / 3.
   */
  planningContextJobHeartbeatMs: number;
  /** Max claim/reclaim attempts before the job is marked failed. */
  planningContextJobMaxAttempts: number;
}

/** Default (placeholder) Nominatim User-Agent; must be replaced for production. */
export const DEFAULT_NOMINATIM_USER_AGENT =
  'SiteLens/0.1 (portfolio-demo; contact: replace-with-your-email@example.com)';

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

  const geocodingEnabled =
    (process.env.GEOCODING_ENABLED ?? 'true').toLowerCase() !== 'false';
  const nominatimBaseUrl = (
    process.env.NOMINATIM_BASE_URL ?? 'https://nominatim.openstreetmap.org'
  ).replace(/\/+$/, '');
  const nominatimUserAgent = (
    process.env.NOMINATIM_USER_AGENT ?? DEFAULT_NOMINATIM_USER_AGENT
  ).trim();
  const parsedInterval = Number(process.env.GEOCODING_MIN_INTERVAL_MS);
  const geocodingMinIntervalMs =
    Number.isFinite(parsedInterval) && parsedInterval >= 0
      ? parsedInterval
      : 1100;
  const parsedGeoTtl = Number(process.env.GEOCODING_CACHE_TTL_SECONDS);
  const geocodingCacheTtlSeconds =
    Number.isFinite(parsedGeoTtl) && parsedGeoTtl > 0 ? parsedGeoTtl : 86400;

  const isProduction = nodeEnv === 'production';
  // Dev/demo: static fallback on by default. Production: opt-in only.
  const geocodingStaticFallbackEnabled = isProduction
    ? (process.env.GEOCODING_STATIC_FALLBACK_ENABLED ?? 'false').toLowerCase() ===
      'true'
    : (process.env.GEOCODING_STATIC_FALLBACK_ENABLED ?? 'true').toLowerCase() !==
      'false';
  const parsedCooldown = Number(process.env.GEOCODING_UPSTREAM_ERROR_COOLDOWN_MS);
  const geocodingUpstreamErrorCooldownMs =
    Number.isFinite(parsedCooldown) && parsedCooldown >= 0
      ? parsedCooldown
      : 900_000;
  const parsedFallbackTtl = Number(
    process.env.GEOCODING_STATIC_FALLBACK_TTL_SECONDS,
  );
  const geocodingStaticFallbackTtlSeconds =
    Number.isFinite(parsedFallbackTtl) && parsedFallbackTtl > 0
      ? parsedFallbackTtl
      : 3600;

  const overpassEnabled =
    (process.env.OVERPASS_ENABLED ?? 'true').toLowerCase() !== 'false';
  const overpassBaseUrl = (
    process.env.OVERPASS_BASE_URL ??
    'https://overpass-api.de/api/interpreter'
  ).replace(/\/+$/, '');
  const overpassUserAgent = (
    process.env.OVERPASS_USER_AGENT ?? DEFAULT_NOMINATIM_USER_AGENT
  ).trim();
  const parsedOverpassTimeout = Number(process.env.OVERPASS_TIMEOUT_MS);
  const overpassTimeoutMs =
    Number.isFinite(parsedOverpassTimeout) && parsedOverpassTimeout > 0
      ? parsedOverpassTimeout
      : 15_000;
  const parsedOverpassInterval = Number(process.env.OVERPASS_MIN_INTERVAL_MS);
  const overpassMinIntervalMs =
    Number.isFinite(parsedOverpassInterval) && parsedOverpassInterval >= 0
      ? parsedOverpassInterval
      : 2500;
  const parsedCtxTtl = Number(process.env.EXTERNAL_CONTEXT_CACHE_TTL_SECONDS);
  const externalContextCacheTtlSeconds =
    Number.isFinite(parsedCtxTtl) && parsedCtxTtl > 0 ? parsedCtxTtl : 604_800;
  const parsedMaxArea = Number(process.env.EXTERNAL_CONTEXT_MAX_BBOX_AREA_DEG2);
  const externalContextMaxBboxAreaDeg2 =
    Number.isFinite(parsedMaxArea) && parsedMaxArea > 0 ? parsedMaxArea : 0.01;
  const parsedRebuildDays = Number(process.env.EXTERNAL_CONTEXT_REBUILD_AFTER_DAYS);
  const externalContextRebuildAfterDays =
    Number.isFinite(parsedRebuildDays) && parsedRebuildDays > 0
      ? parsedRebuildDays
      : 7;
  const externalContextSyntheticFallbackEnabled =
    (process.env.EXTERNAL_CONTEXT_SYNTHETIC_FALLBACK_ENABLED ?? 'false')
      .toLowerCase() === 'true';

  const planningContextWorkerEnabled =
    (process.env.PLANNING_CONTEXT_WORKER_ENABLED ?? 'true').toLowerCase() !==
    'false';
  const parsedWorkerPoll = Number(process.env.PLANNING_CONTEXT_WORKER_POLL_MS);
  const planningContextWorkerPollMs =
    Number.isFinite(parsedWorkerPoll) && parsedWorkerPoll > 0
      ? parsedWorkerPoll
      : 750;
  const parsedJobLock = Number(process.env.PLANNING_CONTEXT_JOB_LOCK_MS);
  const planningContextJobLockMs =
    Number.isFinite(parsedJobLock) && parsedJobLock > 0
      ? parsedJobLock
      : 300_000;
  const parsedJobHeartbeat = Number(
    process.env.PLANNING_CONTEXT_JOB_HEARTBEAT_MS,
  );
  const planningContextJobHeartbeatMs = Number.isFinite(parsedJobHeartbeat)
    ? Math.max(0, Math.floor(parsedJobHeartbeat))
    : Math.max(1_000, Math.floor(planningContextJobLockMs / 3));
  const parsedJobMaxAttempts = Number(
    process.env.PLANNING_CONTEXT_JOB_MAX_ATTEMPTS,
  );
  const planningContextJobMaxAttempts =
    Number.isFinite(parsedJobMaxAttempts) && parsedJobMaxAttempts > 0
      ? Math.floor(parsedJobMaxAttempts)
      : 3;

  return {
    port,
    nodeEnv,
    webOrigin,
    isProduction,
    databaseUrl,
    dbSsl,
    redisUrl,
    cacheEnabled,
    cacheDefaultTtlSeconds,
    stripeSecretKey,
    stripeWebhookSecret,
    enableDemoBilling,
    geocodingEnabled,
    nominatimBaseUrl,
    nominatimUserAgent,
    geocodingMinIntervalMs,
    geocodingCacheTtlSeconds,
    geocodingStaticFallbackEnabled,
    geocodingUpstreamErrorCooldownMs,
    geocodingStaticFallbackTtlSeconds,
    overpassEnabled,
    overpassBaseUrl,
    overpassUserAgent,
    overpassTimeoutMs,
    overpassMinIntervalMs,
    externalContextCacheTtlSeconds,
    externalContextMaxBboxAreaDeg2,
    externalContextRebuildAfterDays,
    externalContextSyntheticFallbackEnabled,
    planningContextWorkerEnabled,
    planningContextWorkerPollMs,
    planningContextJobLockMs,
    planningContextJobHeartbeatMs,
    planningContextJobMaxAttempts,
  };
}
