import { describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import {
  checksumMigration,
  isTransactionalMigration,
  verifyAppliedChecksums,
} from './migrate.js';

describe('checksumMigration', () => {
  it('is stable for identical SQL', () => {
    const sql = 'CREATE TABLE foo (id TEXT);\n';
    expect(checksumMigration(sql)).toBe(checksumMigration(sql));
  });

  it('normalizes CRLF to LF before hashing', () => {
    const lf = 'CREATE TABLE foo (id TEXT);\n';
    const crlf = 'CREATE TABLE foo (id TEXT);\r\n';
    expect(checksumMigration(crlf)).toBe(checksumMigration(lf));
  });

  it('changes when SQL content changes', () => {
    expect(checksumMigration('SELECT 1;')).not.toBe(
      checksumMigration('SELECT 2;'),
    );
  });
});

describe('verifyAppliedChecksums', () => {
  it('throws Migration drift when an applied checksum no longer matches the file', async () => {
    const sql = 'CREATE TABLE foo (id TEXT);\n';
    const fileChecksum = checksumMigration(sql);
    const client = { query: vi.fn() } as unknown as PoolClient;
    const files = [
      { filename: '001_foo.sql', sql, checksum: fileChecksum },
    ];
    const applied = new Map([
      [
        '001_foo.sql',
        {
          filename: '001_foo.sql',
          checksum: 'deadbeef',
          applied_at: new Date('2026-01-01T00:00:00.000Z'),
        },
      ],
    ]);

    await expect(
      verifyAppliedChecksums(client, files, applied, {
        backfillMissing: false,
      }),
    ).rejects.toThrow(/Migration drift: "001_foo.sql"/);

    expect(client.query).not.toHaveBeenCalled();
  });
});

describe('isTransactionalMigration', () => {
  it('allows ordinary DDL', () => {
    expect(
      isTransactionalMigration(`
        CREATE TABLE parcels (id TEXT PRIMARY KEY);
        CREATE INDEX parcels_id_idx ON parcels (id);
      `),
    ).toBe(true);
  });

  it('rejects CREATE INDEX CONCURRENTLY', () => {
    expect(
      isTransactionalMigration(
        'CREATE INDEX CONCURRENTLY parcels_geom_idx ON parcels USING GIST (geom);',
      ),
    ).toBe(false);
  });

  it('rejects DROP INDEX CONCURRENTLY', () => {
    expect(
      isTransactionalMigration('DROP INDEX CONCURRENTLY IF EXISTS parcels_geom_idx;'),
    ).toBe(false);
  });

  it('rejects VACUUM', () => {
    expect(isTransactionalMigration('VACUUM ANALYZE parcels;')).toBe(false);
  });
});
