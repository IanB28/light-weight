import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

dotenv.config({ path: new URL('../../../.env', import.meta.url) });
dotenv.config();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required to validate the migration pipeline');

const migrationFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../drizzle');
const sql = postgres(connectionString, { max: 1, ssl: 'require' });
const rollbackSignal = new Error('MIGRATION_PIPELINE_ROLLBACK');

try {
  try {
    await sql.begin(async (tx) => {
      // Force a clean Drizzle ledger inside this transaction. Schema/data and
      // ledger are restored by rollback, so this never applies to Neon.
      await tx.unsafe('DROP TABLE IF EXISTS drizzle.__drizzle_migrations');
      // postgres-js transaction handles intentionally omit client options.
      // Drizzle's adapter only needs the parser registry from the root client.
      Object.defineProperty(tx, 'options', { value: sql.options });
      // Drizzle migrator starts its own transaction. The outer transaction is
      // already the isolation boundary for this validator, so delegate that
      // nested transaction to the same handle.
      Object.defineProperty(tx, 'begin', { value: async (callback) => callback(tx) });
      const transactionalDb = drizzle(tx);
      await migrate(transactionalDb, { migrationsFolder: migrationFolder });
      const firstRun = await tx`SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at`;
      assert.equal(firstRun.length, 7, 'first migration run must apply migrations 0000 through 0006');

      await migrate(transactionalDb, { migrationsFolder: migrationFolder });
      const secondRun = await tx`SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at`;
      assert.deepEqual(secondRun, firstRun, 'second migration run must be a no-op');
      throw rollbackSignal;
    });
  } catch (error) {
    if (error !== rollbackSignal) throw error;
  }
  console.log('Drizzle migration pipeline validated: first run applies 0000 through 0006; second run is a no-op; transaction rolled back.');
} finally {
  await sql.end();
}
