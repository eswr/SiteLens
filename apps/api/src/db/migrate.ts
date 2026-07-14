import '../loadEnv.js';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import type { PoolClient } from 'pg';
import { getPool, closePool } from './pool.js';

const MIGRATIONS_DIR = fileURLToPath(
  new URL('../../db/migrations/', import.meta.url),
);

/** Fixed session advisory-lock key so only one migrator runs at a time. */
export const MIGRATION_LOCK_KEY = 872_514_001;

/** Statements that cannot run inside a PostgreSQL transaction block. */
const NON_TRANSACTIONAL_RE =
  /^\s*(CREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY|DROP\s+INDEX\s+CONCURRENTLY|REINDEX\b|VACUUM\b|CLUSTER\b)/im;

export type MigrationFile = {
  filename: string;
  sql: string;
  checksum: string;
};

export type AppliedMigration = {
  filename: string;
  checksum: string | null;
  applied_at: Date;
};

/** SHA-256 hex digest of migration SQL (normalized to LF newlines). */
export function checksumMigration(sql: string): string {
  const normalized = sql.replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized, 'utf8').digest('hex');
}

/** True when the migration SQL can safely run inside BEGIN/COMMIT. */
export function isTransactionalMigration(sql: string): boolean {
  return !NON_TRANSACTIONAL_RE.test(sql);
}

async function listMigrationFiles(): Promise<MigrationFile[]> {
  const names = (await readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  return Promise.all(
    names.map(async (filename) => {
      const sql = await readFile(path.join(MIGRATIONS_DIR, filename), 'utf8');
      return { filename, sql, checksum: checksumMigration(sql) };
    }),
  );
}

/**
 * Ensure the ledger has filename + checksum + applied_at.
 * Renames legacy `version` → `filename` when upgrading older DBs.
 */
async function ensureSchemaMigrations(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      checksum TEXT,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Legacy ledger used `version` as the migration filename PK.
  const legacy = await client.query<{ column_name: string }>(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'schema_migrations'
        AND column_name IN ('version', 'filename')`,
  );
  const cols = new Set(legacy.rows.map((row) => row.column_name));
  if (cols.has('version') && !cols.has('filename')) {
    await client.query(
      `ALTER TABLE schema_migrations RENAME COLUMN version TO filename`,
    );
  }

  await client.query(`
    ALTER TABLE schema_migrations
      ADD COLUMN IF NOT EXISTS checksum TEXT;
  `);
  await client.query(`
    ALTER TABLE schema_migrations
      ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ NOT NULL DEFAULT now();
  `);
}

async function loadApplied(
  client: PoolClient,
): Promise<Map<string, AppliedMigration>> {
  const result = await client.query<AppliedMigration>(
    `SELECT filename, checksum, applied_at FROM schema_migrations`,
  );
  return new Map(result.rows.map((row) => [row.filename, row]));
}

/**
 * Verify already-applied migration files still match stored checksums.
 * Backfills NULL checksums when `backfillMissing` is true (migrate path).
 */
export async function verifyAppliedChecksums(
  client: PoolClient,
  files: MigrationFile[],
  applied: Map<string, AppliedMigration>,
  options: { backfillMissing: boolean },
): Promise<void> {
  const byFilename = new Map(files.map((file) => [file.filename, file]));

  for (const [filename, row] of applied) {
    const file = byFilename.get(filename);
    if (!file) {
      throw new Error(
        `Migration drift: applied filename "${filename}" has no matching file on disk`,
      );
    }

    if (row.checksum == null) {
      if (options.backfillMissing) {
        await client.query(
          `UPDATE schema_migrations SET checksum = $1 WHERE filename = $2`,
          [file.checksum, filename],
        );
        row.checksum = file.checksum;
        console.log(`stamped  ${filename} (legacy checksum)`);
      }
      continue;
    }

    if (row.checksum !== file.checksum) {
      throw new Error(
        `Migration drift: "${filename}" was changed after being applied ` +
          `(stored checksum ${row.checksum}, file checksum ${file.checksum})`,
      );
    }
  }
}

async function applyMigration(
  client: PoolClient,
  file: MigrationFile,
): Promise<void> {
  const transactional = isTransactionalMigration(file.sql);

  if (transactional) {
    await client.query('BEGIN');
    try {
      await client.query(file.sql);
      await client.query(
        `INSERT INTO schema_migrations (filename, checksum, applied_at)
         VALUES ($1, $2, now())`,
        [file.filename, file.checksum],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    return;
  }

  // Non-transactional statements (e.g. CREATE INDEX CONCURRENTLY) must run
  // outside a transaction block; ledger insert is best-effort afterwards.
  await client.query(file.sql);
  await client.query(
    `INSERT INTO schema_migrations (filename, checksum, applied_at)
     VALUES ($1, $2, now())`,
    [file.filename, file.checksum],
  );
}

async function withMigrationLock<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    try {
      return await fn(client);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

/** Apply pending SQL migrations in filename order, each in a transaction when safe. */
export async function runMigrations(): Promise<void> {
  await withMigrationLock(async (client) => {
    await ensureSchemaMigrations(client);

    const files = await listMigrationFiles();
    const applied = await loadApplied(client);
    await verifyAppliedChecksums(client, files, applied, {
      backfillMissing: true,
    });

    let appliedCount = 0;
    for (const file of files) {
      if (applied.has(file.filename)) {
        console.log(`skip     ${file.filename} (already applied)`);
        continue;
      }

      try {
        const mode = isTransactionalMigration(file.sql)
          ? 'transaction'
          : 'no-transaction';
        await applyMigration(client, file);
        appliedCount += 1;
        console.log(`applied  ${file.filename} (${mode})`);
      } catch (error) {
        throw new Error(
          `Migration failed: ${file.filename}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    console.log(
      `Migrations complete: applied ${appliedCount}, total ${files.length}.`,
    );
  });
}

/**
 * Verify migration ledger integrity without applying anything.
 * Fails if an applied file is missing or its checksum no longer matches.
 */
export async function checkMigrations(): Promise<void> {
  await withMigrationLock(async (client) => {
    await ensureSchemaMigrations(client);

    const files = await listMigrationFiles();
    const applied = await loadApplied(client);
    await verifyAppliedChecksums(client, files, applied, {
      backfillMissing: false,
    });

    const pending = files.filter((file) => !applied.has(file.filename));
    const unstamped = [...applied.values()].filter(
      (row) => row.checksum == null,
    ).length;

    console.log(
      `Migration check OK: applied ${applied.size}, pending ${pending.length}` +
        (unstamped > 0 ? `, unstamped ${unstamped}` : '') +
        `, total ${files.length}.`,
    );

    for (const file of pending) {
      console.log(`pending  ${file.filename}`);
    }
  });
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const checkOnly = process.argv.includes('--check');
  const run = checkOnly ? checkMigrations : runMigrations;
  run()
    .then(() => closePool())
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      void closePool().finally(() => process.exit(1));
    });
}
