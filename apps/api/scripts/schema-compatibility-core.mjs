import { readFileSync } from 'node:fs';
import { readMigrationFiles } from 'drizzle-orm/migrator';

/**
 * Reads local migration hashes with Drizzle's own canonical reader. The journal
 * supplies only the human-readable tag; Drizzle supplies folderMillis + hash.
 */
export function readExpectedMigrations(migrationsFolder, journalPath) {
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'));
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    throw new Error('Local Drizzle migration journal is invalid or empty.');
  }

  const tagsByTimestamp = new Map(
    journal.entries.flatMap((entry) => (
      typeof entry?.when === 'number' && typeof entry?.tag === 'string'
        ? [[entry.when, entry.tag]]
        : []
    )),
  );
  const migrations = readMigrationFiles({ migrationsFolder });
  if (migrations.length === 0) throw new Error('Local Drizzle migration folder is empty.');

  return migrations.map((migration) => {
    const when = Number(migration.folderMillis);
    const tag = tagsByTimestamp.get(when);
    if (!Number.isFinite(when) || !tag) {
      throw new Error('Local Drizzle migration metadata is inconsistent.');
    }
    return { when, tag, hash: migration.hash };
  });
}

/** Accept both raw Drizzle ledger rows and already-normalized test fixtures. */
export function normalizeAppliedMigrations(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== 'object') return [];
    const candidate = row;
    const when = Number(candidate.created_at ?? candidate.when);
    return Number.isFinite(when) && typeof candidate.hash === 'string'
      ? [{ when, hash: candidate.hash }]
      : [];
  });
}

/**
 * Extra migrations in the database are intentionally allowed. Only the local
 * build's required timestamp/hash pairs determine compatibility.
 */
export function compareMigrationLedger(expected, remoteRows) {
  const applied = normalizeAppliedMigrations(remoteRows);
  const appliedByTimestamp = new Map(applied.map((migration) => [migration.when, migration.hash]));
  const missing = expected.filter((migration) => !appliedByTimestamp.has(migration.when));
  const hashMismatches = expected.filter((migration) => {
    const hash = appliedByTimestamp.get(migration.when);
    return hash !== undefined && hash !== migration.hash;
  });
  return { ok: missing.length === 0 && hashMismatches.length === 0, applied, missing, hashMismatches };
}
