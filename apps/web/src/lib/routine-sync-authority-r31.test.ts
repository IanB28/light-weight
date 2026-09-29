import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeRoutineId, normalizeRoutine, type Routine } from '@light-weight/domain';
import { pullFromCloud, syncWithCloud } from './sync.js';
import { getStoredPendingRoutineUpsertIds, getStoredRoutines, getStoredWeeklySchedule,
  normalizeStoredActiveWorkout, saveStoredRoutines, addStoredPendingRoutineUpserts,
  removeStoredPendingRoutineUpserts, STORAGE_KEYS } from './storage.js';
import { serializeRoutineForSync } from './routine-sync.js';

const postgresId = '00000000-0000-0000-0000-000000000010';
const otherId = '00000000-0000-0000-0000-000000000011';
const PULL_URL = 'http://localhost:4000/api/sync/pull';
const PUSH_URL = 'http://localhost:4000/api/sync';
const routine = (id: string, name = 'Push'): Routine => normalizeRoutine({
  id, userId: 'athlete', name, exerciseIds: ['bench']
})!;

async function withBrowserStorage(run: (values: Map<string, string>) => Promise<void> | void) {
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const fetchDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'fetch');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  } });
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true } });
  try { await run(values); } finally {
    for (const [name, descriptor] of [['localStorage', storageDescriptor], ['navigator', navigatorDescriptor],
      ['fetch', fetchDescriptor]] as const) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
}

test('PostgreSQL routine UUID survives storage, schedule, active workout and serialization unchanged', async () => {
  await withBrowserStorage((values) => {
    values.set(STORAGE_KEYS.ROUTINES, JSON.stringify([routine(postgresId)]));
    values.set(STORAGE_KEYS.WEEKLY_SCHEDULE, JSON.stringify({ monday: postgresId }));
    assert.equal(getStoredRoutines()[0].id, postgresId);
    assert.equal(getStoredWeeklySchedule().monday, postgresId);
    assert.equal(normalizeStoredActiveWorkout({ activeRoutineId: postgresId }).activeRoutineId, postgresId);
    assert.equal(serializeRoutineForSync(getStoredRoutines()[0]).id, postgresId);
    assert.equal(canonicalizeRoutineId(postgresId), postgresId);
  });
});

test('cross-device deletion removes non-pending cached routine and later push cannot resurrect it', async () => {
  await withBrowserStorage(async (values) => {
    values.set(STORAGE_KEYS.ROUTINES, JSON.stringify([routine(postgresId)]));
    values.set(STORAGE_KEYS.WEEKLY_SCHEDULE, JSON.stringify({ monday: postgresId }));
    values.set(STORAGE_KEYS.PENDING_ROUTINE_UPSERTS, JSON.stringify({ ids: [], initialCloudReconciled: true }));
    const posted: Array<{ routines: unknown[] }> = [];
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (_url: string, init: RequestInit) => {
      if (init.method === 'POST') {
        posted.push(JSON.parse(String(init.body)));
        return Response.json({ syncedCount: 0, deletedRoutineIds: [] });
      }
      return Response.json({ routines: [] });
    } });
    assert.equal((await pullFromCloud(PULL_URL)).ok, true);
    assert.deepEqual(getStoredRoutines(), []);
    assert.equal(getStoredWeeklySchedule().monday, null);
    assert.equal((await syncWithCloud(PUSH_URL)).ok, true);
    assert.deepEqual(posted[0]?.routines, []);
  });
});

test('pending offline routine survives empty pull, uploads once and ACK clears only that version', async () => {
  await withBrowserStorage(async () => {
    saveStoredRoutines([routine(otherId)]);
    addStoredPendingRoutineUpserts([otherId]);
    const posted: Array<{ routines: Array<{ id: string }> }> = [];
    let uploaded = false;
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (_url: string, init: RequestInit) => {
      if (init.method === 'POST') {
        posted.push(JSON.parse(String(init.body)));
        uploaded = true;
        return Response.json({ syncedCount: 0, deletedRoutineIds: [] });
      }
      return Response.json({ routines: uploaded ? [routine(otherId)] : [] });
    } });
    assert.equal((await pullFromCloud(PULL_URL)).ok, true);
    assert.deepEqual(getStoredRoutines().map((item) => item.id), [otherId]);
    assert.equal((await syncWithCloud(PUSH_URL)).ok, true);
    assert.deepEqual(posted[0]?.routines.map((item) => item.id), [otherId]);
    assert.deepEqual(getStoredPendingRoutineUpsertIds(), []);
    assert.equal((await pullFromCloud(PULL_URL)).ok, true);
    assert.deepEqual(getStoredRoutines().map((item) => item.id), [otherId]);
  });
});

test('a newer edit during in-flight sync remains pending after older payload succeeds', async () => {
  await withBrowserStorage(async () => {
    saveStoredRoutines([routine(otherId, 'Old')]);
    addStoredPendingRoutineUpserts([otherId]);
    let resolveRequest!: (response: Response) => void;
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async () =>
      new Promise<Response>((resolve) => { resolveRequest = resolve; }) });
    const upload = syncWithCloud(PUSH_URL);
    saveStoredRoutines([routine(otherId, 'New')]);
    resolveRequest(Response.json({ syncedCount: 0, deletedRoutineIds: [] }));
    assert.equal((await upload).ok, true);
    assert.deepEqual(getStoredPendingRoutineUpsertIds(), [otherId]);
  });
});

test('pre-R3 legacy routine is promoted pending before canonical storage rewrite', async () => {
  await withBrowserStorage(async (values) => {
    values.set(STORAGE_KEYS.ROUTINES, JSON.stringify([routine('rt-123')]));
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async () => Response.json({ routines: [] }) });
    assert.equal((await pullFromCloud(PULL_URL)).ok, true);
    const canonicalId = canonicalizeRoutineId('rt-123');
    assert.deepEqual(getStoredRoutines().map((item) => item.id), [canonicalId]);
    assert.deepEqual(getStoredPendingRoutineUpsertIds(), [canonicalId]);
    removeStoredPendingRoutineUpserts([canonicalId]);
  });
});

test('first cloud pull marks a differing pre-outbox local edit pending without merging by name', async () => {
  await withBrowserStorage(async (values) => {
    values.set(STORAGE_KEYS.ROUTINES, JSON.stringify([routine(postgresId, 'Locally edited')]));
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async () => Response.json({
      routines: [routine(postgresId, 'Cloud'), routine(otherId, 'Locally edited')]
    }) });
    assert.equal((await pullFromCloud(PULL_URL)).ok, true);
    assert.equal(getStoredRoutines().length, 2);
    assert.equal(getStoredRoutines().find((item) => item.id === postgresId)?.name, 'Locally edited');
    assert.deepEqual(getStoredPendingRoutineUpsertIds(), [postgresId]);
  });
});
