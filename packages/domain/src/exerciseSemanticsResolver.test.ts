import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveExerciseSemantics,
  EXERCISE_ID_TO_SEMANTICS_KEY,
  type ResolvedExerciseContributionTarget
} from './exerciseSemanticsResolver.js';
import {
  EXERCISE_SEMANTICS_REGISTRY,
  validateExerciseSemantics,
  type ExerciseSemanticsV2
} from './exerciseSemantics.js';

test('1. Semantic v2 Resolution: Curated exercise resolves exact v2 profile', () => {
  // Flat Bench Press: ex-0025
  const benchExercise = {
    id: 'ex-0025',
    name: 'Barbell Bench Press',
    primaryMuscle: 'chest' as const,
    secondaryMuscles: ['triceps', 'shoulders'] as any
  };

  const resolved = resolveExerciseSemantics(benchExercise);

  assert.equal(resolved.source, 'semantic_v2');
  assert.equal(resolved.profileKey, 'flat_bench_press');
  assert.equal(resolved.movementFamily, 'bench_press');
  assert.equal(resolved.variation, 'flat_barbell');

  // Verify exact contributions from EXERCISE_SEMANTICS_REGISTRY
  const expectedProfile = EXERCISE_SEMANTICS_REGISTRY.flat_bench_press;
  assert.equal(resolved.contributions.length, expectedProfile.contributions.length);

  const chestContrib = resolved.contributions.find(
    (c) => c.target.kind === 'anatomical' && c.target.entity === 'pectoralis_major'
  );
  assert.ok(chestContrib);
  assert.equal(chestContrib?.role, 'prime');

  const tricepsContrib = resolved.contributions.find(
    (c) => c.target.kind === 'anatomical' && c.target.entity === 'triceps_brachii'
  );
  assert.ok(tricepsContrib);
  assert.equal(tricepsContrib?.role, 'co_prime');

  const anteriorDeltContrib = resolved.contributions.find(
    (c) => c.target.kind === 'anatomical' && c.target.entity === 'anterior_deltoid'
  );
  assert.ok(anteriorDeltContrib);
  assert.equal(anteriorDeltContrib?.role, 'secondary');

  const rotatorCuffContrib = resolved.contributions.find(
    (c) => c.target.kind === 'functional' && c.target.group === 'rotator_cuff'
  );
  assert.ok(rotatorCuffContrib);
  assert.equal(rotatorCuffContrib?.role, 'stabilizer');
});

test('2. Legacy Fallback: Uncurated exercise falls back to conservative model without inventing metadata', () => {
  const customExercise = {
    id: 'ex-custom-999',
    name: 'Custom Arm Blaster',
    primaryMuscle: 'biceps' as const,
    secondaryMuscles: ['forearms'] as any
  };

  const resolved = resolveExerciseSemantics(customExercise);

  assert.equal(resolved.source, 'legacy');
  assert.equal(resolved.profileKey, undefined);
  assert.equal(resolved.contributions.length, 2);

  const primeContrib = resolved.contributions[0];
  assert.equal(primeContrib.target.kind, 'legacy');
  if (primeContrib.target.kind === 'legacy') {
    assert.equal(primeContrib.target.group, 'biceps');
  }
  assert.equal(primeContrib.role, 'prime');

  const secContrib = resolved.contributions[1];
  assert.equal(secContrib.target.kind, 'legacy');
  if (secContrib.target.kind === 'legacy') {
    assert.equal(secContrib.target.group, 'forearms');
  }
  assert.equal(secContrib.role, 'secondary');

  // Must not invent co_prime, stabilizers, or confidence
  assert.equal(primeContrib.confidence, undefined);
  assert.equal(primeContrib.status, undefined);
});

test('3. Hardening A Separation: validateExerciseSemantics() strictly rejects legacy target kind', () => {
  const invalidProfile: any = {
    movementFamily: 'bench_press',
    variation: 'invalid_legacy',
    contributions: [
      {
        target: { kind: 'legacy', group: 'chest' },
        role: 'prime',
        confidence: 'high',
        status: 'established'
      }
    ]
  };

  const validationResult = validateExerciseSemantics(invalidProfile);
  assert.equal(validationResult.valid, false, 'Profile with kind legacy must be rejected by validator');
  assert.ok(
    validationResult.errors.some((err) => err.includes('target.kind is invalid')),
    'Must report target.kind error for legacy kind'
  );
});

test('4. Hardening A Separation: ResolvedExerciseContributionTarget permits legacy kind at resolution time', () => {
  const legacyTarget: ResolvedExerciseContributionTarget = {
    kind: 'legacy',
    group: 'quadriceps'
  };
  assert.equal(legacyTarget.kind, 'legacy');
  assert.equal(legacyTarget.group, 'quadriceps');

  const anatomicalTarget: ResolvedExerciseContributionTarget = {
    kind: 'anatomical',
    entity: 'quadriceps'
  };
  assert.equal(anatomicalTarget.kind, 'anatomical');
});

test('5. Hardening F Integrity: Every mapped catalog ID references a profile that exists in registry', () => {
  const entries = Object.entries(EXERCISE_ID_TO_SEMANTICS_KEY);
  assert.ok(entries.length >= 14, 'Must have at least 14 mapped catalog IDs');

  for (const [exerciseId, profileKey] of entries) {
    assert.ok(
      exerciseId.startsWith('ex-'),
      `Mapped exercise ID "${exerciseId}" must use canonical catalog ID prefix`
    );
    assert.ok(
      profileKey in EXERCISE_SEMANTICS_REGISTRY,
      `Mapped profile key "${profileKey}" for "${exerciseId}" must exist in EXERCISE_SEMANTICS_REGISTRY`
    );
  }
});

test('6. Curated Profiles Integrity: All registry entries pass validateExerciseSemantics()', () => {
  for (const [key, profile] of Object.entries(EXERCISE_SEMANTICS_REGISTRY)) {
    const result = validateExerciseSemantics(profile);
    assert.ok(
      result.valid,
      `Curated profile "${key}" must pass validation: ${result.errors.join(', ')}`
    );
  }
});

test('7. Multiple Curated Profiles: Back Squat and Barbell Deadlift resolve correctly', () => {
  // Back squat
  const squat = resolveExerciseSemantics({
    id: 'ex-0043',
    name: 'Barbell Full Squat',
    primaryMuscle: 'quadriceps',
    secondaryMuscles: ['glutes', 'hamstrings']
  });
  assert.equal(squat.source, 'semantic_v2');
  assert.equal(squat.profileKey, 'back_squat');
  assert.equal(squat.movementFamily, 'squat');

  // Deadlift
  const deadlift = resolveExerciseSemantics({
    id: 'ex-0032',
    name: 'Barbell Deadlift',
    primaryMuscle: 'back',
    secondaryMuscles: ['glutes', 'hamstrings']
  });
  assert.equal(deadlift.source, 'semantic_v2');
  assert.equal(deadlift.profileKey, 'conventional_deadlift');
  assert.equal(deadlift.movementFamily, 'deadlift');
});
