import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAppPreferences, DEFAULT_APP_PREFERENCES } from './preferences.js';
import { mapApiError, mapHttpStatus } from './api-errors.js';
import { deriveExerciseUsage, rankExerciseDiscovery } from './exercise-discovery.js';
import { resolveExerciseName } from './exercise-names.js';
import {
  displayWeight,
  getDefaultPlateLoadedWeightKg,
  parseDisplayWeight,
  WEIGHT_UNIT_PRESETS
} from './weight-units.js';
import { resolveExerciseLoadingProfile, type Exercise, type WorkoutSession } from '@light-weight/domain';
import {
  addStoredDeletedRoutineId,
  getStoredDeletedRoutineIds,
  normalizeStoredActiveWorkout,
  normalizeStoredHistory,
  removeStoredDeletedRoutineIds,
  saveStoredRoutines,
  storedUserScopeMatches,
  switchStoredUserScope
} from './storage.js';
import { resolveSessionRefreshFailure } from './auth-session-state.js';
import { excludePendingRoutineTombstones } from './routine-tombstones.js';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, String(value)); }
}

test('preference parser applies defaults and preserves valid partial settings', () => {
  assert.deepEqual(parseAppPreferences(null), DEFAULT_APP_PREFERENCES);
  const parsed = parseAppPreferences({ language: 'en', units: 'imperial', defaultRestSeconds: 120, availablePlatesKg: [20, -5, 20, 2.5] });
  assert.equal(parsed.language, 'en');
  assert.equal(parsed.units, 'imperial');
  assert.equal(parsed.bodyweightUnits, 'imperial');
  assert.equal(parsed.defaultRestSeconds, 120);
  assert.deepEqual(parsed.availablePlatesKg, [20, 2.5]);
  assert.equal(parseAppPreferences({}, 'en').language, 'en');
  assert.equal(parseAppPreferences({ defaultBarWeightKg: Number.NaN }).defaultBarWeightKg, 20);
});

test('body weight units migrate safely and remain independent from load units', () => {
  assert.equal(parseAppPreferences({ units: 'imperial' }).bodyweightUnits, 'imperial');
  const separated = parseAppPreferences({ units: 'imperial', bodyweightUnits: 'metric' });
  assert.equal(separated.units, 'imperial');
  assert.equal(separated.bodyweightUnits, 'metric');
});

test('weight unit presets display metric and imperial gym loads consistently', () => {
  assert.equal(displayWeight(WEIGHT_UNIT_PRESETS.metric.barWeightKg, 'metric'), 20);
  assert.deepEqual(WEIGHT_UNIT_PRESETS.metric.platesKg.map((weight) => displayWeight(weight, 'metric')), [25, 20, 15, 10, 5, 2.5, 1.25]);
  assert.equal(displayWeight(WEIGHT_UNIT_PRESETS.imperial.barWeightKg, 'imperial'), 45);
  assert.deepEqual(WEIGHT_UNIT_PRESETS.imperial.platesKg.map((weight) => displayWeight(weight, 'imperial')), [45, 35, 25, 10, 5, 2.5]);
  assert.ok(Math.abs(displayWeight(parseDisplayWeight(155, 'imperial'), 'imperial') - 155) < 0.01);
  assert.equal(displayWeight(-5, 'metric'), -5);
});

test('plate entry respects weighted exercises and starts from representable unit loads', () => {
  const barbell = resolveExerciseLoadingProfile({ id: 'bar', name: 'Bench press', category: 'barbell' }).profile;
  const plateLoaded = resolveExerciseLoadingProfile({ id: 'ex-0739', name: 'Sled leg press', category: 'machine' }).profile;
  assert.equal(displayWeight(getDefaultPlateLoadedWeightKg('metric', 20, [25, 20, 10], barbell), 'metric'), 60);
  assert.equal(displayWeight(getDefaultPlateLoadedWeightKg(
    'imperial',
    WEIGHT_UNIT_PRESETS.imperial.barWeightKg,
    WEIGHT_UNIT_PRESETS.imperial.platesKg,
    barbell
  ), 'imperial'), 135);
  assert.equal(displayWeight(getDefaultPlateLoadedWeightKg('metric', 0, [20, 10], plateLoaded), 'metric'), 40);
});

test('preference parser migrates only legacy imperial defaults', () => {
  const migrated = parseAppPreferences({
    units: 'imperial',
    defaultBarWeightKg: 20,
    availablePlatesKg: [25, 20, 15, 10, 5, 2.5, 1.25]
  });
  assert.equal(displayWeight(migrated.defaultBarWeightKg, 'imperial'), 45);
  assert.deepEqual(migrated.availablePlatesKg.map((weight) => displayWeight(weight, 'imperial')), [45, 35, 25, 10, 5, 2.5]);

  const custom = parseAppPreferences({ units: 'imperial', defaultBarWeightKg: 15, availablePlatesKg: [10, 5] });
  assert.equal(custom.defaultBarWeightKg, 15);
  assert.deepEqual(custom.availablePlatesKg, [10, 5]);
});

test('exercise names resolve catalog, legacy and history names without exposing ids', () => {
  const catalog: Exercise[] = [{ id: 'catalog-id', name: 'Catalog Bench', category: 'barbell', primaryMuscle: 'chest' }];
  const history = [{
    id: 'session', userId: 'user', startedAt: '2026-09-01T00:00:00Z', sets: { 'history-id': [] },
    exerciseNames: { 'history-id': 'Historical Row' }
  }] as unknown as WorkoutSession[];
  assert.equal(resolveExerciseName('catalog-id', catalog, history), 'Catalog Bench');
  assert.equal(resolveExerciseName('ex-rdl', catalog, history), 'Romanian Deadlift');
  assert.equal(resolveExerciseName('history-id', catalog, history), 'Historical Row');
  assert.equal(resolveExerciseName('unknown-id', catalog, history, 'Exercise unavailable'), 'Exercise unavailable');
});

test('API errors map to stable, non-technical codes', () => {
  assert.equal(mapHttpStatus(401).code, 'unauthorized');
  assert.equal(mapHttpStatus(403).code, 'forbidden');
  assert.equal(mapHttpStatus(404).code, 'not_found');
  assert.equal(mapHttpStatus(409).code, 'conflict');
  assert.equal(mapHttpStatus(422).code, 'validation');
  assert.equal(mapHttpStatus(429).code, 'rate_limited');
  assert.equal(mapHttpStatus(503).code, 'server');
  assert.equal(mapApiError(new TypeError('network details')).code, 'network');
  assert.equal(mapApiError(new DOMException('timeout', 'AbortError')).code, 'aborted');
});

test('exercise ranking counts sessions, favors frequency, and removes featured duplicates', () => {
  const exercises: Exercise[] = [
    { id: 'a', name: 'A', category: 'barbell', primaryMuscle: 'chest' },
    { id: 'b', name: 'B', category: 'barbell', primaryMuscle: 'chest' },
    { id: 'c', name: 'C', category: 'barbell', primaryMuscle: 'chest' }
  ];
  const set = { setIndex: 1, weightKg: 10, reps: 5, completed: true, setType: 'working' as const, isWarmup: false };
  const history: WorkoutSession[] = [
    { id: '1', userId: 'u', startedAt: '2026-01-01T00:00:00Z', sets: { a: [set], b: [set] } },
    { id: '2', userId: 'u', startedAt: '2026-02-01T00:00:00Z', sets: { a: [set] } }
  ];
  const usage = deriveExerciseUsage(history);
  assert.equal(usage.a.sessions, 2);
  assert.equal(usage.b.sessions, 1);
  const ranked = rankExerciseDiscovery(exercises, usage, 'chest');
  assert.equal(ranked.featured[0].id, 'a');
  assert.equal(new Set([...ranked.featured, ...ranked.remaining].map((exercise) => exercise.id)).size, 3);
});

test('legacy local history and active workouts hydrate canonical set types', () => {
  const legacySession = {
    id: 'legacy', userId: 'u', startedAt: '2026-09-13T00:00:00.000Z',
    sets: { bench: [{ setIndex: 1, weightKg: 20, reps: 10, completed: true, isWarmup: true }] }
  };
  const [historySession] = normalizeStoredHistory([legacySession]);
  assert.equal(historySession.sets.bench[0].setType, 'warmup');
  assert.equal(historySession.sets.bench[0].isWarmup, true);

  const active = normalizeStoredActiveWorkout({
    isWorkoutActive: true,
    exerciseSessions: [{ exercise: { id: 'ex-0748' }, plateBaseWeightKg: 9.0718474, sets: legacySession.sets.bench }]
  }) as unknown as { exerciseSessions: Array<{ sets: Array<{ setType: string }>; plateBaseWeightKg?: number }> };
  assert.equal(active.exerciseSessions[0].sets[0].setType, 'warmup');
  assert.equal(active.exerciseSessions[0].plateBaseWeightKg, 9.0718474);
});

test('local account scopes isolate private workout data during auth transitions', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
  try {
    localStorage.setItem('lightweight_workouts_history', '[{"id":"anonymous"}]');
    assert.equal(switchStoredUserScope('user-a'), true);
    assert.equal(storedUserScopeMatches('user-a'), true);
    assert.equal(localStorage.getItem('lightweight_workouts_history'), '[{"id":"anonymous"}]');
    assert.equal(switchStoredUserScope(null), true);
    assert.equal(localStorage.getItem('lightweight_workouts_history'), null);
    localStorage.setItem('lightweight_workouts_history', '[{"id":"anonymous-2"}]');
    assert.equal(switchStoredUserScope('user-b'), true);
    assert.equal(switchStoredUserScope(null), true);
    assert.equal(switchStoredUserScope('user-a'), true);
    assert.equal(localStorage.getItem('lightweight_workouts_history'), '[{"id":"anonymous"}]');
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('shared routine attribution survives local serialization and pending tombstones win over pulls', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
  try {
    saveStoredRoutines([{
      id: 'shared-routine', userId: 'recipient', name: 'Push', exerciseIds: ['bench'],
      origin: { type: 'shared', sharedBy: { id: 'sender', username: 'ian', displayName: 'Ian' }, shareId: 'share-1' }
    }]);
    assert.match(localStorage.getItem('lightweight_routines') || '', /sharedBy/);
    addStoredDeletedRoutineId('shared-routine');
    addStoredDeletedRoutineId('shared-routine');
    assert.deepEqual(getStoredDeletedRoutineIds(), ['shared-routine']);
    removeStoredDeletedRoutineIds(['other']);
    assert.deepEqual(getStoredDeletedRoutineIds(), ['shared-routine']);
    removeStoredDeletedRoutineIds(['shared-routine']);
    assert.deepEqual(getStoredDeletedRoutineIds(), []);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('session restoration only clears identity for confirmed unauthenticated responses', () => {
  const known = {
    id: 'user-a', email: 'ian@example.com', username: 'ian', displayName: 'Ian',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  };
  assert.equal(resolveSessionRefreshFailure(known, { code: 'unauthorized', retryable: false }).user, null);
  assert.equal(resolveSessionRefreshFailure(known, { code: 'unauthorized', retryable: false }).status, 'anonymous');
  const offline = resolveSessionRefreshFailure(known, { code: 'network', retryable: true });
  assert.equal(offline.user?.id, 'user-a');
  assert.equal(offline.status, 'offline');
  const server = resolveSessionRefreshFailure(known, { code: 'server', status: 503, retryable: true });
  assert.equal(server.user?.id, 'user-a');
  assert.equal(server.status, 'error');
});

test('a pending routine tombstone prevents cloud pull resurrection', () => {
  const routines = [
    { id: 'deleted', userId: 'u', name: 'Old push', exerciseIds: [] },
    { id: 'kept', userId: 'u', name: 'Pull', exerciseIds: [] }
  ];
  assert.deepEqual(excludePendingRoutineTombstones(routines, ['deleted']).map((routine) => routine.id), ['kept']);
});
