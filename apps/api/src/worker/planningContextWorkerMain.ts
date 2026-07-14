import '../loadEnv.js';
import { closeRedisClient, waitForCacheReady } from '../cache/cacheClient.js';
import { loadConfig } from '../config.js';
import { closePool } from '../db/pool.js';
import {
  startPlanningContextBuildReconcileLoop,
  stopPlanningContextBuildReconcileLoop,
} from '../externalData/reconcilePlanningContextBuildDispatch.js';
import { processQueuedBuildJobById } from '../externalData/planningContextBuildWorker.js';
import { assertProviderSpacerReady } from '../providers/providerSpacer.js';
import {
  startBoss,
  stopBoss,
  type PlanningContextBuildJobPayload,
} from './bossClient.js';
import {
  startWorkerHeartbeat,
  stopWorkerHeartbeat,
} from './workerHeartbeat.js';

async function main(): Promise<void> {
  const config = loadConfig();
  if (config.planningContextWorkerMode !== 'pg-boss') {
    console.warn(
      `[planning-context-worker] PLANNING_CONTEXT_WORKER_MODE=${config.planningContextWorkerMode}; expected pg-boss. Starting boss consumer anyway.`,
    );
  }

  await waitForCacheReady();
  await assertProviderSpacerReady();

  // Smoke-only: seed a process-local Overpass cooldown before consuming jobs
  // (memory spacer is not shared with the API process). Never honor in production.
  const smokeCooldownMs = Number(
    process.env.SMOKE_SEED_OVERPASS_COOLDOWN_MS ?? '',
  );
  if (Number.isFinite(smokeCooldownMs) && smokeCooldownMs > 0) {
    if (config.isProduction) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          event: 'planning_context_worker.smoke_seed_cooldown_ignored',
          reason: 'SMOKE_SEED_OVERPASS_COOLDOWN_MS is not allowed in production',
          remainingMs: smokeCooldownMs,
        }),
      );
    } else {
      const { markProviderFailure } = await import(
        '../providers/providerSpacer.js'
      );
      await markProviderFailure('overpass', smokeCooldownMs, 'smoke_seed');
      console.log(
        JSON.stringify({
          level: 'info',
          event: 'planning_context_worker.smoke_seed_cooldown',
          remainingMs: smokeCooldownMs,
        }),
      );
    }
  }

  const boss = await startBoss();
  const queue = config.pgBossQueuePlanningContext;
  const concurrency = Math.max(1, config.pgBossWorkerConcurrency);
  const pollingIntervalSeconds = Math.max(
    0.25,
    config.pgBossPollIntervalMs / 1000,
  );

  startWorkerHeartbeat();
  startPlanningContextBuildReconcileLoop();

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
      stopWorkerHeartbeat();
      stopPlanningContextBuildReconcileLoop();
      void stopBoss()
        .then(() => closeRedisClient())
        .then(() => closePool())
        .finally(() => process.exit(0));
    });
  }
}

void main().catch((error) => {
  console.error(error);
  stopWorkerHeartbeat();
  stopPlanningContextBuildReconcileLoop();
  void stopBoss()
    .then(() => closeRedisClient())
    .then(() => closePool())
    .finally(() => process.exit(1));
});
