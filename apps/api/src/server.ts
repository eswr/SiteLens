import 'dotenv/config';
import { buildApp } from './app';
import { loadConfig } from './config';
import { closePool } from './db/pool';
import { closeRedisClient, waitForCacheReady } from './cache/cacheClient';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({
    webOrigin: config.webOrigin,
    isProduction: config.isProduction,
  });

  try {
    await app.listen({ port: config.port, host: '0.0.0.0' });
    // Eagerly connect the cache so the first request doesn't race the handshake.
    void waitForCacheReady();
    console.log(
      `sitelens-api listening on http://0.0.0.0:${config.port} (${config.nodeEnv})`,
    );
  } catch (error) {
    console.error(error);
    await closePool();
    process.exit(1);
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      void app
        .close()
        .then(() => closeRedisClient())
        .then(() => closePool())
        .finally(() => process.exit(0));
    });
  }
}

void main();
