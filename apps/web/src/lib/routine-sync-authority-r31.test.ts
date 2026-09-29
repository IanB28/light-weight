import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalizeRoutineId, normalizeRoutine, type Routine } from '@light-weight/domain';
import { pullFromCloud, pullThenDrainRoutineOutbox, subscribeToSyncStatus, syncWithCloud } from './sync.js';
import { getStoredPendingRoutineUpsertIds, getStoredRoutines, getStoredWeeklySchedule,
  normalizeStoredActiveWorkout, saveStoredRoutines, addStoredPendingRoutineUpserts,
  removeStoredPendingRoutineUpserts, addStoredDeletedRoutineId, getStoredDeletedRoutineIds,
  STORAGE_KEYS } from './storage.js';
import { serializeRoutineForSync } from './routine-sync.js';

const postgresId = '00000000-0000-0000-0000-000000000010';
const otherId = '00000000-0000-0000-0000-000000000011';
const PULL_URL = 'http://localhost:4000/api/sync/pull';
const PUSH_URL = 'http://localhost:4000/api/sync';
const routine = (id: string, name = 'Push'): Routine => normalizeRoutine({
  id, userId: 'athlete', name, exerciseIds: ['bench']
})!;

function markRoutineCloudReconciled(values: Map<string, string>) {
  values.set(STORAGE_KEYS.PENDING_ROUTINE_UPSERTS, JSON.stringify({ ids: [], initialCloudReconciled: true }));
}

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
  await withBrowserStorage(async (values) => {
    markRoutineCloudReconciled(values);
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

test('CASE 1/5: edit during upload automatically posts the newer snapshot and clears it only after ACK', async () => {
  await withBrowserStorage(async (values) => {
    markRoutineCloudReconciled(values);
    saveStoredRoutines([routine(otherId, 'A')]);
    addStoredPendingRoutineUpserts([otherId]);
    const posted: Array<{ routines: Array<{ id: string; name: string }> }> = [];
    let resolveFirst!: (response: Response) => void;
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (_url: string, init: RequestInit) => {
      posted.push(JSON.parse(String(init.body)));
      if (posted.length === 1) return new Promise<Response>((resolve) => { resolveFirst = resolve; });
      return Response.json({ syncedCount: 0, deletedRoutineIds: [] });
    } });

    const firstDrain = syncWithCloud(PUSH_URL);
    saveStoredRoutines([routine(otherId, 'B')]);
    addStoredPendingRoutineUpserts([otherId]);
    const queuedDrain = syncWithCloud(PUSH_URL);
    assert.equal(queuedDrain, firstDrain);
    resolveFirst(Response.json({ syncedCount: 0, deletedRoutineIds: [] }));
    assert.equal((await firstDrain).ok, true);
    assert.deepEqual(posted.map((payload) => payload.routines[0]?.name), ['A', 'B']);
    assert.deepEqual(getStoredPendingRoutineUpsertIds(), []);
  });
});

test('CASE 2: delete during upload is automatically sent and tombstone clears only after server ACK', async () => {
  await withBrowserStorage(async (values) => {
    markRoutineCloudReconciled(values);
    saveStoredRoutines([routine(otherId, 'A')]);
    addStoredPendingRoutineUpserts([otherId]);
    const posted: Array<{ deletedRoutineIds: string[] }> = [];
    let resolveFirst!: (response: Response) => void;
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (_url: string, init: RequestInit) => {
      posted.push(JSON.parse(String(init.body)));
      if (posted.length === 1) return new Promise<Response>((resolve) => { resolveFirst = resolve; });
      return Response.json({ syncedCount: 0, deletedRoutineIds: [otherId] });
    } });

    const drain = syncWithCloud(PUSH_URL);
    saveStoredRoutines([]);
    removeStoredPendingRoutineUpserts([otherId]);
    addStoredDeletedRoutineId(otherId);
    void syncWithCloud(PUSH_URL);
    resolveFirst(Response.json({ syncedCount: 0, deletedRoutineIds: [] }));
    assert.equal((await drain).ok, true);
    assert.deepEqual(posted.map((payload) => payload.deletedRoutineIds), [[], [otherId]]);
    assert.deepEqual(getStoredDeletedRoutineIds(), []);
  });
});

test('CASE 3: authenticated startup pulls first, preserves an offline routine, then drains its outbox', async () => {
  await withBrowserStorage(async () => {
    saveStoredRoutines([routine(otherId, 'Offline')]);
    addStoredPendingRoutineUpserts([otherId]);
    const methods: string[] = [];
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (_url: string, init: RequestInit = {}) => {
      methods.push(init.method ?? 'GET');
      if (init.method === 'POST') return Response.json({ syncedCount: 0, deletedRoutineIds: [] });
      return Response.json({ routines: [] });
    } });

    const result = await pullThenDrainRoutineOutbox({ pull: PULL_URL, push: PUSH_URL });
    assert.equal(result.ok, true);
    assert.deepEqual(methods, ['GET', 'POST']);
    assert.deepEqual(getStoredRoutines().map((item) => item.id), [otherId]);
    assert.deepEqual(getStoredPendingRoutineUpsertIds(), []);
  });
});

test('R3.2.1: a direct routine sync waits for startup reconciliation and posts the latest local edit', async () => {
  await withBrowserStorage(async () => {
    const methods: string[] = [];
    const postedNames: string[] = [];
    let resolvePull!: (response: Response) => void;
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (_url: string, init: RequestInit = {}) => {
      methods.push(init.method ?? 'GET');
      if (init.method !== 'POST') return new Promise<Response>((resolve) => { resolvePull = resolve; });
      const payload = JSON.parse(String(init.body)) as { routines: Array<{ name: string }> };
      postedNames.push(payload.routines[0]?.name);
      return Response.json({ syncedCount: 0, deletedRoutineIds: [] });
    } });

    const startup = pullThenDrainRoutineOutbox({ pull: PULL_URL, push: PUSH_URL });
    assert.deepEqual(methods, ['GET']);
    saveStoredRoutines([routine(otherId, 'Latest local edit')]);
    addStoredPendingRoutineUpserts([otherId]);
    const directSync = syncWithCloud(PUSH_URL);
    assert.deepEqual(methods, ['GET'], 'POST must wait for the initial GET');
    resolvePull(Response.json({ routines: [] }));
    assert.equal((await directSync).ok, true);
    assert.equal((await startup).ok, true);
    assert.deepEqual(methods, ['GET', 'POST']);
    assert.deepEqual(postedNames, ['Latest local edit']);
    assert.deepEqual(getStoredPendingRoutineUpsertIds(), []);
  });
});

test('R3.2.1: deletion during startup pull waits, then drains its tombstone after ACK', async () => {
  await withBrowserStorage(async () => {
    saveStoredRoutines([routine(otherId)]);
    const methods: string[] = [];
    let resolvePull!: (response: Response) => void;
    let resolvePost!: (response: Response) => void;
    let markPostStarted!: () => void;
    const postStarted = new Promise<void>((resolve) => { markPostStarted = resolve; });
    let postedDeletion: string[] = [];
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (_url: string, init: RequestInit = {}) => {
      methods.push(init.method ?? 'GET');
      if (init.method !== 'POST') return new Promise<Response>((resolve) => { resolvePull = resolve; });
      postedDeletion = (JSON.parse(String(init.body)) as { deletedRoutineIds: string[] }).deletedRoutineIds;
      markPostStarted();
      return new Promise<Response>((resolve) => { resolvePost = resolve; });
    } });

    const startup = pullThenDrainRoutineOutbox({ pull: PULL_URL, push: PUSH_URL });
    saveStoredRoutines([]);
    removeStoredPendingRoutineUpserts([otherId]);
    addStoredDeletedRoutineId(otherId);
    const directSync = syncWithCloud(PUSH_URL);
    assert.deepEqual(methods, ['GET']);
    resolvePull(Response.json({ routines: [routine(otherId)] }));
    await postStarted;
    assert.deepEqual(methods, ['GET', 'POST']);
    assert.deepEqual(postedDeletion, [otherId]);
    assert.deepEqual(getStoredDeletedRoutineIds(), [otherId], 'tombstone must remain until ACK');
    resolvePost(Response.json({ syncedCount: 0, deletedRoutineIds: [otherId] }));
    assert.equal((await directSync).ok, true);
    assert.equal((await startup).ok, true);
    assert.deepEqual(getStoredDeletedRoutineIds(), []);
    assert.deepEqual(getStoredRoutines(), []);
  });
});

test('R3.2.1: failed initial pull prevents routine POST and retains pending work', async () => {
  await withBrowserStorage(async () => {
    saveStoredRoutines([routine(otherId)]);
    addStoredPendingRoutineUpserts([otherId]);
    const methods: string[] = [];
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (_url: string, init: RequestInit = {}) => {
      methods.push(init.method ?? 'GET');
      return Response.json({ error: 'SERVER_ERROR' }, { status: 500 });
    } });
    const startup = pullThenDrainRoutineOutbox({ pull: PULL_URL, push: PUSH_URL });
    assert.equal((await syncWithCloud(PUSH_URL)).ok, false);
    assert.equal((await startup).ok, false);
    assert.deepEqual(methods, ['GET']);
    assert.deepEqual(getStoredPendingRoutineUpsertIds(), [otherId]);
  });
});

test('R3.2.1: failed drain still hydrates after pull while preserving error status and outbox', async () => {
  await withBrowserStorage(async () => {
    saveStoredRoutines([routine(otherId)]);
    addStoredPendingRoutineUpserts([otherId]);
    const statuses: string[] = [];
    const unsubscribe = subscribeToSyncStatus((status) => statuses.push(status.state));
    try {
      Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async (_url: string, init: RequestInit = {}) =>
        init.method === 'POST'
          ? Response.json({ error: 'SERVER_ERROR' }, { status: 500 })
          : Response.json({ routines: [] }) });
      const result = await pullThenDrainRoutineOutbox({ pull: PULL_URL, push: PUSH_URL });
      assert.equal(result.ok, true, 'the result describes the successful hydration pull');
      assert.equal(statuses.at(-1), 'error');
      assert.deepEqual(getStoredPendingRoutineUpsertIds(), [otherId]);
      assert.deepEqual(getStoredRoutines().map((item) => item.id), [otherId]);
    } finally {
      unsubscribe();
    }
  });
});

test('CASE 6: a failed follow-up keeps the newer routine pending without busy-looping and can retry later', async () => {
  await withBrowserStorage(async (values) => {
    markRoutineCloudReconciled(values);
    saveStoredRoutines([routine(otherId, 'A')]);
    addStoredPendingRoutineUpserts([otherId]);
    let calls = 0;
    let resolveFirst!: (response: Response) => void;
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async () => {
      calls += 1;
      if (calls === 1) return new Promise<Response>((resolve) => { resolveFirst = resolve; });
      return Response.json({ code: 'SERVER_ERROR' }, { status: 500 });
    } });

    const drain = syncWithCloud(PUSH_URL);
    saveStoredRoutines([routine(otherId, 'B')]);
    addStoredPendingRoutineUpserts([otherId]);
    void syncWithCloud(PUSH_URL);
    resolveFirst(Response.json({ syncedCount: 0, deletedRoutineIds: [] }));
    assert.equal((await drain).ok, false);
    assert.equal(calls, 2);
    assert.deepEqual(getStoredPendingRoutineUpsertIds(), [otherId]);

    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: async () =>
      Response.json({ syncedCount: 0, deletedRoutineIds: [] }) });
    assert.equal((await syncWithCloud(PUSH_URL)).ok, true);
    assert.deepEqual(getStoredPendingRoutineUpsertIds(), []);
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
