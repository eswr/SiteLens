import '../loadEnv.js';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getPool, closePool } from './pool.js';
import { runMigrations } from './migrate.js';
import { SPATIAL_TABLE_DROP_ORDER } from './sql.js';
import { loadConfig } from '../config.js';

/** Drop all app tables (dev only) and re-run migrations. */
export async function resetDatabase(): Promise<void> {
  const config = loadConfig();
  if (config.isProduction) {
    throw new Error('Refusing to reset the database while NODE_ENV=production.');
  }

  const pool = getPool();
  await pool.query(
    `DROP TABLE IF EXISTS ${SPATIAL_TABLE_DROP_ORDER.join(', ')} CASCADE;`,
  );
  console.log('Dropped spatial tables and migration ledger.');

  await runMigrations();
  console.log('Reset complete. Run "npm run ingest:geojson" to reload data.');
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  resetDatabase()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      void closePool().finally(() => process.exit(1));
    });
}
