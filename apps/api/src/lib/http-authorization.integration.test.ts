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

test('HTTP authorization enforces ownership, recipient-only imports and idempotent tombstones', async (t) => {
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
    try {
      await sql.begin(async (tx) => {
        // Let Drizzle's nested transaction in the import handler reuse the
        // same rollback-only connection.
        Object.defineProperty(tx, 'options', { value: sql.options });
        Object.defineProperty(tx, 'begin', { value: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) });
        await tx.unsafe(migrationSql);
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
