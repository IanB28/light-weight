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

test('featured PR payload validation enforces slots, normalized loads, uniqueness, IDs, and maximum three', () => {
  assert.deepEqual(featuredPrValidation.parseSelections([
    { slot: 2, exerciseId: 'row', loadWeightKg: 80.004 },
    { slot: 1, exerciseId: 'bench', loadWeightKg: 100 }
  ]), [
    { slot: 1, exerciseId: 'bench', loadWeightKg: 100 },
    { slot: 2, exerciseId: 'row', loadWeightKg: 80 }
  ]);
  const invalid = [
    [{ slot: 0, exerciseId: 'bench', loadWeightKg: 100 }],
    [{ slot: 4, exerciseId: 'bench', loadWeightKg: 100 }],
    [{ slot: 1, exerciseId: 'bench', loadWeightKg: -1 }],
    [{ slot: 1, exerciseId: 'bench', loadWeightKg: Number.NaN }],
    [{ slot: 1, exerciseId: 'bench', repCount: 8 }],
    [{ slot: 1, exerciseId: 'bad id', loadWeightKg: 100 }],
    [{ slot: 1, exerciseId: 'bench', loadWeightKg: 100 }, { slot: 1, exerciseId: 'row', loadWeightKg: 80 }],
    [{ slot: 1, exerciseId: 'bench', loadWeightKg: 100 }, { slot: 2, exerciseId: 'bench', loadWeightKg: 120 }],
    [1, 2, 3, 4].map((slot) => ({ slot, exerciseId: `ex-${slot}`, loadWeightKg: 50 }))
  ];
  invalid.forEach((payload) => assert.throws(() => featuredPrValidation.parseSelections(payload)));
  assert.deepEqual(featuredPrValidation.parseSelections([{ slot: 1, exerciseId: 'bodyweight', loadWeightKg: 0 }]), [
    { slot: 1, exerciseId: 'bodyweight', loadWeightKg: 0 }
  ]);
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
            INSERT INTO profile_featured_prs (user_id, slot, exercise_id, load_weight_kg)
            VALUES (${owner}, 1, ${systemExercise}, 100)
          `;
          for (const invalidInsert of [
            () => tx`INSERT INTO profile_featured_prs (user_id, slot, exercise_id, load_weight_kg) VALUES (${owner}, 0, ${ownedExercise}, 50)`,
            () => tx`INSERT INTO profile_featured_prs (user_id, slot, exercise_id, load_weight_kg) VALUES (${owner}, 4, ${ownedExercise}, 50)`,
            () => tx`INSERT INTO profile_featured_prs (user_id, slot, exercise_id, load_weight_kg) VALUES (${owner}, 2, ${ownedExercise}, -1)`,
            () => tx`INSERT INTO profile_featured_prs (user_id, slot, exercise_id, load_weight_kg) VALUES (${owner}, 1, ${ownedExercise}, 50)`,
            () => tx`INSERT INTO profile_featured_prs (user_id, slot, exercise_id, load_weight_kg) VALUES (${owner}, 2, ${systemExercise}, 50)`
          ]) {
            await assert.rejects(tx.savepoint(async () => invalidInsert()));
          }
          await tx`DELETE FROM profile_featured_prs WHERE user_id = ${owner}`;
          const oldTopSessionId = randomUUID();
          await tx`
            INSERT INTO workout_sessions (id, user_id, started_at, performed_date, entry_source)
            VALUES (${oldTopSessionId}, ${owner}, ${'2024-01-01T10:00:00.000Z'}, '2024-01-01', 'live')
          `;
          await tx`
            INSERT INTO logged_sets (session_id, exercise_id, set_index, weight_kg, reps, set_type, is_warmup, completed)
            VALUES (${oldTopSessionId}, ${systemExercise}, 1, 100, 8, 'working', false, true)
          `;
          for (let index = 0; index < 50; index += 1) {
            const recentSessionId = randomUUID();
            const startedAt = new Date(Date.UTC(2025, 0, index + 1, 10));
            await tx`
              INSERT INTO workout_sessions (id, user_id, started_at, performed_date, entry_source)
              VALUES (${recentSessionId}, ${owner}, ${startedAt.toISOString()}, ${startedAt.toISOString().slice(0, 10)}, 'live')
            `;
            await tx`
              INSERT INTO logged_sets (session_id, exercise_id, set_index, weight_kg, reps, set_type, is_warmup, completed)
              VALUES (${recentSessionId}, ${systemExercise}, 1, 60, 5, 'working', false, true)
            `;
          }
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
                { slot: 3, exerciseId: ownedExercise, loadWeightKg: 80 },
                { slot: 1, exerciseId: systemExercise, loadWeightKg: 100 }
              ] })
            });
            assert.equal(first.status, 200);
            const firstPayload = await first.json() as {
              selections: Array<{ slot: number }>;
              variants: Array<{ exerciseId: string; loadWeightKg: number; reps: number }>;
            };
            assert.deepEqual(firstPayload.selections.map((item) => item.slot), [1, 3]);
            assert.equal(firstPayload.variants.find((item) => item.exerciseId === systemExercise && item.loadWeightKg === 100)?.reps, 8,
              'complete-history resolver must retain a top set older than the newest 50 sessions');

            const improvedSessionId = randomUUID();
            await tx`
              INSERT INTO workout_sessions (id, user_id, started_at, performed_date, entry_source)
              VALUES (${improvedSessionId}, ${owner}, ${'2026-03-01T10:00:00.000Z'}, '2026-03-01', 'live')
            `;
            await tx`
              INSERT INTO logged_sets (session_id, exercise_id, set_index, weight_kg, reps, set_type, is_warmup, completed)
              VALUES (${improvedSessionId}, ${systemExercise}, 1, 100, 10, 'working', false, true)
            `;
            const improved = await fetch(`${baseUrl}/api/profile/featured-prs`, { headers: headers(ownerToken, ownerCsrf) });
            const improvedPayload = await improved.json() as { variants: Array<{ exerciseId: string; loadWeightKg: number; reps: number }> };
            assert.equal(improvedPayload.variants.find((item) => item.exerciseId === systemExercise && item.loadWeightKg === 100)?.reps, 10,
              'selected load variant must automatically resolve to its improved performance');

            const single = await fetch(`${baseUrl}/api/profile/featured-prs`, {
              method: 'PUT', headers: headers(ownerToken, ownerCsrf),
              body: JSON.stringify({ selections: [{ slot: 2, exerciseId: systemExercise, loadWeightKg: 0 }] })
            });
            assert.equal(single.status, 200);
            assert.deepEqual((await single.json() as { selections: unknown[] }).selections, [
              { slot: 2, exerciseId: systemExercise, loadWeightKg: 0 }
            ]);

            const allThree = await fetch(`${baseUrl}/api/profile/featured-prs`, {
              method: 'PUT', headers: headers(ownerToken, ownerCsrf),
              body: JSON.stringify({ selections: [
                { slot: 3, exerciseId: ownedExercise, loadWeightKg: 70 },
                { slot: 1, exerciseId: systemExercise, loadWeightKg: 100 },
                { slot: 2, exerciseId: secondSystemExercise, loadWeightKg: 120 }
              ] })
            });
            assert.equal(allThree.status, 200);
            assert.deepEqual((await allThree.json() as { selections: Array<{ slot: number }> }).selections.map((item) => item.slot), [1, 2, 3]);

            const foreign = await fetch(`${baseUrl}/api/profile/featured-prs`, {
              method: 'PUT', headers: headers(ownerToken, ownerCsrf),
              body: JSON.stringify({ selections: [{ slot: 1, exerciseId: foreignExercise, loadWeightKg: 50 }] })
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
