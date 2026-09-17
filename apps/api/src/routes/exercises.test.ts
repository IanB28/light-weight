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
      const res = await fetch(`${baseUrl}/api/exercises`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          cookie: `lw_session=${sessionToken}`,
          'x-csrf-token': csrfToken
        },
        body: JSON.stringify({
          name: 'Invalid Loading Ex',
          category: 'other',
          primaryMuscle: 'core',
          loading: { mechanism: 'invalid_mech', loadMode: 'invalid_mode' }
        })
      });

      assert.equal(res.status, 422);
      const data = (await res.json()) as any;
      assert.equal(data.error, 'INVALID_EXERCISE_LOADING_PROFILE');
    });
  } finally {
    restoreDb();
  }
});
