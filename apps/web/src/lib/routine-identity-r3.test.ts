import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRoutine, toDatabaseUuid } from '@light-weight/domain';
import { mergePulledRoutines } from './routine-sync.js';
import { buildRoutinePayload } from '../components/CreateRoutineModal.js';
import { getStoredDeletedRoutineIds, getStoredWeeklySchedule, normalizeStoredActiveWorkout,
  saveStoredDeletedRoutineIds, saveStoredWeeklySchedule, type WeeklySchedule } from './storage.js';

test('legacy local routine alias and canonical pulled UUID represent one routine', () => {
  const local = normalizeRoutine({ id: 'rt-123', name: 'Push', userId: 'athlete', exerciseIds: ['bench'] });
  const remote = normalizeRoutine({ id: '00000000-0000-4000-8000-000036ffafd9', name: 'Push', userId: 'athlete', exerciseIds: ['bench'] });
  assert.ok(local && remote);
  // API's historical toDatabaseUuid algorithm maps rt-123 to this UUID.
  const merged = mergePulledRoutines([local], [remote]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, remote.id);
});

test('new routine starts with a real UUID and serializes without translation', () => {
  const routine = buildRoutinePayload('Push', '', ['bench'], 'athlete');
  assert.match(routine.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(toDatabaseUuid(routine.id), routine.id);
});

test('legacy schedule, tombstone and active workout references canonicalize together', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); }
  } });
  try {
    values.set('lightweight_weekly_schedule', JSON.stringify({ monday: 'rt-123' }));
    assert.equal(getStoredWeeklySchedule().monday, toDatabaseUuid('rt-123'));
    saveStoredWeeklySchedule({ ...getStoredWeeklySchedule(), tuesday: 'rt-123' } as WeeklySchedule);
    assert.equal(JSON.parse(values.get('lightweight_weekly_schedule')!).tuesday, toDatabaseUuid('rt-123'));
    saveStoredDeletedRoutineIds(['rt-123', toDatabaseUuid('rt-123')]);
    assert.deepEqual(getStoredDeletedRoutineIds(), [toDatabaseUuid('rt-123')]);
    const active = normalizeStoredActiveWorkout({ activeRoutineId: 'rt-123', exerciseSessions: [] });
    assert.equal(active.activeRoutineId, toDatabaseUuid('rt-123'));
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('legacy alias recovers remote V2 weights and order while distinct UUIDs with same name stay separate', () => {
  const local = normalizeRoutine({ id: 'rt-123', userId: 'athlete', name: 'Push', exerciseIds: ['row', 'curl', 'bench'] })!;
  const remote = normalizeRoutine({ id: toDatabaseUuid('rt-123'), userId: 'athlete', name: 'Push',
    exerciseIds: ['bench', 'row'], template: { version: 2, exercises: [
      { exerciseId: 'bench', sets: [{ setType: 'working', targetWeightKg: 80 }, { setType: 'working', targetWeightKg: 85 }] },
      { exerciseId: 'row', sets: [{ setType: 'working', targetWeightKg: 70 }] }
    ] } })!;
  const distinct = normalizeRoutine({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', userId: 'athlete', name: 'Push', exerciseIds: ['squat'] })!;
  const merged = mergePulledRoutines([local], [remote, distinct]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0].exerciseIds, ['row', 'curl', 'bench']);
  assert.deepEqual(merged[0].template?.exercises.map((exercise) => [exercise.exerciseId, exercise.sets.map((set) => set.targetWeightKg)]),
    [['row', [70]], ['curl', [0]], ['bench', [80, 85]]]);
  assert.equal(merged[1].id, distinct.id);
});

test('offline local routine survives authenticated pull even when absent remotely', () => {
  const pending = normalizeRoutine({ id: 'offline-1', userId: 'athlete', name: 'Push', exerciseIds: ['bench'] })!;
  const merged = mergePulledRoutines([pending], []);
  assert.deepEqual(merged.map((routine) => routine.id), [toDatabaseUuid('offline-1')]);
});
