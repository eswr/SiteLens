import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { getPool, closePool } from './pool';

const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../db/migrations/', import.meta.url),
);

/** Apply pending SQL migrations in filename order, each in a transaction. */
export async function runMigrations(): Promise<void> {
  const pool = getPool();

  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     );`,
  );

  const files = (await readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const appliedResult = await pool.query<{ version: string }>(
    'SELECT version FROM schema_migrations',
  );
  const applied = new Set(appliedResult.rows.map((row) => row.version));

  let appliedCount = 0;
  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip     ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [
        file,
      ]);
      await client.query('COMMIT');
      appliedCount += 1;
      console.log(`applied  ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw new Error(
        `Migration failed: ${file}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      client.release();
    }
  }

  console.log(
    `Migrations complete: applied ${appliedCount}, total ${files.length}.`,
  );
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  runMigrations()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      void closePool().finally(() => process.exit(1));
    });
}
