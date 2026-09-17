import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createApp } from '../app.js';
import { db, replaceDatabaseForTesting } from '../db/index.js';
import { hashOpaqueToken } from '../lib/auth-session.js';

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const server = createApp().listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  try {
    await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const sessionToken = 'mock-session-token';
const csrfToken = 'mock-csrf-token';
const hashedCsrf = hashOpaqueToken(csrfToken);
const userId = '00000000-0000-4000-8000-000000000001';

let lastInsertedExercise: any = null;

const mockDb = {
  select: () => ({
    from: () => ({
      innerJoin: () => ({
        where: () => ({
          limit: async () => [
            {
              session: {
                id: 'mock-session-id',
                userId,
                csrfTokenHash: hashedCsrf,
                expiresAt: new Date(Date.now() + 60_000)
              },
              user: {
                id: userId,
                email: 'athlete@example.test',
                username: 'athlete',
                displayName: 'Athlete',
                birthDate: null,
                gender: null,
                avatarUrl: null,
                createdAt: new Date('2026-01-01T00:00:00Z'),
                updatedAt: new Date('2026-01-01T00:00:00Z')
              }
            }
          ]
        })
      })
    })
  }),
  insert: () => ({
    values: (row: any) => ({
      returning: async () => {
        lastInsertedExercise = {
          ...row,
          createdAt: new Date('2026-01-01T00:00:00Z')
        };
        return [lastInsertedExercise];
      }
    })
  })
};

test('POST /api/exercises: custom bodyweight with loadMode = "assisted", bodyweightFactor = 1', async () => {
  const restoreDb = replaceDatabaseForTesting(mockDb as unknown as typeof db);
  try {
    await withServer(async (baseUrl) => {
      const payload = {
        name: 'Assisted Chin-up Custom',
        category: 'bodyweight',
        primaryMuscle: 'back',
        secondaryMuscles: ['biceps'],
        loading: {
          mechanism: 'bodyweight',
          loadMode: 'assisted',
          supportsKeyboard: true,
          supportsPlates: false,
          supportsExternalLoad: true,
          includeBarWeight: false,
          bodyweightFactor: 1
        }
      };

      const res = await fetch(`${baseUrl}/api/exercises`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `lw_session=${sessionToken}`,
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify(payload)
      });

      assert.equal(res.status, 201);
      const data = (await res.json()) as any;
      assert.equal(data.exercise.name, 'Assisted Chin-up Custom');
      assert.equal(data.exercise.loading.mechanism, 'bodyweight');
      assert.equal(data.exercise.loading.loadMode, 'assisted');
      assert.equal(data.exercise.loading.bodyweightFactor, 1);
      assert.equal(data.exercise.loading.supportsExternalLoad, true);

      // Verify DB persistence values
      assert.equal(lastInsertedExercise.loadMechanism, 'bodyweight');
      assert.equal(lastInsertedExercise.loadMode, 'assisted');
      assert.equal(lastInsertedExercise.bodyweightFactor, 1);
      assert.equal(lastInsertedExercise.userId, userId);
    });
  } finally {
    restoreDb();
  }
});

test('POST /api/exercises: added_weight with factor = 1 preserves factor in round-trip', async () => {
  const restoreDb = replaceDatabaseForTesting(mockDb as unknown as typeof db);
  try {
    await withServer(async (baseUrl) => {
      const payload = {
        name: 'Weighted Dip Custom',
        category: 'bodyweight',
        primaryMuscle: 'chest',
        secondaryMuscles: ['triceps'],
        loading: {
          mechanism: 'bodyweight',
          loadMode: 'added_weight',
          supportsKeyboard: true,
          supportsPlates: false,
          supportsExternalLoad: true,
          includeBarWeight: false,
          bodyweightFactor: 1
        }
      };

      const res = await fetch(`${baseUrl}/api/exercises`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `lw_session=${sessionToken}`,
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify(payload)
      });

      assert.equal(res.status, 201);
      const data = (await res.json()) as any;
      assert.equal(data.exercise.name, 'Weighted Dip Custom');
      assert.equal(data.exercise.loading.mechanism, 'bodyweight');
      assert.equal(data.exercise.loading.loadMode, 'added_weight');
      assert.equal(data.exercise.loading.bodyweightFactor, 1);

      assert.equal(lastInsertedExercise.loadMechanism, 'bodyweight');
      assert.equal(lastInsertedExercise.loadMode, 'added_weight');
      assert.equal(lastInsertedExercise.bodyweightFactor, 1);
    });
  } finally {
    restoreDb();
  }
});

test('POST /api/exercises: rejects invalid loading profile with 422', async () => {
  const restoreDb = replaceDatabaseForTesting(mockDb as unknown as typeof db);
  try {
    await withServer(async (baseUrl) => {
      const postExercise = async (loading: any) => {
        return fetch(`${baseUrl}/api/exercises`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            cookie: `lw_session=${sessionToken}`,
            'x-csrf-token': csrfToken
          },
          body: JSON.stringify({
            name: 'Validation Test Exercise',
            category: 'bodyweight',
            primaryMuscle: 'back',
            loading
          })
        });
      };

      const baseLoading = {
        supportsKeyboard: true,
        supportsPlates: false,
        supportsExternalLoad: true,
        includeBarWeight: false
      };

      // Unknown mechanism/mode
      const resGeneric = await postExercise({ mechanism: 'invalid_mech', loadMode: 'invalid_mode' });
      assert.equal(resGeneric.status, 422);
      assert.equal(((await resGeneric.json()) as any).error, 'INVALID_EXERCISE_LOADING_PROFILE');

      // assisted + factor undefined -> 422
      const resAssistedNoFactor = await postExercise({
        ...baseLoading,
        mechanism: 'bodyweight',
        loadMode: 'assisted'
      });
      assert.equal(resAssistedNoFactor.status, 422);

      // assisted + mechanism barbell + factor 1 -> 422
      const resAssistedBarbell = await postExercise({
        ...baseLoading,
        mechanism: 'barbell',
        loadMode: 'assisted',
        bodyweightFactor: 1
      });
      assert.equal(resAssistedBarbell.status, 422);

      // barbell + factor defined -> 422
      const resBarbellFactor = await postExercise({
        ...baseLoading,
        mechanism: 'barbell',
        loadMode: 'total',
        bodyweightFactor: 0.5
      });
      assert.equal(resBarbellFactor.status, 422);

      // factor 0 -> 422
      const resFactor0 = await postExercise({
        ...baseLoading,
        mechanism: 'bodyweight',
        loadMode: 'added_weight',
        bodyweightFactor: 0
      });
      assert.equal(resFactor0.status, 422);

      // factor -0.5 -> 422
      const resFactorNeg = await postExercise({
        ...baseLoading,
        mechanism: 'bodyweight',
        loadMode: 'added_weight',
        bodyweightFactor: -0.5
      });
      assert.equal(resFactorNeg.status, 422);

      // factor 1.1 -> 422
      const resFactorHigh = await postExercise({
        ...baseLoading,
        mechanism: 'bodyweight',
        loadMode: 'added_weight',
        bodyweightFactor: 1.1
      });
      assert.equal(resFactorHigh.status, 422);

      // bodyweight generic + factor undefined -> valid (201)
      const resGenericBw = await postExercise({
        ...baseLoading,
        mechanism: 'bodyweight',
        loadMode: 'added_weight'
      });
      assert.equal(resGenericBw.status, 201);
      const dataGenericBw = (await resGenericBw.json()) as any;
      assert.equal(dataGenericBw.exercise.loading.mechanism, 'bodyweight');
      assert.equal(dataGenericBw.exercise.loading.bodyweightFactor, undefined);

      // factor 0.5 + bodyweight -> valid (201)
      const resFactorHalf = await postExercise({
        ...baseLoading,
        mechanism: 'bodyweight',
        loadMode: 'added_weight',
        bodyweightFactor: 0.5
      });
      assert.equal(resFactorHalf.status, 201);
      const dataFactorHalf = (await resFactorHalf.json()) as any;
      assert.equal(dataFactorHalf.exercise.loading.mechanism, 'bodyweight');
      assert.equal(dataFactorHalf.exercise.loading.bodyweightFactor, 0.5);
    });
  } finally {
    restoreDb();
  }
});
