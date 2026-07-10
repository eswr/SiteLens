import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { BillingPlanId } from '@sitelens/shared';
import { getPool, closePool } from './pool';
import { demoApiKeys } from '../auth/demoUsers';

/** Seed demo accounts + subscriptions matching the demo users' default plans. */
export async function seedBilling(): Promise<number> {
  const pool = getPool();
  const users = Object.values(demoApiKeys);
  const client = await pool.connect();
  try {
    for (const user of users) {
      await client.query(
        `INSERT INTO demo_accounts (id, user_id, name, role)
         VALUES ($1, $1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, updated_at = now()`,
        [user.id, user.name, user.role],
      );
      const plan: BillingPlanId = user.plan;
      await client.query(
        `INSERT INTO subscriptions (account_id, plan, status)
         VALUES ($1, $2, 'active')
         ON CONFLICT (account_id)
           DO UPDATE SET plan = EXCLUDED.plan, status = 'active', updated_at = now()`,
        [user.id, plan],
      );
    }
    return users.length;
  } finally {
    client.release();
  }
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  seedBilling()
    .then((count) => {
      console.log(`Seeded billing for ${count} demo account(s).`);
      return closePool();
    })
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      void closePool().finally(() => process.exit(1));
    });
}
