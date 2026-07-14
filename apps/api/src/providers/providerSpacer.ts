import type { Redis } from 'ioredis';
import { getRedisClient } from '../cache/cacheClient.js';
import { loadConfig } from '../config.js';

export type ProviderName = 'nominatim' | 'overpass';
export type ProviderSpacerMode = 'redis' | 'memory' | 'disabled';

interface MemoryProviderState {
  lastRequestAt: number;
  chain: Promise<void>;
  cooldownUntilMs: number;
  cooldownReason: string | null;
}

const memoryState: Record<ProviderName, MemoryProviderState> = {
  nominatim: {
    lastRequestAt: 0,
    chain: Promise.resolve(),
    cooldownUntilMs: 0,
    cooldownReason: null,
  },
  overpass: {
    lastRequestAt: 0,
    chain: Promise.resolve(),
    cooldownUntilMs: 0,
    cooldownReason: null,
  },
};

let loggedRedisFallback = false;
const loggedSpacerMode = new Set<string>();

function logSpacerModeOnce(
  provider: ProviderName,
  mode: ProviderSpacerMode,
): void {
  const key = `${provider}:${mode}`;
  if (loggedSpacerMode.has(key)) {
    return;
  }
  loggedSpacerMode.add(key);
  console.info(
    JSON.stringify({
      level: 'info',
      event: 'provider_spacer.mode',
      provider,
      mode,
    }),
  );
}

/** Atomic slot claim: returns waitMs before the caller may proceed. */
const SLOT_LUA = `
local slotKey = KEYS[1]
local intervalMs = tonumber(ARGV[1])
local ttlMs = tonumber(ARGV[2])
local time = redis.call('TIME')
local nowMs = (tonumber(time[1]) * 1000) + math.floor(tonumber(time[2]) / 1000)
local nextAllowed = tonumber(redis.call('GET', slotKey) or '0')
local waitMs = math.max(nextAllowed - nowMs, 0)
local newNext = nowMs + waitMs + intervalMs
redis.call('SET', slotKey, tostring(newNext), 'PX', ttlMs)
return waitMs
`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function slotKey(namespace: string, provider: ProviderName): string {
  return `${namespace}:slot:${provider}`;
}

function cooldownKey(namespace: string, provider: ProviderName): string {
  return `${namespace}:cooldown:${provider}`;
}

function isRedisReady(client: Redis | null): client is Redis {
  return client != null && client.status === 'ready';
}

function warnRedisFallback(message: string): void {
  if (loggedRedisFallback) {
    return;
  }
  loggedRedisFallback = true;
  console.warn(`[provider-spacer] ${message}`);
}

function resolveBackend(): {
  mode: 'redis' | 'memory';
  redis: Redis | null;
  namespace: string;
} {
  const config = loadConfig();
  const namespace = config.providerRateLimitNamespace;
  const backend = config.providerRateLimitBackend;
  const redis = getRedisClient();

  if (backend === 'memory') {
    return { mode: 'memory', redis: null, namespace };
  }

  if (backend === 'redis') {
    if (isRedisReady(redis)) {
      return { mode: 'redis', redis, namespace };
    }
    if (config.isProduction) {
      throw new Error(
        'PROVIDER_RATE_LIMIT_BACKEND=redis but Redis is not available',
      );
    }
    warnRedisFallback(
      'PROVIDER_RATE_LIMIT_BACKEND=redis but Redis is not ready; falling back to memory',
    );
    return { mode: 'memory', redis: null, namespace };
  }

  // auto
  if (config.cacheEnabled && isRedisReady(redis)) {
    return { mode: 'redis', redis, namespace };
  }
  return { mode: 'memory', redis: null, namespace };
}

interface CooldownPayload {
  untilMs: number;
  reason: string | null;
}

async function readRedisCooldown(
  redis: Redis,
  namespace: string,
  provider: ProviderName,
): Promise<CooldownPayload | null> {
  try {
    const raw = await redis.get(cooldownKey(namespace, provider));
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as { untilMs?: unknown; reason?: unknown };
      const untilMs = Number(parsed.untilMs);
      if (!Number.isFinite(untilMs)) {
        return null;
      }
      return {
        untilMs,
        reason: typeof parsed.reason === 'string' ? parsed.reason : null,
      };
    } catch {
      const untilMs = Number(raw);
      if (!Number.isFinite(untilMs)) {
        return null;
      }
      return { untilMs, reason: null };
    }
  } catch (error) {
    warnRedisFallback(
      `cooldown read failed: ${error instanceof Error ? error.message : String(error)}; using memory`,
    );
    return null;
  }
}

async function writeRedisCooldown(
  redis: Redis,
  namespace: string,
  provider: ProviderName,
  untilMs: number,
  reason: string | null,
): Promise<void> {
  const ttlMs = Math.max(1, untilMs - Date.now());
  const payload = JSON.stringify({ untilMs, reason });
  await redis.set(cooldownKey(namespace, provider), payload, 'PX', ttlMs);
}

/**
 * Wait until a provider slot is available (min interval + shared cooldown).
 * Returns which backend satisfied the wait.
 */
export async function waitForProviderSlot(
  provider: ProviderName,
  intervalMs: number,
): Promise<ProviderSpacerMode> {
  const interval = Math.max(0, intervalMs);
  const { mode, redis, namespace } = resolveBackend();

  if (mode === 'redis' && redis) {
    try {
      const cooldown = await readRedisCooldown(redis, namespace, provider);
      const now = Date.now();
      if (cooldown && cooldown.untilMs > now) {
        memoryState[provider].cooldownUntilMs = Math.max(
          memoryState[provider].cooldownUntilMs,
          cooldown.untilMs,
        );
        if (cooldown.reason) {
          memoryState[provider].cooldownReason = cooldown.reason;
        }
        await sleep(cooldown.untilMs - now);
      }

      const ttlMs = Math.max(interval * 10, 60_000);
      const waitMsRaw = await redis.eval(
        SLOT_LUA,
        1,
        slotKey(namespace, provider),
        String(interval),
        String(ttlMs),
      );
      const waitMs = Number(waitMsRaw);
      if (Number.isFinite(waitMs) && waitMs > 0) {
        await sleep(waitMs);
      }
      memoryState[provider].lastRequestAt = Date.now();
      logSpacerModeOnce(provider, 'redis');
      return 'redis';
    } catch (error) {
      const config = loadConfig();
      if (config.providerRateLimitBackend === 'redis' && config.isProduction) {
        throw error instanceof Error
          ? error
          : new Error(String(error));
      }
      warnRedisFallback(
        `slot wait failed: ${error instanceof Error ? error.message : String(error)}; falling back to memory`,
      );
    }
  }

  const state = memoryState[provider];
  const run = state.chain.then(async () => {
    const now = Date.now();
    if (state.cooldownUntilMs > now) {
      await sleep(state.cooldownUntilMs - now);
    }
    const wait = Math.max(0, state.lastRequestAt + interval - Date.now());
    if (wait > 0) {
      await sleep(wait);
    }
    state.lastRequestAt = Date.now();
  });
  state.chain = run.then(
    () => undefined,
    () => undefined,
  );
  await run;
  logSpacerModeOnce(provider, 'memory');
  return 'memory';
}

/** Mark a shared provider cooldown after 429/403/provider failure. */
export async function markProviderFailure(
  provider: ProviderName,
  cooldownMs: number,
  reason?: string,
): Promise<void> {
  const duration = Math.max(0, cooldownMs);
  const untilMs = Date.now() + duration;
  const state = memoryState[provider];
  state.cooldownUntilMs = Math.max(state.cooldownUntilMs, untilMs);
  if (reason) {
    state.cooldownReason = reason;
  }

  const { mode, redis, namespace } = resolveBackend();
  if (mode !== 'redis' || !redis || duration === 0) {
    return;
  }

  try {
    const existing = await readRedisCooldown(redis, namespace, provider);
    const sharedUntil = Math.max(untilMs, existing?.untilMs ?? 0);
    state.cooldownUntilMs = Math.max(state.cooldownUntilMs, sharedUntil);
    await writeRedisCooldown(
      redis,
      namespace,
      provider,
      sharedUntil,
      reason ?? existing?.reason ?? null,
    );
  } catch (error) {
    warnRedisFallback(
      `cooldown write failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** Remaining cooldown in ms (0 when inactive). */
export async function getProviderCooldown(
  provider: ProviderName,
): Promise<number> {
  const info = await getProviderCooldownInfo(provider);
  return info.remainingMs;
}

export async function getProviderCooldownInfo(
  provider: ProviderName,
): Promise<{ remainingMs: number; reason: string | null }> {
  const state = memoryState[provider];
  const { mode, redis, namespace } = resolveBackend();

  if (mode === 'redis' && redis) {
    const remote = await readRedisCooldown(redis, namespace, provider);
    if (remote) {
      state.cooldownUntilMs = Math.max(state.cooldownUntilMs, remote.untilMs);
      if (remote.reason) {
        state.cooldownReason = remote.reason;
      }
    }
  }

  const remainingMs = Math.max(0, state.cooldownUntilMs - Date.now());
  if (remainingMs === 0) {
    state.cooldownUntilMs = 0;
    state.cooldownReason = null;
    return { remainingMs: 0, reason: null };
  }
  return { remainingMs, reason: state.cooldownReason };
}

/** Reset spacer state (tests). */
export function resetProviderSpacer(): void {
  for (const provider of Object.keys(memoryState) as ProviderName[]) {
    memoryState[provider] = {
      lastRequestAt: 0,
      chain: Promise.resolve(),
      cooldownUntilMs: 0,
      cooldownReason: null,
    };
  }
  loggedRedisFallback = false;
  loggedSpacerMode.clear();
}
