import '../loadEnv.js';
import { closeRedisClient, waitForCacheReady } from '../cache/cacheClient.js';
import { loadConfig } from '../config.js';
import { closePool } from '../db/pool.js';
import { processQueuedBuildJobById } from '../externalData/planningContextBuildWorker.js';
import {
  startBoss,
  stopBoss,
  type PlanningContextBuildJobPayload,
} from './bossClient.js';

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.planningContextWorkerMode !== 'pg-boss') {
    console.warn(
      `[planning-context-worker] PLANNING_CONTEXT_WORKER_MODE=${config.planningContextWorkerMode}; expected pg-boss. Starting boss consumer anyway.`,
    );
  }

  void waitForCacheReady();
  const boss = await startBoss();
  const queue = config.pgBossQueuePlanningContext;
  const concurrency = Math.max(1, config.pgBossWorkerConcurrency);
  const pollingIntervalSeconds = Math.max(
    0.25,
    config.pgBossPollIntervalMs / 1000,
  );

  console.log(
    JSON.stringify({
      level: 'info',
      event: 'planning_context_worker.start',
      queue,
      concurrency,
      pollIntervalMs: config.pgBossPollIntervalMs,
      schema: config.pgBossSchema,
    }),
  );

  for (let i = 0; i < concurrency; i += 1) {
    await boss.work(
      queue,
      {
        batchSize: 1,
        pollingIntervalSeconds,
      },
      async (jobs) => {
        for (const job of jobs) {
          const buildJobId = (job.data as PlanningContextBuildJobPayload)
            ?.buildJobId;
          if (!buildJobId) {
            console.warn(
              JSON.stringify({
                level: 'warn',
                event: 'planning_context_worker.invalid_payload',
                pgBossJobId: job.id,
              }),
            );
            continue;
          }
          console.log(
            JSON.stringify({
              level: 'info',
              event: 'planning_context_worker.claim',
              buildJobId,
              pgBossJobId: job.id,
            }),
          );
          await processQueuedBuildJobById(buildJobId);
        }
      },
    );
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      console.log(
        JSON.stringify({
          level: 'info',
          event: 'planning_context_worker.stop',
          signal,
        }),
      );
      void stopBoss()
        .then(() => closeRedisClient())
        .then(() => closePool())
        .finally(() => process.exit(0));
    });
  }
}

void main().catch((error) => {
  console.error(error);
  void stopBoss()
    .then(() => closeRedisClient())
    .then(() => closePool())
    .finally(() => process.exit(1));
});
