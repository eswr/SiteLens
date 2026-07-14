import PgBoss from 'pg-boss';
import { loadConfig } from '../config.js';

export interface PlanningContextBuildJobPayload {
  buildJobId: string;
}

let boss: PgBoss | null = null;
let started = false;
let queueReady = false;

export function createBoss(): PgBoss {
  const config = loadConfig();
  return new PgBoss({
    connectionString: config.databaseUrl,
    schema: config.pgBossSchema,
    ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined,
  });
}

/**
 * Ensure the planning-context queue uses `short` policy so `singletonKey`
 * uniquely constrains `created` jobs (standard policy does not).
 */
async function ensurePlanningContextQueue(active: PgBoss): Promise<string> {
  const queue = loadConfig().pgBossQueuePlanningContext;
  // pg-boss types require `name` on Queue options even when passed as arg 1.
  const options = { name: queue, policy: 'short' as const };
  await active.createQueue(queue, options);
  // createQueue is insert-if-missing; update policy on existing demos/DBs.
  await active.updateQueue(queue, options);
  queueReady = true;
  return queue;
}

/** Start pg-boss (idempotent). Creates the planning-context queue. */
export async function startBoss(instance?: PgBoss): Promise<PgBoss> {
  if (boss && started) {
    return boss;
  }
  boss = instance ?? createBoss();
  boss.on('error', (error) => {
    console.warn(
      '[pg-boss]',
      error instanceof Error ? error.message : String(error),
    );
  });
  await boss.start();
  started = true;
  await ensurePlanningContextQueue(boss);
  return boss;
}

export async function stopBoss(): Promise<void> {
  if (!boss) {
    return;
  }
  try {
    await boss.stop({ graceful: true, timeout: 10_000 });
  } catch {
    // Ignore shutdown races.
  }
  boss = null;
  started = false;
  queueReady = false;
}

export function getBoss(): PgBoss | null {
  return boss;
}

export interface EnqueuePlanningContextBuildJobOptions {
  /** Delay before the job becomes eligible (seconds, ISO date, or Date). */
  startAfter?: number | string | Date;
}

/** Enqueue a ledger job id for the external worker (API process). */
export async function enqueuePlanningContextBuildJob(
  buildJobId: string,
  options?: EnqueuePlanningContextBuildJobOptions,
): Promise<string | null> {
  const active = started && boss ? boss : await startBoss();
  const queue = queueReady
    ? loadConfig().pgBossQueuePlanningContext
    : await ensurePlanningContextQueue(active);
  const payload: PlanningContextBuildJobPayload = { buildJobId };
  // With queue policy `short`, singletonKey uniquely constrains `created` rows.
  // send() returns null when a created job for this key already exists.
  return active.send(queue, payload, {
    singletonKey: buildJobId,
    ...(options?.startAfter != null ? { startAfter: options.startAfter } : {}),
  });
}

/** Best-effort queue depths for health (from a started boss instance). */
export async function getPgBossQueueStats(): Promise<{
  pending: number;
  active: number;
  retry: number;
  failed: number;
} | null> {
  if (!boss || !started) {
    return null;
  }
  const queue = loadConfig().pgBossQueuePlanningContext;
  try {
    const [createdAndRetry, throughActive] = await Promise.all([
      boss.getQueueSize(queue),
      boss.getQueueSize(queue, { before: 'completed' }),
    ]);
    const pending = createdAndRetry;
    const active = Math.max(0, throughActive - createdAndRetry);
    return { pending, active, retry: 0, failed: 0 };
  } catch {
    return null;
  }
}
