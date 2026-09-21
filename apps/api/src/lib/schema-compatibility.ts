import { fileURLToPath } from 'node:url';
import { sql } from '../db/index.js';
import { compareMigrationLedger, readExpectedMigrations } from '../../scripts/schema-compatibility-core.mjs';

/** Matches Drizzle's readMigrationFiles(): SHA-256 of the complete SQL file. */
export type MigrationJournalEntry = { when: number; tag: string; hash: string };
export type AppliedMigration = { when: number; hash: string };
type LedgerMigration = AppliedMigration | { created_at: number | string; hash: string };

export type SchemaCompatibility =
  | { ok: true; expected: MigrationJournalEntry[]; applied: AppliedMigration[] }
  | { ok: false; reason: 'migration_ledger_missing' | 'database_unavailable' | 'migration_missing' | 'migration_hash_mismatch'; expected: MigrationJournalEntry[]; applied: AppliedMigration[]; missing: MigrationJournalEntry[]; hashMismatches: MigrationJournalEntry[] };

const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../drizzle/', import.meta.url));
const JOURNAL_PATH = fileURLToPath(new URL('../../drizzle/meta/_journal.json', import.meta.url));

/** Import-meta based paths remain valid from compiled dist/ and in Vercel. */
export function readExpectedMigrationJournal(): MigrationJournalEntry[] {
  return readExpectedMigrations(MIGRATIONS_FOLDER, JOURNAL_PATH) as MigrationJournalEntry[];
}

export function evaluateSchemaCompatibility(expected: MigrationJournalEntry[], applied: LedgerMigration[]): SchemaCompatibility {
  const result = compareMigrationLedger(expected, applied) as {
    applied: AppliedMigration[];
    missing: MigrationJournalEntry[];
    hashMismatches: MigrationJournalEntry[];
  };
  if (result.missing.length) return { ok: false, reason: 'migration_missing', expected, applied: result.applied, missing: result.missing, hashMismatches: result.hashMismatches };
  if (result.hashMismatches.length) return { ok: false, reason: 'migration_hash_mismatch', expected, applied: result.applied, missing: result.missing, hashMismatches: result.hashMismatches };
  return { ok: true, expected, applied: result.applied };
}

export function schemaVerificationFailureReason(code: unknown): 'migration_ledger_missing' | 'database_unavailable' {
  return code === '42P01' || code === '3F000' ? 'migration_ledger_missing' : 'database_unavailable';
}

/** Read-only runtime check used by /api/ready; it never calls migrate(). */
export async function verifySchemaCompatibility(): Promise<SchemaCompatibility> {
  const expected = readExpectedMigrationJournal();
  try {
    const rows = await sql.unsafe('SELECT created_at, hash FROM drizzle.__drizzle_migrations');
    const applied = rows.flatMap((row): LedgerMigration[] => (
      (typeof row.created_at === 'number' || typeof row.created_at === 'string') && typeof row.hash === 'string'
        ? [{ created_at: row.created_at, hash: row.hash }]
        : []
    ));
    return evaluateSchemaCompatibility(expected, applied);
  } catch (error: unknown) {
    const code = typeof error === 'object' && error !== null && 'code' in error ? (error as { code?: unknown }).code : undefined;
    return { ok: false, reason: schemaVerificationFailureReason(code), expected, applied: [], missing: expected, hashMismatches: [] };
  }
}
