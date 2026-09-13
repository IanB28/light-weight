import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EXERCISE_LOADING_PROFILE,
  resolveExerciseLoadingProfile,
  resolvePlateBaseWeightKg
} from './exerciseLoading.js';
import { calculateLoadedBarWeight, poundsToKilograms } from './weight.js';
import {
  isEffectiveSet,
  normalizeLoggedSet,
  normalizeWorkoutSetType,
  shouldCountForPersonalRecord,
  shouldCountForVolume
} from './setSemantics.js';
import { calculateVolume } from './progression.js';
import { bestSetOf, is1RMRecord } from './onerm.js';
import type { Exercise, ExerciseLoadingProfile, LoggedSet } from './types.js';

const exercise = (overrides: Partial<Exercise>): Exercise => ({
  id: 'unknown',
  name: 'Unknown exercise',
  category: 'other',
  primaryMuscle: 'chest',
  ...overrides
});

test('loading resolver prioritizes explicit metadata over curated and fallback data', () => {
  const loading: ExerciseLoadingProfile = {
    mechanism: 'selectorized',
    loadMode: 'total',
    supportsKeyboard: true,
    supportsPlates: false,
    supportsExternalLoad: true,
    includeBarWeight: false
  };
  const resolved = resolveExerciseLoadingProfile(exercise({
    id: 'ex-0739',
    name: 'Single-arm sled leg press',
    category: 'barbell',
    loading
  }));
  assert.equal(resolved.source, 'explicit');
  assert.equal(resolved.profile.mechanism, loading.mechanism);
  assert.equal(resolved.profile.plateBase?.kind, 'none');
});

test('loading resolver distinguishes common mechanisms and stable load modes', () => {
  const barbell = resolveExerciseLoadingProfile(exercise({ name: 'Barbell bench press', category: 'barbell' }));
  assert.equal(barbell.profile.mechanism, 'barbell');
  assert.equal(barbell.profile.plateBase?.kind, 'user_bar');

  const dumbbell = resolveExerciseLoadingProfile(exercise({ name: 'Dumbbell curl', category: 'dumbbell' }));
  assert.equal(dumbbell.profile.loadMode, 'per_hand');
  assert.equal(dumbbell.profile.supportsKeyboard, true);
  assert.equal(dumbbell.profile.supportsPlates, false);

  const selectorized = resolveExerciseLoadingProfile(
    exercise({ name: 'Leg extension', category: 'machine' }),
    { legacyEquipment: 'leverage machine' }
  );
  assert.equal(selectorized.profile.mechanism, 'selectorized');
  assert.equal(selectorized.profile.supportsPlates, false);

  const plateLoaded = resolveExerciseLoadingProfile(exercise({ id: 'ex-0739', name: 'Sled 45° leg press' }));
  assert.equal(plateLoaded.source, 'override');
  assert.equal(plateLoaded.profile.mechanism, 'plate_loaded');
  assert.equal(plateLoaded.profile.supportsPlates, true);

  const cable = resolveExerciseLoadingProfile(exercise({ id: 'ex-0189', name: 'Cable one arm row', category: 'cable' }));
  assert.equal(cable.profile.loadMode, 'per_side');
  assert.equal(cable.profile.supportsPlates, false);

  const bodyweight = resolveExerciseLoadingProfile(exercise({ id: 'ex-0841', name: 'Weighted pull-up', category: 'bodyweight' }));
  assert.equal(bodyweight.profile.loadMode, 'added_weight');
  assert.equal(bodyweight.profile.supportsExternalLoad, true);

  const unknown = resolveExerciseLoadingProfile(exercise({}));
  assert.equal(unknown.source, 'default');
  assert.equal(unknown.profile.mechanism, DEFAULT_EXERCISE_LOADING_PROFILE.mechanism);
  assert.equal(unknown.profile.plateBase?.kind, 'none');
});

test('Smith machines use their fixed 20 lb base, not the user barbell preference', () => {
  const smith = resolveExerciseLoadingProfile(exercise({ id: 'ex-0748', name: 'Smith bench press', category: 'machine' })).profile;
  const base20 = resolvePlateBaseWeightKg(smith, 100);
  const base22 = resolvePlateBaseWeightKg(smith, 100, poundsToKilograms(22));
  assert.equal(Math.round(base20 * 100) / 100, Math.round(poundsToKilograms(20) * 100) / 100);
  assert.equal(Math.round(base22 * 100) / 100, Math.round(poundsToKilograms(22) * 100) / 100);
  assert.equal(Math.round(calculateLoadedBarWeight(base20, [poundsToKilograms(45)]) * 10) / 10, 49.9);
  const equipmentFallback = resolveExerciseLoadingProfile(exercise({ id: 'legacy-smith', category: 'machine' }), { legacyEquipment: 'Smith machine' }).profile;
  assert.equal(equipmentFallback.plateBase?.label, 'smith');
  assert.equal(Math.round(resolvePlateBaseWeightKg(equipmentFallback, 200) * 100) / 100, Math.round(poundsToKilograms(20) * 100) / 100);
});

test('legacy set classification normalizes to canonical setType', () => {
  assert.equal(normalizeWorkoutSetType({ isWarmup: true }), 'warmup');
  assert.equal(normalizeWorkoutSetType({ isWarmup: false }), 'working');
  assert.equal(normalizeWorkoutSetType({ setType: 'drop', isWarmup: true }), 'drop');
  assert.equal(normalizeWorkoutSetType({ setType: 'backoff' }), 'backoff');
  assert.deepEqual(normalizeLoggedSet({ completed: true, isWarmup: true }), {
    completed: true,
    setType: 'warmup',
    isWarmup: true
  });
});

test('analytics exclude warmups and preserve effective drop and backoff sets', () => {
  const sets: LoggedSet[] = [
    { setIndex: 1, weightKg: 20, reps: 10, completed: true, setType: 'warmup', isWarmup: true },
    { setIndex: 2, weightKg: 100, reps: 5, completed: true, setType: 'working', isWarmup: false },
    { setIndex: 3, weightKg: 80, reps: 8, completed: true, setType: 'drop', isWarmup: false },
    { setIndex: 4, weightKg: 70, reps: 10, completed: true, setType: 'backoff', isWarmup: false }
  ];

  assert.equal(calculateVolume(sets), 1840);
  assert.equal(shouldCountForVolume(sets[0]), false);
  assert.equal(shouldCountForPersonalRecord(sets[0]), false);
  assert.equal(isEffectiveSet(sets[2]), true);
  assert.equal(shouldCountForPersonalRecord(sets[2]), true);
  assert.equal(shouldCountForPersonalRecord(sets[3]), true);
  assert.equal(bestSetOf(sets)?.w, 100);
  assert.equal(is1RMRecord(0, sets[0]), null);
  assert.equal(is1RMRecord(0, sets[2])?.isPr, true);
  assert.equal(is1RMRecord(0, sets[3])?.isPr, true);
});
