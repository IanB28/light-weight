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
const migrations = [
  new URL('../../drizzle/0009_routine_template_v2.sql', import.meta.url),
  new URL('../../drizzle/0010_legacy_routine_template_reconciliation.sql', import.meta.url),
  new URL('../../drizzle/0011_legacy_routine_share_template_compatibility.sql', import.meta.url)
];

const exercise = (exerciseId: string, setType: string, targetWeightKg: number) => ({
  exerciseId,
  sets: [{ setType, targetWeightKg }]
});
const template = (...exercises: ReturnType<typeof exercise>[]) => ({ version: 2, exercises });

test('old-main share creation and import preserve V2 snapshots through rollback and redeploy', async (t) => {
  if (!connectionString) {
    t.skip('DATABASE_URL is not configured');
    return;
  }
  const sql = postgres(connectionString, { max: 1, ssl: 'require' });
  const rollback = new Error('ROUTINE_SHARE_ROLLBACK_TEST_ROLLBACK');
  const senderId = randomUUID();
  const recipientId = randomUUID();
  const sourceId = randomUUID();
  const bench80Row70 = template(exercise('bench', 'working', 80), exercise('row', 'backoff', 70));

  try {
    try {
      await sql.begin(async (tx) => {
        // Serialize transactional DDL across integration-test files.
        await tx`SELECT pg_advisory_xact_lock(198, 31)`;
        // All DDL and fixtures stay inside this rolled-back disposable-DB transaction.
        for (const migration of migrations) {
          const source = await readFile(migration, 'utf8');
          for (const statement of source.split('--> statement-breakpoint')) {
            if (statement.trim()) await tx.unsafe(statement);
          }
        }
        await tx`
          INSERT INTO users (id, email, username, display_name)
          VALUES
            (${senderId}, ${`share-sender-${senderId}@example.test`}, ${`s_${senderId.slice(0, 18)}`}, 'Sender'),
            (${recipientId}, ${`share-recipient-${recipientId}@example.test`}, ${`r_${recipientId.slice(0, 18)}`}, 'Recipient')
        `;
        await tx`
          INSERT INTO routines (id, user_id, name, exercise_ids, exercise_template)
          VALUES (${sourceId}, ${senderId}, 'Source', ${tx.json(['bench', 'row'])}, ${tx.json(bench80Row70)})
        `;

        const getShare = async (id: string) => (await tx`
          SELECT exercise_ids, exercise_template, status, imported_routine_id
          FROM routine_shares WHERE id = ${id}
        `)[0];
        const getRoutine = async (id: string) => (await tx`
          SELECT id, user_id, name, exercise_ids, exercise_template
          FROM routines WHERE id = ${id}
        `)[0];
        const legacyShare = async (ids: string[]) => {
          const id = randomUUID();
          // Same columns as old main; exercise_template is intentionally omitted.
          await tx`
            INSERT INTO routine_shares
              (id, source_routine_id, sender_id, recipient_id, routine_name, routine_description, exercise_ids)
            VALUES (${id}, ${sourceId}, ${senderId}, ${recipientId}, 'Source', 'Legacy snapshot', ${tx.json(ids)})
          `;
          return id;
        };

        const shareId = await legacyShare(['bench', 'row']);
        assert.deepEqual((await getShare(shareId)).exercise_ids, ['bench', 'row']);
        assert.deepEqual((await getShare(shareId)).exercise_template, bench80Row70);

        // Requested order/membership is authoritative; source sets survive.
        const sourceWithSquat = template(
          exercise('bench', 'working', 80), exercise('row', 'backoff', 70), exercise('squat', 'working', 100)
        );
        await tx`
          UPDATE routines SET exercise_ids = ${tx.json(['bench', 'row', 'squat'])},
            exercise_template = ${tx.json(sourceWithSquat)} WHERE id = ${sourceId}
        `;
        const reorderedShareId = await legacyShare(['row', 'curl', 'bench']);
        const reordered = await getShare(reorderedShareId);
        const reorderedTemplate = template(
          exercise('row', 'backoff', 70), exercise('curl', 'warmup', 0), exercise('bench', 'working', 80)
        );
        assert.deepEqual(reordered.exercise_ids, ['row', 'curl', 'bench']);
        assert.deepEqual(reordered.exercise_template, reorderedTemplate);

        // Parity with D3's routine reconciler, including duplicate removal.
        const parityRoutineId = randomUUID();
        await tx`
          INSERT INTO routines (id, user_id, name, exercise_ids, exercise_template)
          VALUES (${parityRoutineId}, ${senderId}, 'Parity', ${tx.json(['bench', 'row', 'squat'])}, ${tx.json(sourceWithSquat)})
        `;
        await tx`
          UPDATE routines SET exercise_ids = ${tx.json(['row', 'curl', 'bench', 'row'])}
          WHERE id = ${parityRoutineId}
        `;
        const parityShareId = await legacyShare(['row', 'curl', 'bench', 'row']);
        assert.deepEqual((await getShare(parityShareId)).exercise_ids, ['row', 'curl', 'bench']);
        assert.deepEqual((await getShare(parityShareId)).exercise_template, (await getRoutine(parityRoutineId)).exercise_template);

        // A legacy or malformed source must not invent configured data.
        await tx`UPDATE routines SET exercise_template = NULL WHERE id = ${sourceId}`;
        const legacySourceShareId = await legacyShare(['bench']);
        assert.equal((await getShare(legacySourceShareId)).exercise_template, null);
        await tx`UPDATE routines SET exercise_template = ${tx.json({ version: 2, exercises: 'bad' })} WHERE id = ${sourceId}`;
        const corruptSourceShareId = await legacyShare(['bench']);
        assert.equal((await getShare(corruptSourceShareId)).exercise_template, null);

        // Explicit V2 snapshot is never replaced by the source routine.
        await tx`
          UPDATE routines SET exercise_ids = ${tx.json(['bench', 'row'])},
            exercise_template = ${tx.json(bench80Row70)} WHERE id = ${sourceId}
        `;
        const explicitShareId = randomUUID();
        const explicitSnapshot = template(exercise('bench', 'working', 90));
        await tx`
          INSERT INTO routine_shares
            (id, source_routine_id, sender_id, recipient_id, routine_name, exercise_ids, exercise_template)
          VALUES (${explicitShareId}, ${sourceId}, ${senderId}, ${recipientId}, 'Explicit',
            ${tx.json(['bench'])}, ${tx.json(explicitSnapshot)})
        `;
        assert.deepEqual((await getShare(explicitShareId)).exercise_template, explicitSnapshot);

        // Old API import: first insert a NULL-template clone, then mark share imported.
        const oldCloneId = randomUUID();
        await tx`
          INSERT INTO routines (id, user_id, name, exercise_ids)
          VALUES (${oldCloneId}, ${recipientId}, 'Imported old-style', ${tx.json(['bench', 'row'])})
        `;
        assert.equal((await getRoutine(oldCloneId)).exercise_template, null);
        await tx`
          UPDATE routine_shares SET status = 'imported', imported_routine_id = ${oldCloneId}, imported_at = now()
          WHERE id = ${shareId}
        `;
        assert.deepEqual((await getRoutine(oldCloneId)).exercise_template, bench80Row70);
        assert.deepEqual((await getShare(shareId)).exercise_template, bench80Row70);

        // Import membership can differ; reconcile from the immutable share.
        const reorderedCloneId = randomUUID();
        await tx`
          INSERT INTO routines (id, user_id, name, exercise_ids)
          VALUES (${reorderedCloneId}, ${recipientId}, 'Reordered import', ${tx.json(['bench', 'curl', 'row'])})
        `;
        await tx`
          UPDATE routine_shares SET status = 'imported', imported_routine_id = ${reorderedCloneId}
          WHERE id = ${reorderedShareId}
        `;
        assert.deepEqual((await getRoutine(reorderedCloneId)).exercise_template, template(
          exercise('bench', 'working', 80), exercise('curl', 'warmup', 0), exercise('row', 'backoff', 70)
        ));

        // Current V2 import has its own explicit template and stays untouched.
        const v2CloneId = randomUUID();
        await tx`
          INSERT INTO routines (id, user_id, name, exercise_ids, exercise_template)
          VALUES (${v2CloneId}, ${recipientId}, 'V2 import', ${tx.json(['bench'])}, ${tx.json(explicitSnapshot)})
        `;
        const v2ShareId = randomUUID();
        await tx`
          INSERT INTO routine_shares
            (id, source_routine_id, sender_id, recipient_id, routine_name, exercise_ids, exercise_template)
          VALUES (${v2ShareId}, ${sourceId}, ${senderId}, ${recipientId}, 'V2 share',
            ${tx.json(['bench'])}, ${tx.json(template(exercise('bench', 'working', 80)))})
        `;
        await tx`
          UPDATE routine_shares SET status = 'imported', imported_routine_id = ${v2CloneId}
          WHERE id = ${v2ShareId}
        `;
        assert.deepEqual((await getRoutine(v2CloneId)).exercise_template, explicitSnapshot);

        // Dismiss changes neither share snapshot nor any routine template.
        const beforeDismiss = (await getRoutine(sourceId)).exercise_template;
        await tx`UPDATE routine_shares SET status = 'dismissed' WHERE id = ${parityShareId}`;
        assert.deepEqual((await getShare(parityShareId)).exercise_template, (await getRoutine(parityRoutineId)).exercise_template);
        assert.deepEqual((await getRoutine(sourceId)).exercise_template, beforeDismiss);

        // Full rollback -> redeploy: V2 sees the physical configured sets.
        const imported = await getRoutine(oldCloneId);
        const hydrated = normalizeRoutine({
          id: imported.id,
          userId: imported.user_id,
          name: imported.name,
          exerciseIds: imported.exercise_ids,
          template: imported.exercise_template
        });
        assert.deepEqual(hydrated?.exerciseIds, ['bench', 'row']);
        assert.deepEqual(hydrated?.template, bench80Row70);
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
