import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { legacyMigrationHashCompatibility } from './schema-compatibility-manifest.mjs';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Git/Vercel source is LF while the historical Windows checkout for 0002 had
 * one CRLF. Canonicalizing only the declared legacy migration lets us verify
 * source integrity on either platform without accepting source edits.
 */
function canonicalSourceHash(source) {
  return sha256(Buffer.from(source.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'));
}

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
    const compatibility = legacyMigrationHashCompatibility(when, tag);
    if (!compatibility) return { when, tag, hash: migration.hash };

    const sourceHash = canonicalSourceHash(readFileSync(join(migrationsFolder, `${tag}.sql`)));
    if (sourceHash !== compatibility.canonicalSourceHash) {
      throw new Error(`Local migration source integrity mismatch for ${tag}.`);
    }
    return {
      when,
      tag,
      hash: compatibility.canonicalSourceHash,
      acceptedAppliedHashes: compatibility.acceptedAppliedHashes,
    };
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
    const acceptedHashes = migration.acceptedAppliedHashes ?? [migration.hash];
    return hash !== undefined && !acceptedHashes.includes(hash);
  });
  return { ok: missing.length === 0 && hashMismatches.length === 0, applied, missing, hashMismatches };
}
