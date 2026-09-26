import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../db/schema.js';
import { db, replaceDatabaseForTesting } from '../db/index.js';
import { createApp } from '../app.js';
import { hashOpaqueToken } from './auth-session.js';

dotenv.config({ path: new URL('../../../.env', import.meta.url) });
dotenv.config();
const connectionString = process.env.DATABASE_URL;

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test('HTTP sync transaction rolls back mutations and preserves one PR row per exercise', async (t) => {
  if (!connectionString) {
    t.skip('DATABASE_URL is not configured');
    return;
  }
  const sql = postgres(connectionString, { max: 1, ssl: 'require' });
  const rollback = new Error('HTTP_AUTHORIZATION_TEST_ROLLBACK');
  const a = '71000000-0000-4000-8000-000000000001';
  const b = '71000000-0000-4000-8000-000000000002';
  const c = '71000000-0000-4000-8000-000000000003';
  const routineA = '72000000-0000-4000-8000-000000000001';
  const localOnlyRoutine = '72000000-0000-4000-8000-000000000002';
  const atomicSession = '72000000-0000-4000-8000-000000000003';
  const atomicRoutine = '72000000-0000-4000-8000-000000000004';
  const firstPrSession = '72000000-0000-4000-8000-000000000005';
  const secondPrSession = '72000000-0000-4000-8000-000000000006';
  const share = '73000000-0000-4000-8000-000000000001';
  const sessions = [
    { userId: a, token: 'http-auth-token-a', csrf: 'http-auth-csrf-a' },
    { userId: b, token: 'http-auth-token-b', csrf: 'http-auth-csrf-b' },
    { userId: c, token: 'http-auth-token-c', csrf: 'http-auth-csrf-c' }
  ];
  const previousOrigins = process.env.WEB_ORIGINS;
  process.env.WEB_ORIGINS = 'http://localhost:3000';

  try {
    const migrationSql = await readFile(new URL('../../drizzle/0001_auth_friends_routine_sharing_v1.sql', import.meta.url), 'utf8');
    const hprMigrationSql = await readFile(new URL('../../drizzle/0007_historical_personal_records.sql', import.meta.url), 'utf8');
    const hprRepsMigrationSql = await readFile(new URL('../../drizzle/0008_hpr_reps_cap_constraint.sql', import.meta.url), 'utf8');
    try {
      await sql.begin(async (tx) => {
        // HTTP handlers open Drizzle transactions. Route them to PostgreSQL
        // savepoints so a failed nested sync actually rolls back its writes
        // while the outer disposable-test transaction remains inspectable.
        Object.defineProperty(tx, 'options', { value: sql.options });
        Object.defineProperty(tx, 'begin', { value: async (callback: (client: typeof tx) => Promise<unknown>) => tx.savepoint(callback) });
        await tx.unsafe(migrationSql);
        await tx.unsafe(hprMigrationSql);
        await tx.unsafe(hprRepsMigrationSql);
        const transactionalDb = drizzle(tx as never, { schema });
        const restoreDb = replaceDatabaseForTesting(transactionalDb as typeof db);
        try {
          await tx`
            INSERT INTO users (id, email, username, display_name)
            VALUES
              (${a}, 'http-owner@example.test', 'http_owner', 'Owner'),
              (${b}, 'http-recipient@example.test', 'http_recipient', 'Recipient'),
              (${c}, 'http-third@example.test', 'http_third', 'Third')
          `;
          await tx`
            INSERT INTO exercises (id, name, primary_muscle, category, is_custom)
            VALUES ('bench', 'Bench press', 'chest', 'barbell', false)
          `;
          await tx`
            INSERT INTO routines (id, user_id, name, exercise_ids)
            VALUES (${routineA}, ${a}, 'Owner routine', ${JSON.stringify(['bench'])}::jsonb)
          `;
          await tx`
            INSERT INTO workout_sessions (id, user_id, started_at)
            VALUES (${atomicSession}, ${a}, '2026-01-01T10:00:00.000Z')
          `;
          await tx`
            INSERT INTO logged_sets (session_id, exercise_id, set_index, weight_kg, reps, set_type, is_warmup)
            VALUES
              (${atomicSession}, 'bench', 1, 100, 5, 'working', false),
              (${atomicSession}, 'bench', 2, 90, 8, 'working', false)
          `;
          await tx`
            INSERT INTO routines (id, user_id, name, exercise_ids)
            VALUES (${localOnlyRoutine}, ${a}, 'Local custom routine', ${JSON.stringify(['local-only-custom'])}::jsonb)
          `;
          await tx`
            INSERT INTO friendships (user_a_id, user_b_id, requester_id, status)
            VALUES (${a}, ${b}, ${a}, 'accepted')
          `;
          await tx`
            INSERT INTO routine_shares (id, source_routine_id, sender_id, recipient_id, routine_name, exercise_ids)
            VALUES (${share}, ${routineA}, ${a}, ${b}, 'Owner routine', ${JSON.stringify(['bench'])}::jsonb)
          `;
          for (const session of sessions) {
            await tx`
              INSERT INTO auth_sessions (user_id, token_hash, csrf_token_hash, expires_at)
              VALUES (${session.userId}, ${hashOpaqueToken(session.token)}, ${hashOpaqueToken(session.csrf)}, now() + interval '1 day')
            `;
          }

          const headersFor = (session: typeof sessions[number]) => ({
            origin: 'http://localhost:3000',
            cookie: `lw_session=${session.token}; lw_csrf=${session.csrf}`,
            'x-csrf-token': session.csrf,
            'content-type': 'application/json'
          });
          await withServer(async (baseUrl) => {
            const oversizedExerciseId = 'x'.repeat(101);
            const failedReplacement = await fetch(`${baseUrl}/api/sync`, {
              method: 'POST', headers: headersFor(sessions[0]),
              body: JSON.stringify({
                bodyweightLogs: [{ weightKg: 88, loggedAt: '2026-01-01T10:00:00.000Z' }],
                routines: [{ id: atomicRoutine, name: 'Must roll back', exerciseIds: ['bench'] }],
                sessions: [{
                  id: atomicSession,
                  startedAt: '2026-01-01T10:00:00.000Z',
                  sets: {
                    bench: [{ setIndex: 1, weightKg: 110, reps: 5, setType: 'working', completed: true }],
                    [oversizedExerciseId]: [{ setIndex: 1, weightKg: 1, reps: 1, setType: 'working' }]
                  }
                }]
              })
            });
            assert.equal(failedReplacement.status, 500);
            const preservedSession = await tx`SELECT id, total_volume_kg FROM workout_sessions WHERE id = ${atomicSession}`;
            const preservedSets = await tx`SELECT weight_kg, reps FROM logged_sets WHERE session_id = ${atomicSession} ORDER BY set_index`;
            assert.equal(preservedSession.length, 1);
            assert.deepEqual(preservedSets.map((set) => [Number(set.weight_kg), set.reps]), [[100, 5], [90, 8]]);
            assert.equal((await tx`SELECT id FROM routines WHERE id = ${atomicRoutine}`).length, 0);
            assert.equal((await tx`SELECT id FROM bodyweight_logs WHERE user_id = ${a} AND weight_kg = 88`).length, 0);
            assert.equal((await tx`SELECT id FROM personal_records WHERE user_id = ${a} AND exercise_id = 'bench'`).length, 0);

            const firstPr = await fetch(`${baseUrl}/api/sync`, {
              method: 'POST', headers: headersFor(sessions[0]),
              body: JSON.stringify({ sessions: [{ id: firstPrSession, startedAt: '2026-01-02T10:00:00.000Z', sets: { bench: [{ setIndex: 1, weightKg: 100, reps: 5, setType: 'working', completed: true }] } }] })
            });
            assert.equal(firstPr.status, 200);
            const strongerPrs = await fetch(`${baseUrl}/api/sync`, {
              method: 'POST', headers: headersFor(sessions[0]),
              body: JSON.stringify({ sessions: [{ id: secondPrSession, startedAt: '2026-01-03T10:00:00.000Z', sets: { bench: [
                { setIndex: 1, weightKg: 105, reps: 5, setType: 'working', completed: true },
                { setIndex: 2, weightKg: 110, reps: 5, setType: 'working', completed: true }
              ] } }] })
            });
            assert.equal(strongerPrs.status, 200);
            const benchPrs = await tx`SELECT best_weight_kg, best_reps, session_id, achieved_at FROM personal_records WHERE user_id = ${a} AND exercise_id = 'bench'`;
            assert.equal(benchPrs.length, 1);
            assert.deepEqual([Number(benchPrs[0].best_weight_kg), benchPrs[0].best_reps, benchPrs[0].session_id], [110, 5, secondPrSession]);
            assert.equal(new Date(benchPrs[0].achieved_at).toISOString(), '2026-01-03T10:00:00.000Z');

            const unknownExerciseShare = await fetch(`${baseUrl}/api/routine-shares`, {
              method: 'POST', headers: headersFor(sessions[0]),
              body: JSON.stringify({ routineId: localOnlyRoutine, recipientId: b })
            });
            assert.equal(unknownExerciseShare.status, 422);
            assert.equal((await unknownExerciseShare.json() as { error: string }).error, 'ROUTINE_HAS_CUSTOM_EXERCISES');

            const bSync = await fetch(`${baseUrl}/api/sync`, {
              method: 'POST',
              headers: headersFor(sessions[1]),
              body: JSON.stringify({ routines: [{ id: routineA, name: 'Stolen', exerciseIds: ['bench'] }] })
            });
            assert.equal(bSync.status, 403);

            const bDelete = await fetch(`${baseUrl}/api/sync`, {
              method: 'POST', headers: headersFor(sessions[1]),
              body: JSON.stringify({ deletedRoutineIds: [routineA] })
            });
            assert.equal(bDelete.status, 403);
            assert.equal((await tx`SELECT id FROM routines WHERE id = ${routineA}`).length, 1);

            const cImport = await fetch(`${baseUrl}/api/routine-shares/${share}/import`, {
              method: 'POST', headers: headersFor(sessions[2])
            });
            assert.equal(cImport.status, 404);

            const firstImport = await fetch(`${baseUrl}/api/routine-shares/${share}/import`, {
              method: 'POST', headers: headersFor(sessions[1])
            });
            assert.equal(firstImport.status, 201);
            const firstRoutine = (await firstImport.json() as { routine: { id: string } }).routine;
            const retryImport = await fetch(`${baseUrl}/api/routine-shares/${share}/import`, {
              method: 'POST', headers: headersFor(sessions[1])
            });
            assert.equal(retryImport.status, 200);
            assert.equal((await retryImport.json() as { routine: { id: string } }).routine.id, firstRoutine.id);

            const idempotentDelete = await fetch(`${baseUrl}/api/sync`, {
              method: 'POST', headers: headersFor(sessions[0]),
              body: JSON.stringify({ deletedRoutineIds: ['74000000-0000-4000-8000-000000000001'] })
            });
            assert.equal(idempotentDelete.status, 200);
            assert.deepEqual((await idempotentDelete.json() as { deletedRoutineIds: string[] }).deletedRoutineIds, ['74000000-0000-4000-8000-000000000001']);

            // --- BLOCK 19.7C: Historical PR Security & Ownership Hardening ---
            const hprIdA = '75000000-0000-4000-8000-000000000001';
            const hprPayloadA = {
              id: hprIdA,
              userId: a,
              exerciseId: 'bench',
              performedDate: '2025-06-01',
              recordedAt: '2026-09-26T12:00:00.000Z',
              bodyweightKg: 75,
              set: {
                weightKg: 100,
                reps: 5,
                setType: 'working'
              }
            };

            // 1. User A syncs an HPR -> succeeds with 200
            const aHprSync = await fetch(`${baseUrl}/api/sync`, {
              method: 'POST',
              headers: headersFor(sessions[0]),
              body: JSON.stringify({ historicalPersonalRecords: [hprPayloadA] })
            });
            assert.equal(aHprSync.status, 200);
            const savedHprsA = await tx`SELECT id, user_id, weight_kg, reps FROM historical_personal_records WHERE id = ${hprIdA}`;
            assert.equal(savedHprsA.length, 1);
            assert.equal(savedHprsA[0].user_id, a);
            assert.equal(Number(savedHprsA[0].weight_kg), 100);

            // 2. User B attempts to overwrite User A's HPR -> 403 FORBIDDEN, User A's row untouched
            const bStealHpr = await fetch(`${baseUrl}/api/sync`, {
              method: 'POST',
              headers: headersFor(sessions[1]),
              body: JSON.stringify({
                historicalPersonalRecords: [{
                  ...hprPayloadA,
                  userId: b,
                  set: { weightKg: 150, reps: 5, setType: 'working' }
                }]
              })
            });
            assert.equal(bStealHpr.status, 403);
            const untouchedHpr = await tx`SELECT user_id, weight_kg FROM historical_personal_records WHERE id = ${hprIdA}`;
            assert.equal(untouchedHpr[0].user_id, a);
            assert.equal(Number(untouchedHpr[0].weight_kg), 100);

            // 3. User B attempts HPR using User A's private custom exercise -> 403 FORBIDDEN
            const customExA = 'custom-exercise-a';
            await tx`
              INSERT INTO exercises (id, user_id, name, primary_muscle, category, is_custom)
              VALUES (${customExA}, ${a}, 'User A Special Lift', 'chest', 'other', true)
              ON CONFLICT (id) DO NOTHING
            `;
            const bUseCustomA = await fetch(`${baseUrl}/api/sync`, {
              method: 'POST',
              headers: headersFor(sessions[1]),
              body: JSON.stringify({
                historicalPersonalRecords: [{
                  id: '75000000-0000-4000-8000-000000000002',
                  userId: b,
                  exerciseId: customExA,
                  performedDate: '2025-06-01',
                  recordedAt: '2026-09-26T12:00:00.000Z',
                  bodyweightKg: 80,
                  set: { weightKg: 50, reps: 5, setType: 'working' }
                }]
              })
            });
            assert.equal(bUseCustomA.status, 403);

            // 4. User A syncs the same HPR twice -> idempotent 200, updates with latest values
            const aHprUpdate = await fetch(`${baseUrl}/api/sync`, {
              method: 'POST',
              headers: headersFor(sessions[0]),
              body: JSON.stringify({
                historicalPersonalRecords: [{
                  ...hprPayloadA,
                  set: { weightKg: 105, reps: 5, setType: 'working' }
                }]
              })
            });
            assert.equal(aHprUpdate.status, 200);
            const updatedHprA = await tx`SELECT id, user_id, weight_kg FROM historical_personal_records WHERE id = ${hprIdA}`;
            assert.equal(updatedHprA.length, 1);
            assert.equal(Number(updatedHprA[0].weight_kg), 105);
          });
        } finally {
          restoreDb();
        }
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) throw error;
    }
  } finally {
    process.env.WEB_ORIGINS = previousOrigins;
    await sql.end();
  }
});
