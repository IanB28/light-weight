import test from 'node:test';
import assert from 'node:assert/strict';
import {
  featuredLoadHundredths,
  normalizeFeaturedPrSelections,
  resolveFeaturedPrVariants,
  resolvePrimaryFeaturedPrVariant,
  resolveSelectedFeaturedPrVariant
} from './featuredPr.js';
import { calculateCanonicalStrengthOneRm } from './onerm.js';
import { REP_CAP } from './oneRmConstants.js';
import type { BodyweightEntry, Exercise, HistoricalPersonalRecord, LoggedSet, WorkoutSession } from './types.js';

const set = (weightKg: number, reps: number, overrides: Partial<LoggedSet> = {}): LoggedSet => ({
  setIndex: 1, weightKg, reps, completed: true, setType: 'working', ...overrides
});

const conventional: Exercise = {
  id: 'bench', name: 'Bench', category: 'barbell', primaryMuscle: 'chest',
  loading: { mechanism: 'barbell', loadMode: 'total', supportsKeyboard: true, supportsPlates: true, supportsExternalLoad: true, includeBarWeight: true }
};

const session = (id: string, startedAt: string, sets: LoggedSet[], exerciseId = conventional.id): WorkoutSession => ({
  id, userId: 'user', startedAt, performedDate: startedAt.slice(0, 10), sets: { [exerciseId]: sets }
});

const variants = (
  exercise: Exercise,
  history: WorkoutSession[],
  historicalPersonalRecords: HistoricalPersonalRecord[] = [],
  bodyweightEntries: BodyweightEntry[] = []
) => resolveFeaturedPrVariants({ exerciseId: exercise.id, exercise, history, historicalPersonalRecords, bodyweightEntries });

test('CASE A/B/C: derives one winner per load and later higher reps replace the bucket', () => {
  const result = variants(conventional, [
    session('old', '2026-01-01T10:00:00.000Z', [set(60, 20), set(60, 30), set(80, 18), set(100, 3), set(120, 2)]),
    session('new', '2026-02-01T10:00:00.000Z', [set(60, 45), set(100, 8), set(100, 10)])
  ]);
  assert.deepEqual(result.map((item) => [item.loadWeightKg, item.reps]), [[60, 45], [80, 18], [100, 10], [120, 2]]);
});

test('CASE D: decimal representations share a hundredths-safe load identity', () => {
  assert.equal(featuredLoadHundredths(100), 10_000);
  assert.equal(featuredLoadHundredths(100.0), 10_000);
  assert.equal(featuredLoadHundredths(100.004), 10_000);
  const result = variants(conventional, [session('a', '2026-01-01T10:00:00Z', [set(100, 3), set(100.0, 5), set(100.004, 8)])]);
  assert.deepEqual(result.map((item) => [item.loadWeightKg, item.reps]), [[100, 8]]);
});

test('CASE E/F: equal load/reps use numeric physical chronology across timezone offsets', () => {
  const physicalNewer = session('physical-newer', '2026-01-01T23:30:00-05:00', [set(100, 8)]);
  const physicalOlder = session('physical-older', '2026-01-02T01:00:00+00:00', [set(100, 8)]);
  assert.equal(variants(conventional, [physicalNewer, physicalOlder])[0]?.sessionId, 'physical-newer');
});

test('CASE G/H/I/J: warmup/incomplete are excluded, 45 reps are valid showcase data, REP_CAP remains 12', () => {
  const result = variants(conventional, [session('a', '2026-01-01T10:00:00Z', [
    set(60, 50, { setType: 'warmup', isWarmup: true }),
    set(70, 60, { completed: false }),
    set(60, 45)
  ])]);
  assert.deepEqual(result.map((item) => [item.loadWeightKg, item.reps]), [[60, 45]]);
  assert.equal(REP_CAP, 12);
  assert.equal(calculateCanonicalStrengthOneRm(set(60, 45), { exercise: conventional }), null);
});

test('CASE K/L/M: added, assisted, and bodyweight variants use stored external load identity', () => {
  const entries = [{ date: '2026-01-01', weightKg: 80 }];
  const weighted: Exercise = {
    ...conventional, id: 'weighted', category: 'bodyweight',
    loading: { mechanism: 'bodyweight', loadMode: 'added_weight', supportsKeyboard: true, supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false, bodyweightFactor: 1 }
  };
  assert.deepEqual(variants(weighted, [session('w', '2026-01-02T10:00:00Z', [set(10, 20), set(20, 12)], weighted.id)], [], entries)
    .map((item) => [item.loadWeightKg, item.reps]), [[10, 20], [20, 12]]);

  const assisted: Exercise = {
    ...weighted, id: 'assisted',
    loading: { ...weighted.loading!, loadMode: 'assisted' }
  };
  assert.deepEqual(variants(assisted, [session('a', '2026-01-02T10:00:00Z', [set(40, 20), set(20, 10)], assisted.id)], [], entries)
    .map((item) => [item.loadWeightKg, item.reps]), [[40, 20], [20, 10]]);
  assert.deepEqual(variants(assisted, [session('a', '2026-01-02T10:00:00Z', [set(20, 10)], assisted.id)]), []);

  const bodyweight = variants(weighted, [session('bw', '2026-01-02T10:00:00Z', [set(0, 15)], weighted.id)], [], entries);
  assert.deepEqual(bodyweight.map((item) => [item.loadWeightKg, item.reps]), [[0, 15]]);
});

test('CASE N: per_hand and per_side retain the stored amount without doubling', () => {
  for (const loadMode of ['per_hand', 'per_side'] as const) {
    const exercise: Exercise = { ...conventional, id: loadMode, loading: { ...conventional.loading!, loadMode } };
    const result = variants(exercise, [session(loadMode, '2026-01-01T10:00:00Z', [set(30, 8)], loadMode)]);
    assert.equal(result[0]?.loadWeightKg, 30);
    assert.equal(result[0]?.effectiveLoadKg, 30);
  }
});

test('CASE O: HPR participates without using recordedAt as physical chronology', () => {
  const hpr: HistoricalPersonalRecord = {
    id: 'hpr', userId: 'user', exerciseId: 'bench', performedDate: '2026-01-05',
    recordedAt: '2099-01-01T00:00:00.000Z', bodyweightKg: 80, set: set(120, 5), source: 'historical_manual'
  };
  const result = variants(conventional, [session('workout', '2026-01-06T10:00:00Z', [set(120, 4)])], [hpr]);
  assert.equal(result.find((item) => item.loadWeightKg === 120)?.reps, 5);
  assert.equal(result.find((item) => item.loadWeightKg === 120)?.source, 'historical_manual');
});

test('CASE P/Q: primary variant prefers reps, then effective load, chronology, and stable identity', () => {
  const result = variants(conventional, [session('a', '2026-01-01T10:00:00Z', [set(60, 45), set(80, 18), set(100, 8)])]);
  assert.equal(resolvePrimaryFeaturedPrVariant(result)?.loadWeightKg, 60);
  const tied = variants(conventional, [session('b', '2026-01-02T10:00:00Z', [set(80, 8), set(100, 8)])]);
  assert.equal(resolvePrimaryFeaturedPrVariant(tied)?.loadWeightKg, 100);
});

test('selection persists load identity and automatically resolves the current bucket winner', () => {
  const selection = { slot: 1 as const, exerciseId: 'bench', loadWeightKg: 100 };
  const before = variants(conventional, [session('a', '2026-01-01T10:00:00Z', [set(100, 8)])]);
  const after = variants(conventional, [session('a', '2026-01-01T10:00:00Z', [set(100, 8)]), session('b', '2026-02-01T10:00:00Z', [set(100, 10)])]);
  assert.equal(resolveSelectedFeaturedPrVariant(selection, before)?.reps, 8);
  assert.equal(resolveSelectedFeaturedPrVariant(selection, after)?.reps, 10);
});

test('selection normalization removes legacy repCount rows, invalid loads, and duplicates', () => {
  assert.deepEqual(normalizeFeaturedPrSelections([
    { slot: 1, exerciseId: 'legacy', repCount: 8 },
    { slot: 1, exerciseId: 'bench', loadWeightKg: 100.004 },
    { slot: 2, exerciseId: 'bench', loadWeightKg: 120 },
    { slot: 2, exerciseId: 'row', loadWeightKg: -1 },
    { slot: 3, exerciseId: 'pull-up', loadWeightKg: 0 }
  ]), [
    { slot: 1, exerciseId: 'bench', loadWeightKg: 100 },
    { slot: 3, exerciseId: 'pull-up', loadWeightKg: 0 }
  ]);
});
