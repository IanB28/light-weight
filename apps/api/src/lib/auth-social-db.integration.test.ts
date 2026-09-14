import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config({ path: new URL('../../../.env', import.meta.url) });
dotenv.config();

const connectionString = process.env.DATABASE_URL;
const migrationUrl = new URL('../../drizzle/0001_auth_friends_routine_sharing_v1.sql', import.meta.url);

/**
 * This is intentionally a database integration test rather than a mock:
 * it exercises the exact owner predicates used by the protected handlers and
 * rolls every schema/data change back before the connection closes.
 */
test('authorization guards and idempotent routine import hold inside a rolled-back database transaction', async (t) => {
  if (!connectionString) {
    t.skip('DATABASE_URL is not configured');
    return;
  }
  const sql = postgres(connectionString, { max: 1, ssl: 'require' });
  const rollback = new Error('AUTH_SOCIAL_TEST_ROLLBACK');
  const a = '10000000-0000-4000-8000-000000000001';
  const b = '10000000-0000-4000-8000-000000000002';
  const c = '10000000-0000-4000-8000-000000000003';
  const routineA = '20000000-0000-4000-8000-000000000001';
  const workoutA = '30000000-0000-4000-8000-000000000001';
  const friendship = '40000000-0000-4000-8000-000000000001';
  const share = '50000000-0000-4000-8000-000000000001';
  const imported = '60000000-0000-4000-8000-000000000001';

  try {
    const migrationSql = await readFile(migrationUrl, 'utf8');
    try {
      await sql.begin(async (tx) => {
        await tx.unsafe(migrationSql);
        await tx`
          INSERT INTO users (id, email, username, display_name)
          VALUES
            (${a}, 'owner.auth-social@example.test', 'owner_auth_social', 'Owner'),
            (${b}, 'recipient.auth-social@example.test', 'recipient_auth_social', 'Recipient'),
            (${c}, 'third.auth-social@example.test', 'third_auth_social', 'Third')
        `;
        await tx`
          INSERT INTO routines (id, user_id, name, exercise_ids)
          VALUES (${routineA}, ${a}, 'Owner push', ${tx.json(['bench'])})
        `;
        await tx`
          INSERT INTO workout_sessions (id, user_id, routine_id, started_at)
          VALUES (${workoutA}, ${a}, ${routineA}, now())
        `;

        // A routine/workout owned by A cannot be mutated by B.
        assert.equal((await tx`UPDATE routines SET name = 'stolen' WHERE id = ${routineA} AND user_id = ${b} RETURNING id`).length, 0);
        assert.equal((await tx`DELETE FROM routines WHERE id = ${routineA} AND user_id = ${b} RETURNING id`).length, 0);
        assert.equal((await tx`UPDATE workout_sessions SET notes = 'stolen' WHERE id = ${workoutA} AND user_id = ${b} RETURNING id`).length, 0);
        assert.equal((await tx`SELECT name FROM routines WHERE id = ${routineA}`)[0].name, 'Owner push');

        await tx`
          INSERT INTO friendships (id, user_a_id, user_b_id, requester_id, status)
          VALUES (${friendship}, ${a}, ${b}, ${a}, 'pending')
        `;
        // C cannot accept or remove A/B's request.
        assert.equal((await tx`
          UPDATE friendships SET status = 'accepted'
          WHERE id = ${friendship} AND requester_id <> ${c} AND (${c} = user_a_id OR ${c} = user_b_id)
          RETURNING id
        `).length, 0);
        assert.equal((await tx`
          DELETE FROM friendships WHERE id = ${friendship} AND (${c} = user_a_id OR ${c} = user_b_id)
          RETURNING id
        `).length, 0);
        await tx`UPDATE friendships SET status = 'accepted' WHERE id = ${friendship}`;

        await tx`
          INSERT INTO routine_shares (id, source_routine_id, sender_id, recipient_id, routine_name, exercise_ids)
          VALUES (${share}, ${routineA}, ${a}, ${b}, 'Owner push', ${tx.json(['bench'])})
        `;
        // C cannot access B's share through recipient-scoped lookup.
        assert.equal((await tx`SELECT id FROM routine_shares WHERE id = ${share} AND recipient_id = ${c}`).length, 0);

        const origin = { type: 'shared', sharedBy: { id: a, username: 'owner_auth_social', displayName: 'Owner' }, shareId: share };
        // The first import creates one independent B-owned clone.
        await tx`
          INSERT INTO routines (id, user_id, name, exercise_ids, origin)
          VALUES (${imported}, ${b}, 'Owner push', ${tx.json(['bench'])}, ${tx.json(origin)})
        `;
        await tx`
          UPDATE routine_shares
          SET status = 'imported', imported_routine_id = ${imported}, imported_at = now()
          WHERE id = ${share} AND recipient_id = ${b} AND status = 'pending'
        `;
        // Retry semantics: the locked share resolves to that exact clone, not
        // another INSERT. Editing it cannot mutate A's original.
        const [retry] = await tx`
          SELECT imported_routine_id FROM routine_shares
          WHERE id = ${share} AND recipient_id = ${b} AND status = 'imported'
          FOR UPDATE
        `;
        assert.equal(retry.imported_routine_id, imported);
        assert.equal((await tx`SELECT id FROM routines WHERE user_id = ${b} AND origin->>'shareId' = ${share}`).length, 1);
        await tx`UPDATE routines SET name = 'Recipient copy' WHERE id = ${imported} AND user_id = ${b}`;
        assert.equal((await tx`SELECT name FROM routines WHERE id = ${routineA}`)[0].name, 'Owner push');
        assert.equal((await tx`SELECT origin->'sharedBy'->>'username' AS username FROM routines WHERE id = ${imported}`)[0].username, 'owner_auth_social');

        // Tombstones use the same owner predicate and cannot delete B's data.
        assert.equal((await tx`DELETE FROM routines WHERE id = ${imported} AND user_id = ${a} RETURNING id`).length, 0);
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  } finally {
    await sql.end();
  }
});
