import './loadEnv.js';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { closePool } from './db/pool.js';
import { closeRedisClient, waitForCacheReady } from './cache/cacheClient.js';
import {
  startPlanningContextBuildWorker,
  stopPlanningContextBuildWorker,
} from './externalData/planningContextBuildWorker.js';
import { assertProviderSpacerReady } from './providers/providerSpacer.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({
    webOrigin: config.webOrigin,
    isProduction: config.isProduction,
  });

  try {
    // Eager cache connect + fail-fast when production requires Redis spacer.
    await waitForCacheReady();
    await assertProviderSpacerReady();
    await app.listen({ port: config.port, host: '0.0.0.0' });
    if (config.planningContextWorkerMode === 'in-process') {
      startPlanningContextBuildWorker(config.planningContextWorkerPollMs);
    }
    console.log(
      `sitelens-api listening on http://0.0.0.0:${config.port} (${config.nodeEnv}, worker=${config.planningContextWorkerMode})`,
    );
  } catch (error) {
    console.error(error);
    stopPlanningContextBuildWorker();
    await closePool();
    process.exit(1);
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      stopPlanningContextBuildWorker();
      void app
        .close()
        .then(() => closeRedisClient())
        .then(() => closePool())
        .finally(() => process.exit(0));
    });
  }
}

void main();
