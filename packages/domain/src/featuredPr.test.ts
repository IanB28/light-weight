import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getAvailableFeaturedRepCounts,
  isValidFeaturedRepCount,
  resolveBestExactRepPerformance
} from './featuredPr.js';
import type { BodyweightEntry, Exercise, HistoricalPersonalRecord, LoggedSet, WorkoutSession } from './types.js';

const set = (weightKg: number, reps: number, overrides: Partial<LoggedSet> = {}): LoggedSet => ({
  setIndex: 1,
  weightKg,
  reps,
  completed: true,
  setType: 'working',
  ...overrides
});

const conventional: Exercise = {
  id: 'bench', name: 'Bench', category: 'barbell', primaryMuscle: 'chest',
  loading: { mechanism: 'barbell', loadMode: 'total', supportsKeyboard: true, supportsPlates: true, supportsExternalLoad: true, includeBarWeight: true }
};

const session = (id: string, startedAt: string, sets: LoggedSet[], exerciseId = conventional.id): WorkoutSession => ({
  id, userId: 'user', startedAt, performedDate: startedAt.slice(0, 10), sets: { [exerciseId]: sets }
});

const resolve = (exercise: Exercise, repCount: number, history: WorkoutSession[], historicalPersonalRecords: HistoricalPersonalRecord[] = [], bodyweightEntries: BodyweightEntry[] = []) =>
  resolveBestExactRepPerformance({ exerciseId: exercise.id, exercise, repCount, history, historicalPersonalRecords, bodyweightEntries });

test('CASE A/B/K/L: conventional resolver uses only exact reps, including actual 1RM, within cap', () => {
  const history = [session('a', '2026-01-01T10:00:00.000Z', [set(100, 8), set(110, 8), set(130, 5), set(140, 13), set(100, 1), set(110, 2)])];
  assert.equal(resolve(conventional, 8, history)?.set.weightKg, 110);
  assert.equal(resolve(conventional, 5, history)?.set.weightKg, 130);
  assert.equal(resolve(conventional, 1, history)?.set.weightKg, 100);
  assert.equal(resolve(conventional, 13, history), null);
  assert.equal(isValidFeaturedRepCount(12), true);
  assert.equal(isValidFeaturedRepCount(13), false);
});

test('CASE C/F: assisted exercise compares effective load and requires bodyweight', () => {
  const exercise: Exercise = {
    ...conventional, id: 'assisted', category: 'bodyweight',
    loading: { mechanism: 'bodyweight', loadMode: 'assisted', supportsKeyboard: true, supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false, bodyweightFactor: 1 }
  };
  const history = [session('a', '2026-01-02T10:00:00.000Z', [set(40, 8), set(20, 8)], exercise.id)];
  assert.equal(resolve(exercise, 8, history, [], [{ date: '2026-01-01', weightKg: 80 }])?.set.weightKg, 20);
  assert.equal(resolve(exercise, 8, history), null);
});

test('CASE D/E: added weight and bodyweight-only use canonical bodyweight load', () => {
  const exercise: Exercise = {
    ...conventional, id: 'pull-up', category: 'bodyweight',
    loading: { mechanism: 'bodyweight', loadMode: 'added_weight', supportsKeyboard: true, supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false, bodyweightFactor: 1 }
  };
  const entries = [{ date: '2026-01-01', weightKg: 80 }];
  const weighted = [session('a', '2026-01-02T10:00:00.000Z', [set(10, 8), set(20, 8)], exercise.id)];
  assert.equal(resolve(exercise, 8, weighted, [], entries)?.effectiveLoadKg, 100);
  const bodyweight = [session('b', '2026-01-03T10:00:00.000Z', [set(0, 10)], exercise.id)];
  assert.equal(resolve(exercise, 10, bodyweight, [], entries)?.effectiveLoadKg, 80);
});

test('CASE G/H: warmup and incomplete sets are excluded', () => {
  const history = [session('a', '2026-01-01T10:00:00.000Z', [
    set(150, 8, { setType: 'warmup' }), set(140, 8, { completed: false }), set(100, 8)
  ])];
  assert.equal(resolve(conventional, 8, history)?.set.weightKg, 100);
});

test('CASE I/J: HPR participates and physical chronology wins ties without recordedAt', () => {
  const hpr: HistoricalPersonalRecord = {
    id: 'hpr', userId: 'user', exerciseId: 'bench', performedDate: '2026-01-05', recordedAt: '2030-01-01T00:00:00.000Z', bodyweightKg: 80,
    set: set(120, 5), source: 'historical_manual'
  };
  assert.equal(resolve(conventional, 5, [session('w', '2026-01-06T10:00:00.000Z', [set(115, 5)])], [hpr])?.set.weightKg, 120);
  const oldCapturedLate: HistoricalPersonalRecord = { ...hpr, id: 'old', performedDate: '2026-01-01', recordedAt: '2035-01-01T00:00:00.000Z', set: set(100, 8) };
  const newer = session('newer', '2026-01-10T10:00:00.000Z', [set(100, 8)]);
  assert.equal(resolve(conventional, 8, [newer], [oldCapturedLate])?.sessionId, 'newer');
});

test('equal exact-rep loads use numeric physical chronology across timezone offsets', () => {
  const lexicallyEarlierButPhysicallyNewer = session(
    'physical-newer',
    '2026-01-01T23:30:00-05:00',
    [set(100, 8)]
  );
  const lexicallyLaterButPhysicallyOlder = session(
    'physical-older',
    '2026-01-02T01:00:00+00:00',
    [set(100, 8)]
  );
  assert.equal(
    resolve(conventional, 8, [lexicallyEarlierButPhysicallyNewer, lexicallyLaterButPhysicallyOlder])?.sessionId,
    'physical-newer'
  );
});

test('same-day HPR/workout ties use stable identity rather than HPR recordedAt', () => {
  const workout = session('workout', '2026-01-05T08:00:00.000Z', [set(100, 8)]);
  const hpr: HistoricalPersonalRecord = {
    id: 'hpr-recorded-later',
    userId: 'user',
    exerciseId: 'bench',
    performedDate: '2026-01-05',
    recordedAt: '2099-01-01T00:00:00.000Z',
    bodyweightKg: 80,
    set: set(100, 8),
    source: 'historical_manual'
  };
  const first = resolve(conventional, 8, [workout], [hpr]);
  const second = resolve(conventional, 8, [workout], [{ ...hpr, recordedAt: '2000-01-01T00:00:00.000Z' }]);
  assert.equal(first?.source, second?.source);
  assert.equal(first?.sessionId, second?.sessionId);
});

test('CASE M: per_hand and per_side values are never doubled', () => {
  for (const loadMode of ['per_hand', 'per_side'] as const) {
    const exercise: Exercise = { ...conventional, id: loadMode, loading: { ...conventional.loading!, loadMode } };
    const result = resolve(exercise, 8, [session(loadMode, '2026-01-01T10:00:00.000Z', [set(30, 8)], loadMode)]);
    assert.equal(result?.effectiveLoadKg, 30);
    assert.equal(result?.set.weightKg, 30);
  }
});

test('available reps contains only eligible exact performances', () => {
  const history = [session('a', '2026-01-01T10:00:00.000Z', [set(50, 3), set(60, 5), set(70, 8), set(80, 10), set(90, 4, { completed: false })])];
  assert.deepEqual(getAvailableFeaturedRepCounts({ exerciseId: 'bench', exercise: conventional, history }), [3, 5, 8, 10]);
});
