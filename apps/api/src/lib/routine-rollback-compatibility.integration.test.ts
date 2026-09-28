import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import dotenv from 'dotenv';
import postgres from 'postgres';
import { normalizeRoutine } from '@light-weight/domain';

dotenv.config({ path: new URL('../../../.env', import.meta.url) });
dotenv.config();

const connectionString = process.env.DATABASE_URL;
const migration0009 = new URL('../../drizzle/0009_routine_template_v2.sql', import.meta.url);
const migration0010 = new URL('../../drizzle/0010_legacy_routine_template_reconciliation.sql', import.meta.url);

const exercise = (exerciseId: string, setType: string, targetWeightKg: number) => ({
  exerciseId,
  sets: [{ setType, targetWeightKg }]
});
const template = (...exercises: ReturnType<typeof exercise>[]) => ({ version: 2, exercises });

test('old-main routine writes preserve V2 configuration through rollback and redeploy', async (t) => {
  if (!connectionString) {
    t.skip('DATABASE_URL is not configured');
    return;
  }

  const sql = postgres(connectionString, { max: 1, ssl: 'require' });
  const rollback = new Error('ROUTINE_ROLLBACK_COMPATIBILITY_TEST_ROLLBACK');
  const ownerId = randomUUID();
  const routineId = randomUUID();
  try {
    const migrationSql = await readFile(migration0010, 'utf8');
    const priorMigrationSql = await readFile(migration0009, 'utf8');
    try {
      await sql.begin(async (tx) => {
        // Schema and fixtures are transaction-local, even if the disposable DB
        // has not yet applied 0009/0010. No persistent DB state is changed.
        await tx.unsafe(priorMigrationSql);
        for (const statement of migrationSql.split('--> statement-breakpoint')) {
          if (statement.trim()) await tx.unsafe(statement);
        }
        await tx`
          INSERT INTO users (id, email, username, display_name)
          VALUES (${ownerId}, ${`rollback-${ownerId}@example.test`}, ${`rb_${ownerId.slice(0, 18)}`}, 'Rollback test')
        `;
        await tx`
          INSERT INTO routines (id, user_id, name, exercise_ids, exercise_template)
          VALUES (${routineId}, ${ownerId}, 'Original', ${tx.json(['bench', 'row'])},
            ${tx.json(template(exercise('bench', 'working', 80), exercise('row', 'backoff', 70)))})
        `;

        const getRow = async () => (await tx`
          SELECT id, user_id, name, description, exercise_ids, exercise_template
          FROM routines WHERE id = ${routineId}
        `)[0];
        const reset = async (ids: string[], configured: Parameters<typeof tx.json>[0]) => {
          await tx`
            UPDATE routines SET exercise_ids = ${tx.json(ids)}, exercise_template = ${configured === null ? null : tx.json(configured)}
            WHERE id = ${routineId}
          `;
        };

        // Exact old-main shape: only name/description/exercise_ids/updated_at.
        await tx`
          UPDATE routines SET name = 'Old edit', description = 'Legacy API',
            exercise_ids = ${tx.json(['row', 'curl', 'bench'])}, updated_at = now()
          WHERE id = ${routineId}
        `;
        let row = await getRow();
        assert.deepEqual(row.exercise_ids, ['row', 'curl', 'bench']);
        assert.deepEqual(row.exercise_template, template(
          exercise('row', 'backoff', 70),
          exercise('curl', 'warmup', 0),
          exercise('bench', 'working', 80)
        ));

        // Removal and reordering cannot leave a removed exercise in V2 authority.
        await reset(['bench', 'row', 'curl'], template(
          exercise('bench', 'working', 80), exercise('row', 'backoff', 70), exercise('curl', 'working', 25)
        ));
        await tx`UPDATE routines SET exercise_ids = ${tx.json(['curl', 'bench'])} WHERE id = ${routineId}`;
        row = await getRow();
        assert.deepEqual(row.exercise_ids, ['curl', 'bench']);
        assert.deepEqual(row.exercise_template, template(exercise('curl', 'working', 25), exercise('bench', 'working', 80)));

        // Retained JSON objects keep all prescribed sets, order and metadata.
        const detailedBench = {
          exerciseId: 'bench',
          sets: [{ setType: 'warmup', targetWeightKg: 40 }, { setType: 'working', targetWeightKg: 80 }],
          note: 'preserve source object'
        };
        await reset(['bench'], { version: 2, exercises: [detailedBench] });
        await tx`UPDATE routines SET exercise_ids = ${tx.json(['bench', 'curl'])} WHERE id = ${routineId}`;
        assert.deepEqual((await getRow()).exercise_template.exercises[0], detailedBench);

        // Explicit V2 writes of both columns must use the supplied new template.
        await reset(['bench', 'row'], template(exercise('bench', 'working', 80), exercise('row', 'working', 70)));
        const explicit = template(exercise('curl', 'working', 25), exercise('bench', 'working', 90));
        await tx`
          UPDATE routines SET exercise_ids = ${tx.json(['curl', 'bench'])},
            exercise_template = ${tx.json(explicit)} WHERE id = ${routineId}
        `;
        assert.deepEqual((await getRow()).exercise_template, explicit);

        // Set-only V2 edits and metadata-only edits are untouched.
        await reset(['bench'], template(exercise('bench', 'working', 80)));
        const editedSets = template(exercise('bench', 'working', 85));
        await tx`UPDATE routines SET exercise_template = ${tx.json(editedSets)} WHERE id = ${routineId}`;
        assert.deepEqual((await getRow()).exercise_template, editedSets);
        await tx`UPDATE routines SET name = 'Metadata only', description = 'No membership edit' WHERE id = ${routineId}`;
        assert.deepEqual((await getRow()).exercise_template, editedSets);

        // Null and unrecognized/corrupt templates are never synthesized/repaired.
        await reset(['bench'], null);
        await tx`UPDATE routines SET exercise_ids = ${tx.json(['row'])} WHERE id = ${routineId}`;
        assert.equal((await getRow()).exercise_template, null);
        for (const unrecognized of [
          { version: 3, exercises: [] },
          { version: 2, exercises: 'bad' },
          { version: 2, exercises: [{ exerciseId: 'bench' }] }
        ]) {
          await reset(['bench'], unrecognized);
          await tx`UPDATE routines SET exercise_ids = ${tx.json(['row'])} WHERE id = ${routineId}`;
          assert.deepEqual((await getRow()).exercise_template, unrecognized);
        }

        // Duplicate IDs follow first-occurrence order, with one template entry.
        await reset(['bench'], template(exercise('bench', 'working', 80)));
        await tx`UPDATE routines SET exercise_ids = ${tx.json(['bench', 'curl', 'bench'])} WHERE id = ${routineId}`;
        row = await getRow();
        assert.deepEqual(row.exercise_ids, ['bench', 'curl']);
        assert.deepEqual(row.exercise_template, template(exercise('bench', 'working', 80), exercise('curl', 'warmup', 0)));

        // Full rollback/redeploy: current normalization must see Curl, not Row.
        await reset(['bench', 'row'], template(exercise('bench', 'working', 80), exercise('row', 'working', 70)));
        await tx`UPDATE routines SET exercise_ids = ${tx.json(['bench', 'curl'])} WHERE id = ${routineId}`;
        row = await getRow();
        const hydrated = normalizeRoutine({
          id: row.id,
          userId: row.user_id,
          name: row.name,
          exerciseIds: row.exercise_ids,
          template: row.exercise_template
        });
        assert.deepEqual(hydrated?.exerciseIds, ['bench', 'curl']);
        assert.deepEqual(hydrated?.template, template(exercise('bench', 'working', 80), exercise('curl', 'warmup', 0)));
        assert.equal(hydrated?.templateSource, 'v2');

        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  } finally {
    await sql.end();
  }
});
