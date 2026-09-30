import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createApp } from '../app.js';
import { db, replaceDatabaseForTesting } from '../db/index.js';
import * as schema from '../db/schema.js';
import { hashOpaqueToken } from '../lib/auth-session.js';
import { featuredPrValidation } from './profile.js';

dotenv.config({ path: new URL('../../../.env', import.meta.url) });
dotenv.config();

test('featured PR payload validation enforces slots, reps, uniqueness, IDs, and maximum three', () => {
  assert.deepEqual(featuredPrValidation.parseSelections([
    { slot: 2, exerciseId: 'row', repCount: 8 },
    { slot: 1, exerciseId: 'bench', repCount: 5 }
  ]), [
    { slot: 1, exerciseId: 'bench', repCount: 5 },
    { slot: 2, exerciseId: 'row', repCount: 8 }
  ]);
  const invalid = [
    [{ slot: 0, exerciseId: 'bench', repCount: 5 }],
    [{ slot: 4, exerciseId: 'bench', repCount: 5 }],
    [{ slot: 1, exerciseId: 'bench', repCount: 0 }],
    [{ slot: 1, exerciseId: 'bench', repCount: 13 }],
    [{ slot: 1, exerciseId: 'bad id', repCount: 5 }],
    [{ slot: 1, exerciseId: 'bench', repCount: 5 }, { slot: 1, exerciseId: 'row', repCount: 8 }],
    [{ slot: 1, exerciseId: 'bench', repCount: 5 }, { slot: 2, exerciseId: 'bench', repCount: 8 }],
    [1, 2, 3, 4].map((slot) => ({ slot, exerciseId: `ex-${slot}`, repCount: 5 }))
  ];
  invalid.forEach((payload) => assert.throws(() => featuredPrValidation.parseSelections(payload)));
});

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test('HTTP featured PR configuration is authenticated, owned, atomic, sorted, and cascade-safe', async (t) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) { t.skip('DATABASE_URL is not configured'); return; }
  const sql = postgres(connectionString, { max: 1, ssl: 'require' });
  const rollback = new Error('FEATURED_PR_TEST_ROLLBACK');
  const owner = randomUUID();
  const other = randomUUID();
  const ownerToken = `featured-owner-${randomUUID()}`;
  const ownerCsrf = `featured-csrf-${randomUUID()}`;
  const otherToken = `featured-other-${randomUUID()}`;
  const otherCsrf = `featured-other-csrf-${randomUUID()}`;
  const suffix = randomUUID();
  const systemExercise = `featured-system-${suffix}`;
  const secondSystemExercise = `featured-system-two-${suffix}`;
  const ownedExercise = `featured-owned-${suffix}`;
  const foreignExercise = `featured-foreign-${suffix}`;
  const previousOrigins = process.env.WEB_ORIGINS;
  process.env.WEB_ORIGINS = 'http://localhost:3000';

  try {
    const migration = await readFile(new URL('../../drizzle/0012_featured_pr_showcase_v1.sql', import.meta.url), 'utf8');
    try {
      await sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(198, 32)`;
        Object.defineProperty(tx, 'options', { value: sql.options });
        Object.defineProperty(tx, 'begin', { value: async (callback: (client: typeof tx) => Promise<unknown>) => tx.savepoint(callback) });
        await tx.unsafe(migration);
        const restore = replaceDatabaseForTesting(drizzle(tx as never, { schema }) as typeof db);
        try {
          await tx`
            INSERT INTO users (id, email, username, display_name) VALUES
              (${owner}, ${`featured-owner-${suffix}@example.test`}, ${`featured_owner_${suffix.slice(0, 8)}`}, 'Owner'),
              (${other}, ${`featured-other-${suffix}@example.test`}, ${`featured_other_${suffix.slice(0, 8)}`}, 'Other')
          `;
          await tx`
            INSERT INTO exercises (id, user_id, name, primary_muscle, category, is_custom) VALUES
              (${systemExercise}, NULL, 'System exercise', 'chest', 'barbell', false),
              (${secondSystemExercise}, NULL, 'Second system exercise', 'legs', 'machine', false),
              (${ownedExercise}, ${owner}, 'Owned custom', 'back', 'other', true),
              (${foreignExercise}, ${other}, 'Foreign custom', 'back', 'other', true)
          `;
          await tx`
            INSERT INTO profile_featured_prs (user_id, slot, exercise_id, rep_count)
            VALUES (${owner}, 1, ${systemExercise}, 5)
          `;
          for (const invalidInsert of [
            () => tx`INSERT INTO profile_featured_prs (user_id, slot, exercise_id, rep_count) VALUES (${owner}, 0, ${ownedExercise}, 5)`,
            () => tx`INSERT INTO profile_featured_prs (user_id, slot, exercise_id, rep_count) VALUES (${owner}, 4, ${ownedExercise}, 5)`,
            () => tx`INSERT INTO profile_featured_prs (user_id, slot, exercise_id, rep_count) VALUES (${owner}, 2, ${ownedExercise}, 0)`,
            () => tx`INSERT INTO profile_featured_prs (user_id, slot, exercise_id, rep_count) VALUES (${owner}, 2, ${ownedExercise}, 13)`,
            () => tx`INSERT INTO profile_featured_prs (user_id, slot, exercise_id, rep_count) VALUES (${owner}, 1, ${ownedExercise}, 5)`,
            () => tx`INSERT INTO profile_featured_prs (user_id, slot, exercise_id, rep_count) VALUES (${owner}, 2, ${systemExercise}, 5)`
          ]) {
            await assert.rejects(tx.savepoint(async () => invalidInsert()));
          }
          await tx`DELETE FROM profile_featured_prs WHERE user_id = ${owner}`;
          await tx`
            INSERT INTO auth_sessions (user_id, token_hash, csrf_token_hash, expires_at) VALUES
              (${owner}, ${hashOpaqueToken(ownerToken)}, ${hashOpaqueToken(ownerCsrf)}, now() + interval '1 day'),
              (${other}, ${hashOpaqueToken(otherToken)}, ${hashOpaqueToken(otherCsrf)}, now() + interval '1 day')
          `;
          const headers = (token: string, csrf?: string) => ({
            origin: 'http://localhost:3000',
            cookie: `lw_session=${token}${csrf ? `; lw_csrf=${csrf}` : ''}`,
            ...(csrf ? { 'x-csrf-token': csrf } : {}),
            'content-type': 'application/json'
          });

          await withServer(async (baseUrl) => {
            assert.equal((await fetch(`${baseUrl}/api/profile/featured-prs`)).status, 401);
            assert.equal((await fetch(`${baseUrl}/api/profile/featured-prs`, {
              method: 'PUT', headers: headers(ownerToken), body: JSON.stringify({ selections: [] })
            })).status, 403);

            const first = await fetch(`${baseUrl}/api/profile/featured-prs`, {
              method: 'PUT', headers: headers(ownerToken, ownerCsrf),
              body: JSON.stringify({ selections: [
                { slot: 3, exerciseId: ownedExercise, repCount: 8 },
                { slot: 1, exerciseId: systemExercise, repCount: 5 }
              ] })
            });
            assert.equal(first.status, 200);
            assert.deepEqual((await first.json() as { selections: Array<{ slot: number }> }).selections.map((item) => item.slot), [1, 3]);

            const single = await fetch(`${baseUrl}/api/profile/featured-prs`, {
              method: 'PUT', headers: headers(ownerToken, ownerCsrf),
              body: JSON.stringify({ selections: [{ slot: 2, exerciseId: systemExercise, repCount: 1 }] })
            });
            assert.equal(single.status, 200);
            assert.deepEqual((await single.json() as { selections: unknown[] }).selections, [
              { slot: 2, exerciseId: systemExercise, repCount: 1 }
            ]);

            const allThree = await fetch(`${baseUrl}/api/profile/featured-prs`, {
              method: 'PUT', headers: headers(ownerToken, ownerCsrf),
              body: JSON.stringify({ selections: [
                { slot: 3, exerciseId: ownedExercise, repCount: 12 },
                { slot: 1, exerciseId: systemExercise, repCount: 5 },
                { slot: 2, exerciseId: secondSystemExercise, repCount: 8 }
              ] })
            });
            assert.equal(allThree.status, 200);
            assert.deepEqual((await allThree.json() as { selections: Array<{ slot: number }> }).selections.map((item) => item.slot), [1, 2, 3]);

            const foreign = await fetch(`${baseUrl}/api/profile/featured-prs`, {
              method: 'PUT', headers: headers(ownerToken, ownerCsrf),
              body: JSON.stringify({ selections: [{ slot: 1, exerciseId: foreignExercise, repCount: 5 }] })
            });
            assert.equal(foreign.status, 403);
            const preserved = await fetch(`${baseUrl}/api/profile/featured-prs`, { headers: headers(ownerToken, ownerCsrf) });
            assert.deepEqual((await preserved.json() as { selections: Array<{ exerciseId: string }> }).selections.map((item) => item.exerciseId), [systemExercise, secondSystemExercise, ownedExercise]);

            const otherOwn = await fetch(`${baseUrl}/api/profile/featured-prs`, { headers: headers(otherToken, otherCsrf) });
            assert.deepEqual((await otherOwn.json() as { selections: unknown[] }).selections, []);

            await tx`DELETE FROM users WHERE id = ${owner}`;
            assert.equal((await tx`SELECT id FROM profile_featured_prs WHERE user_id = ${owner}`).length, 0);
          });
        } finally { restore(); }
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
  } finally {
    if (previousOrigins === undefined) delete process.env.WEB_ORIGINS;
    else process.env.WEB_ORIGINS = previousOrigins;
    await sql.end();
  }
});
