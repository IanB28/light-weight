import test from 'node:test';
import assert from 'node:assert/strict';
import { kilogramsToPounds, resolveExerciseLoadingProfile } from '@light-weight/domain';
import { toDomainExercise, type ExerciseRow } from '../routes/exercises.js';

function row(overrides: Partial<ExerciseRow>): ExerciseRow {
  return {
    id: 'legacy-smith', userId: null, name: 'Smith machine bench press', primaryMuscle: 'chest',
    secondaryMuscles: [], category: 'machine', loadMechanism: 'plate_loaded', loadMode: 'total',
    supportsKeyboard: true, supportsPlates: true, supportsExternalLoad: true, includeBarWeight: false,
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
