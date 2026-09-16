import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_EXERCISE_LOADING_PROFILE,
  resolveExerciseLoadingProfile,
  resolvePlateBaseWeightKg
} from './exerciseLoading.js';
import { calculateLoadedBarWeight, poundsToKilograms, resolveBodyweightKgAtDate } from './weight.js';
import {
  calculateEffectiveLoadKg,
  isEffectiveSet,
  isSetEligibleForPersonalRecord,
  normalizeLoggedSet,
  normalizeWorkoutSetType,
  shouldCountForPersonalRecord,
  shouldCountForVolume
} from './setSemantics.js';
import { calculateVolume } from './progression.js';
import { bestSetOf, calculateSetOneRm, is1RMRecord } from './onerm.js';
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
  const nameFallback = resolveExerciseLoadingProfile(exercise({ id: 'new-smith', name: 'Smith machine squat', category: 'machine' })).profile;
  assert.equal(nameFallback.plateBase?.label, 'smith');
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

test('Test A & B: Full-bodyweight added load and pure bodyweight', () => {
  const pullUp = exercise({ id: 'ex-pullup', name: 'Pull-up', category: 'bodyweight' });

  // A) Full-bodyweight weighted: BW 70 + 20 -> effective 90
  const effectiveWeighted = calculateEffectiveLoadKg({
    exercise: pullUp,
    setWeightKg: 20,
    bodyweightKg: 70
  });
  assert.equal(effectiveWeighted, 90);

  // B) Full-bodyweight pure: BW 70 + 0 -> effective 70
  const effectivePure = calculateEffectiveLoadKg({
    exercise: pullUp,
    setWeightKg: 0,
    bodyweightKg: 70
  });
  assert.equal(effectivePure, 70);

  // Volume with options
  const sets: LoggedSet[] = [
    { setIndex: 1, weightKg: 20, reps: 5, completed: true, setType: 'working' }
  ];
  assert.equal(calculateVolume(sets, { exercise: pullUp, bodyweightKg: 70 }), 450);
});

test('Test C, D & E: Assisted bodyweight mechanics', () => {
  const assistedPullUp = exercise({ id: 'ex-0017', name: 'Assisted pull-up', category: 'bodyweight' });
  const profile = resolveExerciseLoadingProfile(assistedPullUp).profile;
  assert.equal(profile.loadMode, 'assisted');
  assert.equal(profile.bodyweightFactor, 1);

  // C) Assisted: BW 70 - assistance 25 -> effective 45
  const effective45 = calculateEffectiveLoadKg({
    exercise: assistedPullUp,
    setWeightKg: 25,
    bodyweightKg: 70
  });
  assert.equal(effective45, 45);

  // D) Assistance > BW: 70 - 80 -> clamp 0
  const effectiveClamped = calculateEffectiveLoadKg({
    exercise: assistedPullUp,
    setWeightKg: 80,
    bodyweightKg: 70
  });
  assert.equal(effectiveClamped, 0);

  // E) Assisted sin BW: effective unavailable / 0, NEVER 25 as positive load
  const effectiveNoBw = calculateEffectiveLoadKg({
    exercise: assistedPullUp,
    setWeightKg: 25,
    bodyweightKg: null
  });
  assert.equal(effectiveNoBw, 0);
  assert.notEqual(effectiveNoBw, 25);
});

test('Test F: Barbell invariant to bodyweight', () => {
  const bench = exercise({ name: 'Barbell bench press', category: 'barbell' });
  const effective = calculateEffectiveLoadKg({
    exercise: bench,
    setWeightKg: 100,
    bodyweightKg: 70
  });
  assert.equal(effective, 100);

  const effectiveNoBw = calculateEffectiveLoadKg({
    exercise: bench,
    setWeightKg: 100,
    bodyweightKg: null
  });
  assert.equal(effectiveNoBw, 100);
});

test('Test G: Bodyweight exercise without validated bodyweightFactor does NOT assume full BW', () => {
  const pushUp = exercise({ name: 'Push-up', category: 'bodyweight' });
  const profile = resolveExerciseLoadingProfile(pushUp).profile;
  assert.equal(profile.bodyweightFactor, undefined);

  // Must NOT assume 70 kg
  const effectivePure = calculateEffectiveLoadKg({
    exercise: pushUp,
    setWeightKg: 0,
    bodyweightKg: 70
  });
  assert.equal(effectivePure, 0);

  // External plate added on back is retained as external load
  const effectiveWeighted = calculateEffectiveLoadKg({
    exercise: pushUp,
    setWeightKg: 10,
    bodyweightKg: 70
  });
  assert.equal(effectiveWeighted, 10);
});

test('Test H: Historical bodyweight resolution', () => {
  const entries = [
    { date: '2024-01-15', weightKg: 56 },
    { date: '2024-09-10', weightKg: 65 }
  ];

  // Workout from January 20 -> must use 56 kg (January entry)
  const bwJanuary = resolveBodyweightKgAtDate(entries, '2024-01-20T10:00:00.000Z');
  assert.equal(bwJanuary, 56);

  // Active workout (no date provided) -> uses latest (65 kg)
  const bwActive = resolveBodyweightKgAtDate(entries);
  assert.equal(bwActive, 65);

  // Workout before any recorded bodyweight -> null (does not invent one)
  const bwOld = resolveBodyweightKgAtDate(entries, '2023-11-01');
  assert.equal(bwOld, null);
});

test('Test I: PR eligibility is context-aware', () => {
  const bench = exercise({ name: 'Barbell bench press', category: 'barbell' });
  const pullUp = exercise({ name: 'Pull-up', category: 'bodyweight' });
  const assistedPullUp = exercise({ id: 'ex-0017', name: 'Assisted pull-up', category: 'bodyweight' });

  // Barbell 0 kg is NOT eligible for PR
  assert.equal(
    isSetEligibleForPersonalRecord({
      set: { setIndex: 1, weightKg: 0, reps: 5, completed: true, setType: 'working' },
      exercise: bench,
      bodyweightKg: 70
    }),
    false
  );

  // Pull-up 0 kg with BW 70 IS eligible for PR (effective load 70 > 0)
  assert.equal(
    isSetEligibleForPersonalRecord({
      set: { setIndex: 1, weightKg: 0, reps: 10, completed: true, setType: 'working' },
      exercise: pullUp,
      bodyweightKg: 70
    }),
    true
  );

  // Assisted pull-up where assistance >= BW (effective load 0) is NOT eligible for PR
  assert.equal(
    isSetEligibleForPersonalRecord({
      set: { setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working' },
      exercise: assistedPullUp,
      bodyweightKg: 70
    }),
    false
  );

  // Assisted pull-up with 25 kg assistance and BW 70 IS eligible (effective load 45 > 0)
  assert.equal(
    isSetEligibleForPersonalRecord({
      set: { setIndex: 1, weightKg: 25, reps: 8, completed: true, setType: 'working' },
      exercise: assistedPullUp,
      bodyweightKg: 70
    }),
    true
  );
});

test('Test J: 1RM calculations for weighted bodyweight use effective load', () => {
  const pullUp = exercise({ name: 'Pull-up', category: 'bodyweight' });
  const set: LoggedSet = { setIndex: 1, weightKg: 20, reps: 5, completed: true, setType: 'working' };

  // Set logged external load is 20 kg
  assert.equal(set.weightKg, 20);

  // 1RM calculation with 70 kg bodyweight evaluates against 90 kg effective load:
  // 90 * (1 + 5/30) = 105 kg
  const est1Rm = calculateSetOneRm(set, { exercise: pullUp, bodyweightKg: 70 });
  assert.equal(est1Rm, 105);
});
