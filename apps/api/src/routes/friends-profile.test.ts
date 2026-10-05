import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import dotenv from 'dotenv';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { lockPostgresFixture } from '../test-support/postgres-fixture-lock.js';
import {
  resolveCanonicalStrengthProjection,
  selectCanonicalPersonalRecordsByExercise,
  type FriendProfileProjection
} from '@light-weight/domain';
import { createApp } from '../app.js';
import { db, replaceDatabaseForTesting } from '../db/index.js';
import * as schema from '../db/schema.js';
import { hashOpaqueToken } from '../lib/auth-session.js';
import { loadFullUserTrainingProjection } from '../services/user-training-projection.js';

dotenv.config({ path: new URL('../../../.env', import.meta.url) });
dotenv.config();

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

function collectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((item) => collectKeys(item, keys));
  else if (value && typeof value === 'object') Object.entries(value).forEach(([key, item]) => {
    keys.add(key);
    collectKeys(item, keys);
  });
  return keys;
}

test('HTTP friend profile is accepted-friend-only, full-history authoritative, sanitized, and selection-exact', async (t) => {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) { t.skip('DATABASE_URL is not configured'); return; }
  const sql = postgres(connectionString, { max: 1, ssl: 'require' });
  const rollback = new Error('FRIEND_PROFILE_TEST_ROLLBACK');
  const requester = 'f0000000-0000-4000-8000-000000000001';
  const target = '10000000-0000-4000-8000-000000000002';
  const pendingIncoming = '20000000-0000-4000-8000-000000000003';
  const pendingOutgoing = '30000000-0000-4000-8000-000000000004';
  const unrelated = '40000000-0000-4000-8000-000000000005';
  const nonexistent = '50000000-0000-4000-8000-000000000006';
  const requesterToken = `friend-requester-${randomUUID()}`;
  const targetToken = `friend-target-${randomUUID()}`;
  const suffix = randomUUID();
  const bench = `friend-bench-${suffix}`;
  const row = `friend-row-${suffix}`;
  const squat = `friend-squat-${suffix}`;
  const press = `friend-press-${suffix}`;
  const custom = `friend-custom-${suffix}`;
  const previousOrigins = process.env.WEB_ORIGINS;
  process.env.WEB_ORIGINS = 'http://localhost:3000';

  try {
    try {
      await sql.begin(async (tx) => {
        await lockPostgresFixture(tx, 'shared');
        // Fixed identities also need per-fixture exclusion across duplicate runs.
        // Always acquire this AFTER the shared gate and BEFORE table access.
        await tx`SELECT pg_advisory_xact_lock(201, 10)`;
        Object.defineProperty(tx, 'options', { value: sql.options });
        Object.defineProperty(tx, 'begin', { value: async (callback: (client: typeof tx) => Promise<unknown>) => tx.savepoint(callback) });
        const restore = replaceDatabaseForTesting(drizzle(tx as never, { schema }) as typeof db);
        try {
          await tx`
            INSERT INTO users (id, email, username, display_name, gender) VALUES
              (${requester}, ${`requester-${suffix}@example.test`}, ${`requester_${suffix.slice(0, 8)}`}, 'Requester', 'female'),
              (${target}, ${`private-target-${suffix}@example.test`}, ${`target_${suffix.slice(0, 8)}`}, 'Target Athlete', 'male'),
              (${pendingIncoming}, ${`incoming-${suffix}@example.test`}, ${`incoming_${suffix.slice(0, 8)}`}, 'Incoming', 'male'),
              (${pendingOutgoing}, ${`outgoing-${suffix}@example.test`}, ${`outgoing_${suffix.slice(0, 8)}`}, 'Outgoing', 'male'),
              (${unrelated}, ${`unrelated-${suffix}@example.test`}, ${`unrelated_${suffix.slice(0, 8)}`}, 'Unrelated', 'male')
          `;
          await tx`
            INSERT INTO friendships (user_a_id, user_b_id, requester_id, status) VALUES
              (${target}, ${requester}, ${requester}, 'accepted'),
              (${pendingIncoming}, ${requester}, ${pendingIncoming}, 'pending'),
              (${pendingOutgoing}, ${requester}, ${requester}, 'pending')
          `;
          await tx`
            INSERT INTO exercises (id, user_id, name, primary_muscle, category, is_custom) VALUES
              (${bench}, NULL, 'Public Bench', 'chest', 'barbell', false),
              (${row}, NULL, 'Public Row', 'back', 'barbell', false),
              (${squat}, NULL, 'Public Squat', 'quadriceps', 'barbell', false),
              (${press}, NULL, 'Unselected Press', 'shoulders', 'barbell', false),
              (${custom}, ${target}, 'Private Custom Lift', 'chest', 'other', true)
          `;
          await tx`INSERT INTO bodyweight_logs (user_id, weight_kg, logged_at) VALUES (${target}, 80, '2023-12-31T12:00:00.000Z')`;

          const oldSession = randomUUID();
          await tx`INSERT INTO workout_sessions (id, user_id, started_at, performed_date, entry_source) VALUES (${oldSession}, ${target}, '2024-01-01T10:00:00.000Z', '2024-01-01', 'live')`;
          await tx`
            INSERT INTO logged_sets (session_id, exercise_id, set_index, weight_kg, reps, set_type, is_warmup, completed) VALUES
              (${oldSession}, ${bench}, 1, 100, 8, 'working', false, true),
              (${oldSession}, ${bench}, 2, 120, 1, 'working', false, true),
              (${oldSession}, ${row}, 1, 90, 5, 'working', false, true),
              (${oldSession}, ${squat}, 1, 80, 5, 'working', false, true),
              (${oldSession}, ${press}, 1, 70, 5, 'working', false, true),
              (${oldSession}, ${custom}, 1, 200, 1, 'working', false, true)
          `;
          for (let index = 0; index < 51; index += 1) {
            const sessionId = randomUUID();
            const startedAt = new Date(Date.UTC(2025, 0, index + 1, 10));
            await tx`INSERT INTO workout_sessions (id, user_id, started_at, performed_date, entry_source) VALUES (${sessionId}, ${target}, ${startedAt.toISOString()}, ${startedAt.toISOString().slice(0, 10)}, 'live')`;
            await tx`INSERT INTO logged_sets (session_id, exercise_id, set_index, weight_kg, reps, set_type, is_warmup, completed) VALUES (${sessionId}, ${bench}, 1, 40, 3, 'working', false, true)`;
          }
          await tx`
            INSERT INTO auth_sessions (user_id, token_hash, csrf_token_hash, expires_at) VALUES
              (${requester}, ${hashOpaqueToken(requesterToken)}, ${hashOpaqueToken(`csrf-${requesterToken}`)}, now() + interval '1 day'),
              (${target}, ${hashOpaqueToken(targetToken)}, ${hashOpaqueToken(`csrf-${targetToken}`)}, now() + interval '1 day')
          `;
          const headers = (token: string) => ({ origin: 'http://localhost:3000', cookie: `lw_session=${token}` });
          const profile = (baseUrl: string, userId: string, token = requesterToken) => fetch(
            `${baseUrl}/api/friends/${userId}/profile`, { headers: headers(token) }
          );

          await withServer(async (baseUrl) => {
            assert.equal((await fetch(`${baseUrl}/api/friends/${target}/profile`)).status, 401);
            assert.equal((await profile(baseUrl, 'invalid')).status, 422);

            for (const hiddenTarget of [pendingIncoming, pendingOutgoing, unrelated, nonexistent, requester]) {
              const response = await profile(baseUrl, hiddenTarget);
              assert.equal(response.status, 404);
              assert.deepEqual(await response.json(), { error: 'FRIEND_PROFILE_NOT_FOUND' });
            }

            const defaultResponse = await profile(baseUrl, target);
            assert.equal(defaultResponse.status, 200);
            const defaultPayload = await defaultResponse.json() as FriendProfileProjection;
            const training = await loadFullUserTrainingProjection(target);
            const canonicalStrength = resolveCanonicalStrengthProjection(training.history, training.exercisesById, {
              gender: training.gender,
              bodyweightEntries: training.bodyweightEntries,
              historicalPersonalRecords: training.historicalPersonalRecords
            });
            const canonicalDefaultIds = Object.values(selectCanonicalPersonalRecordsByExercise(training.history, {
              exercisesById: training.exercisesById,
              bodyweightEntries: training.bodyweightEntries,
              historicalPersonalRecords: training.historicalPersonalRecords
            }))
              .sort((left, right) => right.est1Rm - left.est1Rm)
              .slice(0, 3)
              .map((record) => record.exerciseId);
            assert.equal(defaultPayload.featuredPrs.length, 3);
            assert.deepEqual(defaultPayload.featuredPrs.map((item) => item.exercise.id), canonicalDefaultIds,
              'friend default showcase must match the canonical own-profile top three');
            assert.ok(defaultPayload.featuredPrs.some((item) => item.exercise.id === custom),
              'a custom exercise in the canonical top three must remain eligible');
            assert.equal(defaultPayload.featuredPrs.find((item) => item.exercise.id === bench)?.strengthRank, 'maestro',
              'old strength result outside newest 50 must remain authoritative');
            assert.deepEqual(defaultPayload.strength.overall, canonicalStrength.overall && {
              rank: canonicalStrength.overall.rank,
              overallScore: canonicalStrength.overall.overallScore,
              nextRank: canonicalStrength.overall.nextRank,
              progressPctToNextRank: canonicalStrength.overall.progressPctToNextRank,
              ratedMuscleCount: canonicalStrength.overall.ratedMuscleCount,
              totalMuscleCount: canonicalStrength.overall.totalMuscleCount,
              coveragePct: canonicalStrength.overall.coveragePct,
              isComplete: canonicalStrength.overall.isComplete
            });
            assert.equal(defaultPayload.strength.anatomy, 'male', 'anatomy is intentional public presentation metadata');
            assert.equal(defaultPayload.strengthRank, defaultPayload.strength.overall?.rank ?? null,
              'legacy strengthRank must remain an exact compatibility alias of authoritative strength.overall');
            assert.equal(defaultPayload.strength.muscleRanks.chest, canonicalStrength.byMuscle.chest?.evaluation.rank,
              'the old strength-defining chest observation outside the newest 50 sessions must color the public map');
            assert.equal(defaultPayload.strength.muscleRanks.back, canonicalStrength.byMuscle.back?.evaluation.rank);
            assert.equal(defaultPayload.strength.muscleRanks.forearms, undefined,
              'unevaluated muscles must stay absent instead of being fabricated as Novato');

            const musclePayload = JSON.stringify(defaultPayload.strength.muscleRanks);
            for (const privateMuscleField of [
              'evaluation', 'strengthEvaluation', 'strengthScore', 'currentRatio', 'oneRmKg',
              'bodyweightKg', 'targetRatio', 'targetOneRmKg', 'kgToNextRank',
              'progressPctToNextRank', 'topExerciseId', 'topExerciseName', 'performedAt',
              'exerciseName', 'exerciseId', 'workoutId', 'sessionId', 'sets', 'history'
            ]) {
              assert.ok(!musclePayload.includes(privateMuscleField),
                `public muscle ranks must not contain ${privateMuscleField}`);
            }
            assert.equal(defaultPayload.stats.totalWorkouts, 52);
            assert.ok(!JSON.stringify(defaultPayload).includes('Unselected Press'));
            const forbidden = ['email', 'birthDate', 'gender', 'currentBodyweightKg', 'bodyweightKg', 'bodyweightEntries',
              'history', 'sessions', 'sets', 'set', 'rir', 'rpe', 'effectiveLoadKg', 'preferences', 'routines', 'variants'];
            const responseKeys = collectKeys(defaultPayload);
            forbidden.forEach((key) => assert.ok(!responseKeys.has(key), `friend response must not contain ${key}`));

            await tx`INSERT INTO profile_featured_prs (user_id, slot, exercise_id, load_weight_kg) VALUES (${target}, 1, ${bench}, 100)`;
            const onePayload = await (await profile(baseUrl, target)).json() as FriendProfileProjection;
            assert.equal(onePayload.featuredPrs.length, 1);
            assert.equal(onePayload.featuredPrs[0].exercise.id, bench);
            assert.deepEqual(onePayload.featuredPrs[0].load, { type: 'weight', weightKg: 100, loadMode: 'total' });
            assert.equal(onePayload.featuredPrs[0].reps, 8);
            assert.ok(!JSON.stringify(onePayload).includes('"weightKg":120'));
            assert.ok(!JSON.stringify(onePayload).includes('Private Custom Lift'));
            assert.ok(!JSON.stringify(onePayload).includes('Unselected Press'));

            const improvedSession = randomUUID();
            await tx`INSERT INTO workout_sessions (id, user_id, started_at, performed_date, entry_source) VALUES (${improvedSession}, ${target}, '2026-09-01T10:00:00.000Z', '2026-09-01', 'live')`;
            await tx`INSERT INTO logged_sets (session_id, exercise_id, set_index, weight_kg, reps, set_type, is_warmup, completed) VALUES (${improvedSession}, ${bench}, 1, 100, 10, 'working', false, true)`;
            const improvedPayload = await (await profile(baseUrl, target)).json() as FriendProfileProjection;
            assert.equal(improvedPayload.featuredPrs[0].reps, 10);
            assert.equal(improvedPayload.featuredPrs[0].load.type === 'weight' ? improvedPayload.featuredPrs[0].load.weightKg : null, 100,
              'a better unselected load must not replace the configured load');

            await tx`INSERT INTO profile_featured_prs (user_id, slot, exercise_id, load_weight_kg) VALUES (${target}, 2, ${row}, 90)`;
            const twoPayload = await (await profile(baseUrl, target)).json() as FriendProfileProjection;
            assert.deepEqual(twoPayload.featuredPrs.map((item) => item.exercise.id), [bench, row]);

            await tx`INSERT INTO profile_featured_prs (user_id, slot, exercise_id, load_weight_kg) VALUES (${target}, 3, ${custom}, 200)`;
            const threePayload = await (await profile(baseUrl, target)).json() as FriendProfileProjection;
            assert.deepEqual(threePayload.featuredPrs.map((item) => item.exercise.id), [bench, row, custom]);
            assert.equal(threePayload.featuredPrs[2].exercise.name, 'Private Custom Lift', 'an explicitly selected custom exercise may expose only its card metadata');

            const ownAuthority = await fetch(`${baseUrl}/api/profile/featured-prs`, { headers: headers(targetToken) });
            assert.equal(ownAuthority.status, 200);
            const ownPayload = await ownAuthority.json() as { strengthRanksByExercise: Record<string, string> };
            assert.equal(ownPayload.strengthRanksByExercise[bench], 'maestro');

            await tx`DELETE FROM friendships WHERE user_a_id = ${target} AND user_b_id = ${requester}`;
            assert.equal((await profile(baseUrl, target)).status, 404, 'removing friendship must revoke access immediately');
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
