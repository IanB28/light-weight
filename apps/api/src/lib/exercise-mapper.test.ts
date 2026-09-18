import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEffectiveLoadKg, kilogramsToPounds, resolveExerciseLoadingProfile } from '@light-weight/domain';
import { toDomainExercise, type ExerciseRow } from '../routes/exercises.js';

function row(overrides: Partial<ExerciseRow>): ExerciseRow {
  return {
    id: 'legacy-smith', userId: null, name: 'Smith machine bench press', primaryMuscle: 'chest',
    secondaryMuscles: [], category: 'machine', loadMechanism: 'plate_loaded', loadMode: 'total',
    supportsKeyboard: true, supportsPlates: true, supportsExternalLoad: true, includeBarWeight: false,
    bodyweightFactor: null,
    isCustom: false, createdAt: new Date('2026-01-01T00:00:00Z'), ...overrides
  };
}

test('DB Smith row round-trip reconstructs fixed/selectable 20/22 lb base', () => {
  const mapped = toDomainExercise(row({}));
  const profile = resolveExerciseLoadingProfile(mapped).profile;
  assert.equal(profile.plateBase?.kind, 'fixed');
  assert.equal(Math.round(kilogramsToPounds(profile.plateBase?.weightKg || 0)), 20);
  assert.deepEqual(profile.plateBase?.selectableWeightsKg?.map((value) => Math.round(kilogramsToPounds(value))), [20, 22]);
});

test('curated Smith id survives a generic DB loading profile', () => {
  const mapped = toDomainExercise(row({ id: 'ex-0748', name: 'Bench press machine' }));
  assert.equal(mapped.loading?.plateBase?.label, 'smith');
});

test('toDomainExercise preserves explicit bodyweightFactor and assisted loadMode from DB row', () => {
  const mapped = toDomainExercise(row({
    id: 'custom-assisted-dip',
    name: 'Custom Assisted Dip',
    category: 'bodyweight',
    loadMechanism: 'bodyweight',
    loadMode: 'assisted',
    bodyweightFactor: 1,
    isCustom: true
  }));
  assert.equal(mapped.loading?.mechanism, 'bodyweight');
  assert.equal(mapped.loading?.loadMode, 'assisted');
  assert.equal(mapped.loading?.bodyweightFactor, 1);
  assert.equal(mapped.loading?.supportsExternalLoad, true);
});

test('toDomainExercise preserves added_weight with factor = 1 in round-trip', () => {
  const mapped = toDomainExercise(row({
    id: 'custom-weighted-pullup',
    name: 'Weighted Pullup Custom',
    category: 'bodyweight',
    loadMechanism: 'bodyweight',
    loadMode: 'added_weight',
    bodyweightFactor: 1,
    isCustom: true
  }));
  assert.equal(mapped.loading?.mechanism, 'bodyweight');
  assert.equal(mapped.loading?.loadMode, 'added_weight');
  assert.equal(mapped.loading?.bodyweightFactor, 1);
});

test('toDomainExercise handles general bodyweightFactor (e.g. 0.5)', () => {
  const mapped = toDomainExercise(row({
    id: 'custom-pushup-partial',
    name: 'Pushup Partial 0.5',
    category: 'bodyweight',
    loadMechanism: 'bodyweight',
    loadMode: 'added_weight',
    bodyweightFactor: 0.5,
    isCustom: true
  }));
  assert.equal(mapped.loading?.bodyweightFactor, 0.5);
});

test('toDomainExercise sets bodyweightFactor to undefined when DB column is null', () => {
  const mapped = toDomainExercise(row({
    id: 'custom-generic-movement',
    name: 'Generic Movement',
    category: 'bodyweight',
    loadMechanism: 'bodyweight',
    loadMode: 'added_weight',
    bodyweightFactor: null,
    isCustom: true
  }));
  assert.equal(mapped.loading?.bodyweightFactor, undefined);
});

test('seed-catalog mapRawCatalogExerciseToDb preserves bodyweightFactor for assisted and weighted bodyweight', async () => {
  const { mapRawCatalogExerciseToDb } = await import('../db/seed-catalog.js');

  const assisted = mapRawCatalogExerciseToDb({
    id: '0017',
    n: 'assisted pull-up',
    bp: 'back',
    tg: 'lats',
    eq: 'assisted'
  });
  assert.equal(assisted.loadMechanism, 'bodyweight');
  assert.equal(assisted.loadMode, 'assisted');
  assert.equal(assisted.bodyweightFactor, 1);

  const weighted = mapRawCatalogExerciseToDb({
    id: '0841',
    n: 'weighted pull-up',
    bp: 'back',
    tg: 'lats',
    eq: 'body weight'
  });
  assert.equal(weighted.loadMechanism, 'bodyweight');
  assert.equal(weighted.loadMode, 'added_weight');
  assert.equal(weighted.bodyweightFactor, 1);

  const standardPullUp = mapRawCatalogExerciseToDb({
    id: '0652',
    n: 'pull-up',
    bp: 'back',
    tg: 'lats',
    eq: 'body weight'
  });
  assert.equal(standardPullUp.loadMechanism, 'bodyweight');
  assert.equal(standardPullUp.loadMode, 'added_weight');
  assert.equal(standardPullUp.bodyweightFactor, 1);

  const pushUp = mapRawCatalogExerciseToDb({
    id: '0662',
    n: 'push-up',
    bp: 'chest',
    tg: 'pectorals',
    eq: 'body weight'
  });
  assert.equal(pushUp.loadMechanism, 'bodyweight');
  assert.equal(pushUp.loadMode, 'added_weight');
  assert.equal(pushUp.bodyweightFactor, null);

  const bench = mapRawCatalogExerciseToDb({
    id: 'bench',
    n: 'barbell bench press',
    bp: 'chest',
    tg: 'pectorals',
    eq: 'barbell'
  });
  assert.equal(bench.bodyweightFactor, null);
});

test('legacy DB row with bodyweightFactor = null for curated weighted pull-up (ex-0841) is restored to 1 and evaluates at 90kg effective load', () => {
  const legacyRow = row({
    id: 'ex-0841',
    name: 'Weighted pull-up',
    category: 'bodyweight',
    loadMechanism: 'bodyweight',
    loadMode: 'added_weight',
    bodyweightFactor: null,
    isCustom: false
  });

  const domainExercise = toDomainExercise(legacyRow);
  assert.equal(domainExercise.loading?.bodyweightFactor, 1);

  const effectiveLoad = calculateEffectiveLoadKg({
    exercise: domainExercise,
    setWeightKg: 20,
    bodyweightKg: 70
  });
  assert.equal(effectiveLoad, 90);

  // Generic push-up safety: uncurated bodyweight movement without factor must not invent BW
  const pushUpRow = row({
    id: 'ex-pushup',
    name: 'Push-up',
    category: 'bodyweight',
    loadMechanism: 'bodyweight',
    loadMode: 'added_weight',
    bodyweightFactor: null,
    isCustom: false
  });
  const pushUpDomain = toDomainExercise(pushUpRow);
  assert.equal(pushUpDomain.loading?.bodyweightFactor, undefined);
  assert.equal(
    calculateEffectiveLoadKg({ exercise: pushUpDomain, setWeightKg: 20, bodyweightKg: 70 }),
    20
  );
});
