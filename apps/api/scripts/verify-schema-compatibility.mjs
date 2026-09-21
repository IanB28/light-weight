import { fileURLToPath, pathToFileURL } from 'node:url';
import postgres from 'postgres';
import { compareMigrationLedger, readExpectedMigrations } from './schema-compatibility-core.mjs';

const migrationsFolder = fileURLToPath(new URL('../drizzle/', import.meta.url));
const journalPath = fileURLToPath(new URL('../drizzle/meta/_journal.json', import.meta.url));

/** Drizzle's reader is the canonical source for local timestamp/hash pairs. */
export function requiredMigrations() {
  return readExpectedMigrations(migrationsFolder, journalPath);
}

export function evaluateSchemaCompatibility(expected, applied) {
  return compareMigrationLedger(expected, applied);
}

export async function verifySchemaCompatibility({ connectionString = process.env.DATABASE_URL, loadApplied } = {}) {
  if (!connectionString && !loadApplied) throw new Error('DATABASE_URL is required for the production schema compatibility check.');
  const expected = requiredMigrations();
  let client;
  try {
    client = loadApplied ? undefined : postgres(connectionString, { max: 1, ssl: 'require', prepare: false });
    const applied = loadApplied ? await loadApplied() : await client.unsafe('SELECT created_at, hash FROM drizzle.__drizzle_migrations');
    return { expected, ...evaluateSchemaCompatibility(expected, applied) };
  } finally {
    await client?.end({ timeout: 5 });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await verifySchemaCompatibility();
    if (!result.ok) {
      const missing = result.missing.map((migration) => migration.tag);
      const mismatched = result.hashMismatches.map((migration) => migration.tag);
      const detail = [...missing.map((tag) => `missing ${tag}`), ...mismatched.map((tag) => `hash mismatch ${tag}`)].join(', ');
      throw new Error(`Production database schema is behind or incompatible with this deployment (${detail}).\nApply pending migrations with:\npnpm --filter @light-weight/api db:migrate\nthen redeploy.`);
    }
    console.log(`Schema compatibility verified (${result.expected.length} local migrations match the database ledger).`);
  } catch (error) {
    console.error(`Schema compatibility check failed: ${error instanceof Error ? error.message : 'Unknown schema compatibility failure.'}`);
    process.exitCode = 1;
  }
}
