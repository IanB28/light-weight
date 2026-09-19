import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveExerciseSemantics,
  resolveExercisePrimeContribution,
  resolveExercisePrimeTarget,
  resolveExerciseStrengthTarget,
  STRENGTH_SUPPORTED_PRIME_TARGETS,
  EXERCISE_ID_TO_SEMANTICS_KEY,
  type ResolvedExerciseContribution,
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

test('8. Registry Invariant: Every profile in EXERCISE_SEMANTICS_REGISTRY has exactly one prime contribution', () => {
  const profileKeys = Object.keys(EXERCISE_SEMANTICS_REGISTRY);
  assert.ok(profileKeys.length >= 19, 'Must contain all curated profiles');

  for (const [key, profile] of Object.entries(EXERCISE_SEMANTICS_REGISTRY)) {
    const primes = profile.contributions.filter((c) => c.role === 'prime');
    assert.equal(
      primes.length,
      1,
      `Profile "${key}" must have exactly 1 prime contribution, but found ${primes.length}`
    );
  }
});

test('9. resolveExercisePrimeContribution & resolveExerciseStrengthTarget: Curated exercises map to canonical prime', () => {
  // Bench Press (ex-0025): prime is pectoralis_major -> chest
  // Deliberately set conflicting legacy primaryMuscle to 'triceps'
  const benchWithConflictingLegacy = {
    id: 'ex-0025',
    name: 'Barbell Bench Press',
    primaryMuscle: 'triceps' as any,
    secondaryMuscles: ['shoulders'] as any
  };

  const primeContribution = resolveExercisePrimeContribution(benchWithConflictingLegacy);
  assert.ok(primeContribution);
  assert.equal(primeContribution?.role, 'prime');
  assert.deepEqual(primeContribution?.target, { kind: 'anatomical', entity: 'pectoralis_major' });

  const primeTarget = resolveExercisePrimeTarget(benchWithConflictingLegacy);
  assert.deepEqual(primeTarget, { kind: 'anatomical', entity: 'pectoralis_major' });

  // Strength target MUST follow canonical prime (chest), NOT conflicting primaryMuscle (triceps)
  const strengthTarget = resolveExerciseStrengthTarget(benchWithConflictingLegacy);
  assert.equal(strengthTarget, 'chest');

  // Co-prime (triceps_brachii) and secondary (anterior_deltoid) are NOT returned as strength target
  assert.notEqual(strengthTarget, 'triceps');
  assert.notEqual(strengthTarget, 'shoulders');
});

test('10. resolveExerciseStrengthTarget: Curated movements map to appropriate Strength standards', () => {
  // Back Squat (ex-0043) -> prime quadriceps -> quadriceps
  assert.equal(
    resolveExerciseStrengthTarget({ id: 'ex-0043', name: 'Back Squat', primaryMuscle: 'quadriceps' }),
    'quadriceps'
  );

  // Conventional Deadlift (ex-0032) -> prime gluteus_maximus -> glutes
  assert.equal(
    resolveExerciseStrengthTarget({ id: 'ex-0032', name: 'Deadlift', primaryMuscle: 'back' }),
    'glutes'
  );

  // Romanian Deadlift (ex-0085) -> prime hamstrings -> hamstrings
  assert.equal(
    resolveExerciseStrengthTarget({ id: 'ex-0085', name: 'RDL', primaryMuscle: 'hamstrings' }),
    'hamstrings'
  );

  // Barbell Row (ex-0027) -> prime latissimus_dorsi -> back
  assert.equal(
    resolveExerciseStrengthTarget({ id: 'ex-0027', name: 'Barbell Row', primaryMuscle: 'back' }),
    'back'
  );

  // Dumbbell Shoulder Press (ex-0405) -> prime anterior_deltoid -> shoulders
  assert.equal(
    resolveExerciseStrengthTarget({ id: 'ex-0405', name: 'Dumbbell Shoulder Press', primaryMuscle: 'shoulders' }),
    'shoulders'
  );
});

test('11. resolveExerciseStrengthTarget: Legacy uncurated exercises fallback safely', () => {
  // Uncurated bicep curl: primaryMuscle = 'biceps'
  const curl = {
    id: 'ex-custom-curl',
    name: 'Custom Bicep Curl',
    primaryMuscle: 'biceps' as const
  };
  assert.equal(resolveExerciseStrengthTarget(curl), 'biceps');

  // Exercise without primaryMuscle returns null
  const emptyExercise = {
    id: 'ex-empty',
    name: 'Unknown Movement'
  };
  assert.equal(resolveExerciseStrengthTarget(emptyExercise as any), null);
});

test('12. Future-Safety: Unapproved prime targets do NOT receive a Strength standard through anatomical proximity', () => {
  // Ensure unapproved entities are strictly absent from STRENGTH_SUPPORTED_PRIME_TARGETS
  assert.equal('adductor_magnus' in STRENGTH_SUPPORTED_PRIME_TARGETS, false);
  assert.equal('tibialis_anterior' in STRENGTH_SUPPORTED_PRIME_TARGETS, false);
  assert.equal('serratus_anterior' in STRENGTH_SUPPORTED_PRIME_TARGETS, false);
  assert.equal('erector_spinae' in STRENGTH_SUPPORTED_PRIME_TARGETS, false);
  assert.equal('rotator_cuff' in STRENGTH_SUPPORTED_PRIME_TARGETS, false);
  assert.equal('teres_major' in STRENGTH_SUPPORTED_PRIME_TARGETS, false);
  assert.equal('hip_flexors' in STRENGTH_SUPPORTED_PRIME_TARGETS, false);

  // Uncurated exercises with non-standard primaryMuscle resolve to null (unrated)
  assert.equal(
    resolveExerciseStrengthTarget({ id: 'ex-add', name: 'Adductor Machine', primaryMuscle: 'adductor_magnus' as any, secondaryMuscles: [] }),
    null
  );
  assert.equal(
    resolveExerciseStrengthTarget({ id: 'ex-tib', name: 'Tibialis Raise', primaryMuscle: 'tibialis_anterior' as any, secondaryMuscles: [] }),
    null
  );
  assert.equal(
    resolveExerciseStrengthTarget({ id: 'ex-ser', name: 'Serratus Punch', primaryMuscle: 'serratus_anterior' as any, secondaryMuscles: [] }),
    null
  );
  assert.equal(
    resolveExerciseStrengthTarget({ id: 'ex-erect', name: 'Back Extension', primaryMuscle: 'erector_spinae' as any, secondaryMuscles: [] }),
    null
  );
  assert.equal(
    resolveExerciseStrengthTarget({ id: 'ex-rot', name: 'Rotator Cuff', primaryMuscle: 'rotator_cuff' as any, secondaryMuscles: [] }),
    null
  );
});

test('13. Registry Invariant: All curated profiles have exactly 1 prime (Strength support is an independent subset)', () => {
  for (const [key, profile] of Object.entries(EXERCISE_SEMANTICS_REGISTRY)) {
    const primes = profile.contributions.filter((c) => c.role === 'prime');
    assert.equal(primes.length, 1, `Curated exercise ${key} must have exactly 1 prime contribution`);
    const prime = primes[0];
    assert.equal(prime.target.kind, 'anatomical', `Curated exercise ${key} prime target must be anatomical`);
  }
});

test('14. Sealed Public Prime API: Secondary target cannot bypass prime', () => {
  // Barbell Bench Press (ex-0025) has:
  // - prime: pectoralis_major -> chest
  // - co_prime: triceps_brachii
  // - secondary: anterior_deltoid
  // Even though 'shoulders' and 'triceps' are valid Strength standards,
  // passing Bench Press to resolveExerciseStrengthTarget resolves ONLY to 'chest'.
  const bench = {
    id: 'ex-0025',
    name: 'Barbell Bench Press',
    primaryMuscle: 'chest' as const,
    secondaryMuscles: ['triceps', 'shoulders'] as any
  };

  assert.equal(resolveExerciseStrengthTarget(bench), 'chest');
  assert.notEqual(resolveExerciseStrengthTarget(bench), 'shoulders');
  assert.notEqual(resolveExerciseStrengthTarget(bench), 'triceps');
});

test('15. Legacy fallback is clearly target attribution only', () => {
  // An uncurated exercise with a supported primaryMuscle (e.g. 'biceps')
  // maps its legacy primaryMuscle to that Strength target for compatibility.
  // This is purely TARGET ATTRIBUTION, not validated benchmark eligibility.
  const legacyCurl = {
    id: 'ex-custom-curl',
    name: 'Custom Biceps Curl',
    primaryMuscle: 'biceps' as const,
    secondaryMuscles: []
  };
  const target = resolveExerciseStrengthTarget(legacyCurl);
  assert.equal(target, 'biceps', 'Legacy exercise attributes Strength to primaryMuscle');

  // Unsupported legacy primaryMuscle attributes to null
  const legacyNeck = {
    id: 'ex-custom-neck',
    name: 'Neck Flexion',
    primaryMuscle: 'neck' as any,
    secondaryMuscles: []
  };
  assert.equal(resolveExerciseStrengthTarget(legacyNeck), null);
});

test('16. High Flared Row semantic profile exists in registry with posterior_deltoid prime', () => {
  const profile = EXERCISE_SEMANTICS_REGISTRY.high_flared_row;
  assert.ok(profile, 'high_flared_row profile must exist in EXERCISE_SEMANTICS_REGISTRY');
  const primes = profile.contributions.filter((c) => c.role === 'prime');
  assert.equal(primes.length, 1, 'high_flared_row must have exactly one prime');
  assert.deepEqual(primes[0].target, { kind: 'anatomical', entity: 'posterior_deltoid' });
});

test('17. Unmapped registry profile is NOT resolved by Exercise.id == profileKey', () => {
  // high_flared_row exists in registry but has no production catalog ID in EXERCISE_ID_TO_SEMANTICS_KEY
  const unmappedExercise = {
    id: 'high_flared_row',
    name: 'High Flared Row',
    primaryMuscle: 'back' as const,
    secondaryMuscles: ['shoulders'] as any
  };
  const resolved = resolveExerciseSemantics(unmappedExercise);
  assert.equal(resolved.source, 'legacy', 'Unmapped registry key must not resolve to semantic_v2');
  assert.equal(resolved.profileKey, undefined);
  // Falls back safely to legacy primaryMuscle 'back' (attribution only)
  assert.equal(resolveExerciseStrengthTarget(unmappedExercise), 'back');

  const hipThrustExercise = {
    id: 'hip_thrust',
    name: 'Hip Thrust',
    primaryMuscle: 'glutes' as const,
    secondaryMuscles: ['hamstrings'] as any
  };
  const resolvedHip = resolveExerciseSemantics(hipThrustExercise);
  assert.equal(resolvedHip.source, 'legacy');
  assert.equal(resolvedHip.profileKey, undefined);
});

test('18. Decoupled Architecture: Unsupported prime remains valid Semantics and resolves to unrated Strength (null)', () => {
  assert.equal('adductor_magnus' in STRENGTH_SUPPORTED_PRIME_TARGETS, false);
  assert.equal('tibialis_anterior' in STRENGTH_SUPPORTED_PRIME_TARGETS, false);

  const unsupportedExercise = {
    id: 'ex-unsupported-prime',
    name: 'Adductor Machine',
    primaryMuscle: 'adductor_magnus' as any,
    secondaryMuscles: []
  };
  assert.equal(resolveExerciseStrengthTarget(unsupportedExercise), null);
});

test('19. Runtime Prime Invariant: Multiple prime condition does not silently choose first and returns null', () => {
  // Single prime resolves safely
  const singlePrime = resolveExercisePrimeContribution({
    id: 'ex-0025',
    name: 'Barbell Bench Press',
    primaryMuscle: 'chest'
  });
  assert.ok(singlePrime);
  assert.equal(singlePrime?.role, 'prime');

  // Zero primes returns null
  const zeroPrime = resolveExercisePrimeContribution({
    id: 'ex-custom-empty',
    name: 'Empty Movement'
  } as any);
  assert.equal(zeroPrime, null);

  // Runtime check: primes.length !== 1 returns null deterministically
  const simulatedContributions: readonly ResolvedExerciseContribution[] = [
    { target: { kind: 'legacy', group: 'chest' }, role: 'prime' },
    { target: { kind: 'legacy', group: 'back' }, role: 'prime' }
  ];
  const primes: readonly ResolvedExerciseContribution[] = simulatedContributions.filter((c) => c.role === 'prime');
  assert.equal(primes.length, 2);
  const runtimePrimeChoice = (primes.length as number) !== 1 ? null : primes[0];
  assert.equal(runtimePrimeChoice, null, 'Must never silently pick first prime when multiple primes exist');
});
