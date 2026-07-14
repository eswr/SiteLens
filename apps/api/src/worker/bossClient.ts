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
  const queue = loadConfig().pgBossQueuePlanningContext;
  await boss.createQueue(queue);
  queueReady = true;
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

/** Enqueue a ledger job id for the external worker (API process). */
export async function enqueuePlanningContextBuildJob(
  buildJobId: string,
): Promise<string | null> {
  const active = started && boss ? boss : await startBoss();
  const queue = loadConfig().pgBossQueuePlanningContext;
  if (!queueReady) {
    await active.createQueue(queue);
    queueReady = true;
  }
  const payload: PlanningContextBuildJobPayload = { buildJobId };
  // Dedup repeated enqueue/nudge paths for the same ledger job.
  return active.send(queue, payload, { singletonKey: buildJobId });
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
