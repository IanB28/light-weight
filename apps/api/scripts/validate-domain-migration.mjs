import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: new URL('../../../.env', import.meta.url) });
dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required to validate the migration');

const migrationSql = await readFile(
  new URL('../drizzle/0000_product_domain_semantics_v1.sql', import.meta.url),
  'utf8'
);
const sql = postgres(connectionString, { max: 1, ssl: 'require' });
const rollbackSignal = new Error('VALIDATION_ROLLBACK');

try {
  const [before] = await sql`
    SELECT
      (SELECT count(*)::int FROM exercises) AS exercises,
      (SELECT count(*)::int FROM workout_sessions) AS sessions,
      (SELECT count(*)::int FROM logged_sets) AS sets,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'logged_sets' AND column_name = 'set_type'
      ) AS had_set_type
  `;

  try {
    await sql.begin(async (tx) => {
      await tx.unsafe(migrationSql);

      const columns = await tx`
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND (
            (table_name = 'exercises' AND column_name IN (
              'load_mechanism', 'load_mode', 'supports_keyboard', 'supports_plates',
              'supports_external_load', 'include_bar_weight'
            ))
            OR (table_name = 'logged_sets' AND column_name = 'set_type')
          )
      `;
      assert.equal(columns.length, 7, 'all loading and set_type columns must exist');

      const [setAudit] = await tx`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE set_type IS NULL)::int AS missing_type,
          count(*) FILTER (WHERE set_type NOT IN ('working', 'warmup', 'drop', 'backoff'))::int AS invalid_type,
          count(*) FILTER (WHERE is_warmup <> (set_type = 'warmup'))::int AS inconsistent_warmup
        FROM logged_sets
      `;
      assert.equal(setAudit.total, before.sets);
      assert.equal(setAudit.missing_type, 0);
      assert.equal(setAudit.invalid_type, 0);
      assert.equal(setAudit.inconsistent_warmup, 0);

      const [exerciseAudit] = await tx`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE load_mechanism IS NULL OR load_mode IS NULL)::int AS missing_profile,
          count(*) FILTER (WHERE supports_keyboard IS NULL OR supports_plates IS NULL
            OR supports_external_load IS NULL OR include_bar_weight IS NULL)::int AS missing_flags
        FROM exercises
      `;
      assert.equal(exerciseAudit.total, before.exercises);
      assert.equal(exerciseAudit.missing_profile, 0);
      assert.equal(exerciseAudit.missing_flags, 0);

      const curated = await tx`
        SELECT id, load_mechanism, load_mode, supports_plates
        FROM exercises
        WHERE id IN ('ex-0739', 'ex-0585', 'ex-0189', 'ex-0841', 'ex-0289')
      `;
      const byId = Object.fromEntries(curated.map((row) => [row.id, row]));
      if (byId['ex-0739']) assert.equal(byId['ex-0739'].load_mechanism, 'plate_loaded');
      if (byId['ex-0585']) assert.equal(byId['ex-0585'].load_mechanism, 'selectorized');
      if (byId['ex-0189']) assert.equal(byId['ex-0189'].load_mode, 'per_side');
      if (byId['ex-0841']) assert.equal(byId['ex-0841'].load_mode, 'added_weight');
      if (byId['ex-0289']) assert.equal(byId['ex-0289'].load_mode, 'per_hand');

      throw rollbackSignal;
    });
  } catch (error) {
    if (error !== rollbackSignal) throw error;
  }

  const [after] = await sql`
    SELECT
      (SELECT count(*)::int FROM exercises) AS exercises,
      (SELECT count(*)::int FROM workout_sessions) AS sessions,
      (SELECT count(*)::int FROM logged_sets) AS sets,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'logged_sets' AND column_name = 'set_type'
      ) AS has_set_type
  `;
  assert.deepEqual(
    { exercises: after.exercises, sessions: after.sessions, sets: after.sets },
    { exercises: before.exercises, sessions: before.sessions, sets: before.sets },
    'validation must not alter row counts'
  );
  assert.equal(after.has_set_type, before.had_set_type, 'validation transaction must roll back DDL');
  console.log(`Migration validated with rollback (${before.exercises} exercises, ${before.sessions} sessions, ${before.sets} sets).`);
} finally {
  await sql.end();
}
