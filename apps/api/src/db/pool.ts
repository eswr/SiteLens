import { Pool } from 'pg';
import type { Pool as PgPool } from 'pg';
import { loadConfig } from '../config';

let pool: PgPool | null = null;

/** Get the shared pg Pool, creating it on first use. */
export function getPool(): PgPool {
  if (!pool) {
    const config = loadConfig();
    pool = new Pool({
      connectionString: config.databaseUrl,
      max: 10,
      ssl: config.dbSsl ? { rejectUnauthorized: false } : undefined,
    });
  }
  return pool;
}

/** Close the pool (for graceful shutdown and tests). */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
