import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: new URL('../../../.env', import.meta.url) });
dotenv.config();
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required to validate the migration');
const migrationSql = await readFile(new URL('../drizzle/0001_auth_friends_routine_sharing_v1.sql', import.meta.url), 'utf8');
const sql = postgres(connectionString, { max: 1, ssl: 'require' });
const rollbackSignal = new Error('VALIDATION_ROLLBACK');

try {
  const [before] = await sql`SELECT count(*)::int AS users FROM users`;
  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(migrationSql);
      const columns = await tx`
        SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'users'
          AND column_name IN ('username', 'password_hash', 'display_name', 'birth_date', 'gender', 'avatar_url')
      `;
      assert.equal(columns.length, 6);
      const tables = await tx`
        SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name IN ('auth_sessions', 'friendships', 'routine_shares')
      `;
      assert.equal(tables.length, 3);
      const [afterUsers] = await tx`SELECT count(*)::int AS users FROM users`;
      assert.equal(afterUsers.users, before.users, 'identity migration must preserve existing users');
      throw rollbackSignal;
    });
  } catch (error) { if (error !== rollbackSignal) throw error; }
  const [after] = await sql`SELECT count(*)::int AS users FROM users`;
  assert.equal(after.users, before.users, 'validation must roll back all changes');
  console.log(`Auth migration validated with rollback (${before.users} existing users preserved).`);
} finally {
  await sql.end();
}
