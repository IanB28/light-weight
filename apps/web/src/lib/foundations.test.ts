import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAppPreferences, DEFAULT_APP_PREFERENCES } from './preferences.js';
import { mapApiError, mapHttpStatus } from './api-errors.js';
import { deriveExerciseUsage, rankExerciseDiscovery } from './exercise-discovery.js';
import { resolveExerciseName } from './exercise-names.js';
import {
  displayWeight,
  getDefaultPlateLoadedWeightKg,
  getPlateLoadScope,
  getWeightEntryCapability,
  isUnilateralExercise,
  parseDisplayWeight,
  WEIGHT_UNIT_PRESETS
} from './weight-units.js';
import type { Exercise, WorkoutSession } from '@light-weight/domain';

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
  assert.equal(getWeightEntryCapability('barbell'), 'plates-only');
  assert.equal(getWeightEntryCapability('machine'), 'keyboard-and-plates');
  assert.equal(getWeightEntryCapability('dumbbell'), 'keyboard-and-plates');
  assert.equal(getWeightEntryCapability('cable'), 'keyboard-and-plates');
  assert.equal(getWeightEntryCapability('other'), 'keyboard-and-plates');
  assert.equal(getWeightEntryCapability('bodyweight'), 'added-weight');
  assert.equal(displayWeight(getDefaultPlateLoadedWeightKg('metric', 20, [25, 20, 10]), 'metric'), 60);
  assert.equal(displayWeight(getDefaultPlateLoadedWeightKg(
    'imperial',
    WEIGHT_UNIT_PRESETS.imperial.barWeightKg,
    WEIGHT_UNIT_PRESETS.imperial.platesKg
  ), 'imperial'), 135);
  assert.equal(displayWeight(getDefaultPlateLoadedWeightKg('metric', 0, [20, 10], 1), 'metric'), 20);
});

test('plate load scope only uses per-side entry for barbells and unilateral exercises', () => {
  const exercise = (name: string, category: Exercise['category'], instructions: string[] = []): Exercise => ({
    id: name,
    name,
    category,
    primaryMuscle: 'chest',
    instructions
  });

  assert.equal(getPlateLoadScope(exercise('Bench press', 'barbell')), 'barbell');
  assert.equal(getPlateLoadScope(exercise('Chest press', 'machine')), 'total');
  assert.equal(getPlateLoadScope(exercise('Cable fly', 'cable')), 'total');
  assert.equal(getPlateLoadScope(exercise('Single-arm cable row', 'cable')), 'per-side');
  assert.equal(getPlateLoadScope(exercise('Curl unilateral', 'dumbbell')), 'per-side');
  assert.equal(isUnilateralExercise(exercise('Dumbbell curl', 'dumbbell', ['Repeat with the other arm.'])), true);
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
  const set = { setIndex: 1, weightKg: 10, reps: 5, completed: true, isWarmup: false };
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
