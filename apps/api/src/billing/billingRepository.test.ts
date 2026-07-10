import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getBillingContextForUser,
  getUsage,
  recordUsage,
  setDemoPlanForUser,
} from './billingRepository';
import { seedBilling } from '../db/seedBilling';
import { closePool } from '../db/pool';

// Live billing DB tests. Skipped unless RUN_DB_TESTS=true (needs migrated DB).
const runDbTests = process.env.RUN_DB_TESTS === 'true';

describe.skipIf(!runDbTests)('billingRepository (integration)', () => {
  beforeAll(async () => {
    await seedBilling();
  });

  afterAll(async () => {
    // Restore the planner default so other runs stay deterministic.
    await setDemoPlanForUser('user_planner', 'pro');
    await closePool();
  });

  it('returns the seeded plan for a demo user', async () => {
    const context = await getBillingContextForUser('user_planner');
    expect(context.plan.id).toBe('pro');
    expect(context.features).toContain('analysis:run');
  });

  it('updates the demo plan', async () => {
    const updated = await setDemoPlanForUser('user_viewer', 'pro');
    expect(updated.plan.id).toBe('pro');
    const reread = await getBillingContextForUser('user_viewer');
    expect(reread.plan.id).toBe('pro');
    // Reset viewer back to free.
    await setDemoPlanForUser('user_viewer', 'free');
  });

  it('records and reads usage', async () => {
    const before = await getUsage('user_planner', 'analysis:run');
    await recordUsage('user_planner', 'analysis:run');
    const after = await getUsage('user_planner', 'analysis:run');
    expect(after).toBe(before + 1);
  });
});
