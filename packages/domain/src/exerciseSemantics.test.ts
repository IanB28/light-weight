import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as semantics from './exerciseSemantics.js';
import {
  type MuscleRole,
  type EvidenceConfidence,
  type SemanticEvidenceStatus,
  type ExerciseSemanticsV2,
  type MuscleContributionTarget,
  VALID_MUSCLE_ROLES,
  VALID_EVIDENCE_CONFIDENCES,
  VALID_SEMANTIC_EVIDENCE_STATUSES,
  VALID_MOVEMENT_FAMILIES,
  VALID_MODIFIER_CONDITIONS,
  VALID_MODIFIER_EFFECTS,
  getMuscleContributionTargetKey,
  validateExerciseSemantics,
  LOWER_BODY_SEMANTICS_REGISTRY,
  UPPER_BODY_SEMANTICS_REGISTRY,
  EXERCISE_SEMANTICS_REGISTRY
} from './exerciseSemantics.js';
import {
  FUNCTIONAL_MUSCLE_GROUPS,
  isFunctionalMuscleGroup
} from './muscleTaxonomy.js';

test('1. Role Model: all 6 canonical MuscleRole values are recognized', () => {
  const expectedRoles: MuscleRole[] = [
    'prime',
    'co_prime',
    'secondary',
    'resisted_isometric',
    'stabilizer',
    'minimal'
  ];

  assert.equal(VALID_MUSCLE_ROLES.size, 6);
  for (const role of expectedRoles) {
    assert.ok(VALID_MUSCLE_ROLES.has(role), `Expected role "${role}" to be valid`);
  }
});

test('2. Role Model: all EvidenceConfidence values are recognized', () => {
  const confidences: EvidenceConfidence[] = ['high', 'moderate', 'low'];
  assert.equal(VALID_EVIDENCE_CONFIDENCES.size, 3);
  for (const c of confidences) {
    assert.ok(VALID_EVIDENCE_CONFIDENCES.has(c));
  }
});

test('3. Role Model: all SemanticEvidenceStatus values are recognized', () => {
  const statuses: SemanticEvidenceStatus[] = ['established', 'provisional', 'unresolved'];
  assert.equal(VALID_SEMANTIC_EVIDENCE_STATUSES.size, 3);
  for (const s of statuses) {
    assert.ok(VALID_SEMANTIC_EVIDENCE_STATUSES.has(s));
  }
});

test('3b. Functional Group Model: isFunctionalMuscleGroup guards runtime values without exposing mutable Set', () => {
  assert.equal(FUNCTIONAL_MUSCLE_GROUPS.length, 5);
  for (const group of FUNCTIONAL_MUSCLE_GROUPS) {
    assert.equal(isFunctionalMuscleGroup(group), true, `Expected ${group} to be valid functional group`);
  }

  assert.equal(isFunctionalMuscleGroup('invalid_group'), false);
  assert.equal(isFunctionalMuscleGroup('pectoralis_major'), false);
  assert.equal(isFunctionalMuscleGroup('chest'), false);
  assert.equal(isFunctionalMuscleGroup(null), false);
  assert.equal(isFunctionalMuscleGroup(undefined), false);
  assert.equal(isFunctionalMuscleGroup(123), false);
});

test('4. Target Model: getMuscleContributionTargetKey generates deterministic keys', () => {
  const anatomicalTarget: MuscleContributionTarget = { kind: 'anatomical', entity: 'pectoralis_major' };
  const functionalTarget: MuscleContributionTarget = { kind: 'functional', group: 'rotator_cuff' };

  assert.equal(getMuscleContributionTargetKey(anatomicalTarget), 'anatomical:pectoralis_major');
  assert.equal(getMuscleContributionTargetKey(functionalTarget), 'functional:rotator_cuff');
});

test('5. Validator: validates anatomical and functional targets in profile', () => {
  const profile: ExerciseSemanticsV2 = {
    version: 2,
    movementFamily: 'bench_press',
    variation: 'flat_barbell',
    contributions: [
      { target: { kind: 'anatomical', entity: 'pectoralis_major' }, role: 'prime', confidence: 'high', status: 'established' },
      { target: { kind: 'functional', group: 'rotator_cuff' }, role: 'stabilizer', confidence: 'high', status: 'established' }
    ]
  };

  const res = validateExerciseSemantics(profile);
  assert.equal(res.valid, true);
  assert.deepEqual(res.errors, []);
});

test('6. Validator: rejects invalid version, empty contributions, and malformed input', () => {
  assert.equal(validateExerciseSemantics(null).valid, false);
  assert.equal(validateExerciseSemantics(undefined).valid, false);
  assert.equal(validateExerciseSemantics('string').valid, false);

  const wrongVersion = {
    version: 1,
    movementFamily: 'squat',
    contributions: [
      { target: { kind: 'anatomical', entity: 'quadriceps' }, role: 'prime', confidence: 'high', status: 'established' }
    ]
  };
  const resVersion = validateExerciseSemantics(wrongVersion);
  assert.equal(resVersion.valid, false);
  assert.ok(resVersion.errors.some((e) => e.includes('Invalid version')));

  const emptyContributions = {
    version: 2,
    movementFamily: 'squat',
    contributions: []
  };
  assert.equal(validateExerciseSemantics(emptyContributions).valid, false);
});

test('7. Validator: rejects MuscleRegion as contribution target (regional kind)', () => {
  const regionalTargetProfile = {
    version: 2,
    movementFamily: 'bench_press',
    contributions: [
      { target: { kind: 'regional', region: 'chest' }, role: 'prime', confidence: 'high', status: 'established' }
    ]
  };
  const res = validateExerciseSemantics(regionalTargetProfile);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('target.kind is invalid: regional')));
});

test('8. Validator: rejects unknown anatomical entity in runtime', () => {
  const invalidAnatomical = {
    version: 2,
    movementFamily: 'bench_press',
    contributions: [
      { target: { kind: 'anatomical', entity: 'non_existent_muscle' }, role: 'prime', confidence: 'high', status: 'established' }
    ]
  };
  const res = validateExerciseSemantics(invalidAnatomical);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('not a recognized MuscleEntityId')));
});

test('9. Validator: rejects unknown functional group in runtime', () => {
  const invalidFunctional = {
    version: 2,
    movementFamily: 'bench_press',
    contributions: [
      { target: { kind: 'functional', group: 'invalid_functional_group' }, role: 'stabilizer', confidence: 'high', status: 'established' }
    ]
  };
  const res = validateExerciseSemantics(invalidFunctional);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('not a recognized FunctionalMuscleGroup')));
});

test('10. Validator: rejects duplicate anatomical target contributions within same profile', () => {
  const duplicateAnatomical = {
    version: 2,
    movementFamily: 'squat',
    contributions: [
      { target: { kind: 'anatomical', entity: 'quadriceps' }, role: 'prime', confidence: 'high', status: 'established' },
      { target: { kind: 'anatomical', entity: 'quadriceps' }, role: 'secondary', confidence: 'moderate', status: 'provisional' }
    ]
  };
  const res = validateExerciseSemantics(duplicateAnatomical);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('Duplicate target contribution: anatomical:quadriceps')));
});

test('11. Validator: rejects duplicate functional target contributions within same profile', () => {
  const duplicateFunctional = {
    version: 2,
    movementFamily: 'bench_press',
    contributions: [
      { target: { kind: 'functional', group: 'rotator_cuff' }, role: 'stabilizer', confidence: 'high', status: 'established' },
      { target: { kind: 'functional', group: 'rotator_cuff' }, role: 'secondary', confidence: 'low', status: 'provisional' }
    ]
  };
  const res = validateExerciseSemantics(duplicateFunctional);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('Duplicate target contribution: functional:rotator_cuff')));
});

test('12. Validator: accepts modifier targeting functional group when present in contributions', () => {
  const validFunctionalModifier = {
    version: 2,
    movementFamily: 'bench_press',
    contributions: [
      { target: { kind: 'anatomical', entity: 'pectoralis_major' }, role: 'prime', confidence: 'high', status: 'established' },
      { target: { kind: 'functional', group: 'rotator_cuff' }, role: 'stabilizer', confidence: 'high', status: 'established' }
    ],
    modifiers: [
      {
        id: 'mod_rotator_cuff',
        target: { kind: 'functional', group: 'rotator_cuff' },
        condition: 'elbow_path_flared',
        effect: 'increased_contribution',
        confidence: 'moderate',
        status: 'provisional'
      }
    ]
  };
  const res = validateExerciseSemantics(validFunctionalModifier);
  assert.equal(res.valid, true);
});

test('13. Validator: rejects modifier pointing to target not present in profile contributions', () => {
  const invalidModifier = {
    version: 2,
    movementFamily: 'squat',
    contributions: [
      { target: { kind: 'anatomical', entity: 'quadriceps' }, role: 'prime', confidence: 'high', status: 'established' }
    ],
    modifiers: [
      {
        id: 'mod_1',
        target: { kind: 'anatomical', entity: 'adductor_magnus' }, // NOT in contributions!
        condition: 'deep_hip_flexion',
        effect: 'increased_contribution',
        confidence: 'moderate',
        status: 'provisional'
      }
    ]
  };
  const res = validateExerciseSemantics(invalidModifier);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('references target "anatomical:adductor_magnus" which does not exist in profile contributions')));
});

test('14. Lower Body Regression: Back Squat profile has exact contributions, roles and modifier', () => {
  const squat = LOWER_BODY_SEMANTICS_REGISTRY['back_squat'];
  assert.ok(squat, 'back_squat profile must exist in registry');
  assert.equal(squat.version, 2);
  assert.equal(squat.movementFamily, 'squat');
  assert.equal(squat.variation, 'back_squat');

  const contribMap = new Map(squat.contributions.map((c) => [getMuscleContributionTargetKey(c.target), c]));

  const quads = contribMap.get('anatomical:quadriceps');
  assert.ok(quads);
  assert.equal(quads.role, 'prime');
  assert.equal(quads.confidence, 'high');
  assert.equal(quads.status, 'established');

  const gmax = contribMap.get('anatomical:gluteus_maximus');
  assert.ok(gmax);
  assert.equal(gmax.role, 'co_prime');
  assert.equal(gmax.confidence, 'high');
  assert.equal(gmax.status, 'established');

  const hams = contribMap.get('anatomical:hamstrings');
  assert.ok(hams);
  assert.equal(hams.role, 'secondary');
  assert.equal(hams.confidence, 'high');
  assert.equal(hams.status, 'established');

  const am = contribMap.get('anatomical:adductor_magnus');
  assert.ok(am);
  assert.equal(am.role, 'secondary');
  assert.equal(am.confidence, 'moderate');
  assert.equal(am.status, 'established');

  const es = contribMap.get('anatomical:erector_spinae');
  assert.ok(es);
  assert.equal(es.role, 'resisted_isometric');
  assert.equal(es.confidence, 'high');
  assert.equal(es.status, 'established');

  const gmed = contribMap.get('anatomical:gluteus_medius');
  assert.ok(gmed);
  assert.equal(gmed.role, 'stabilizer');

  const gmin = contribMap.get('anatomical:gluteus_minimus');
  assert.ok(gmin);
  assert.equal(gmin.role, 'stabilizer');

  // Modifier: deep_hip_flexion on adductor_magnus
  assert.equal(squat.modifiers?.length, 1);
  const mod = squat.modifiers![0];
  assert.deepEqual(mod.target, { kind: 'anatomical', entity: 'adductor_magnus' });
  assert.equal(mod.condition, 'deep_hip_flexion');
  assert.equal(mod.effect, 'increased_contribution');
  assert.equal(mod.status, 'provisional');

  assert.equal(validateExerciseSemantics(squat).valid, true);
});

test('15. Lower Body Regression: Leg Press profile has exact contributions and no erector minimal', () => {
  const lp = LOWER_BODY_SEMANTICS_REGISTRY['generic_leg_press'];
  assert.ok(lp);
  assert.equal(lp.movementFamily, 'leg_press');
  assert.equal(lp.variation, 'generic_leg_press');

  const contribMap = new Map(lp.contributions.map((c) => [getMuscleContributionTargetKey(c.target), c]));
  assert.equal(contribMap.get('anatomical:quadriceps')?.role, 'prime');
  assert.equal(contribMap.get('anatomical:gluteus_maximus')?.role, 'co_prime');
  assert.equal(contribMap.get('anatomical:adductor_magnus')?.role, 'secondary');
  assert.equal(contribMap.get('anatomical:hamstrings')?.role, 'secondary');
  assert.equal(contribMap.has('anatomical:erector_spinae'), false);

  assert.equal(validateExerciseSemantics(lp).valid, true);
});

test('16. Lower Body Regression: Conventional Deadlift profile has exact contributions', () => {
  const dl = LOWER_BODY_SEMANTICS_REGISTRY['conventional_deadlift'];
  assert.ok(dl);
  assert.equal(dl.movementFamily, 'deadlift');
  assert.equal(dl.variation, 'conventional');

  const contribMap = new Map(dl.contributions.map((c) => [getMuscleContributionTargetKey(c.target), c]));
  assert.equal(contribMap.get('anatomical:gluteus_maximus')?.role, 'prime');
  assert.equal(contribMap.get('anatomical:hamstrings')?.role, 'co_prime');
  assert.equal(contribMap.get('anatomical:quadriceps')?.role, 'secondary');
  assert.equal(contribMap.get('anatomical:adductor_magnus')?.role, 'secondary');
  assert.equal(contribMap.get('anatomical:erector_spinae')?.role, 'resisted_isometric');

  assert.equal(validateExerciseSemantics(dl).valid, true);
});

test('17. Lower Body Regression: Sumo Deadlift profile has adductor_magnus marked provisional', () => {
  const sumo = LOWER_BODY_SEMANTICS_REGISTRY['sumo_deadlift'];
  assert.ok(sumo);
  assert.equal(sumo.movementFamily, 'deadlift');
  assert.equal(sumo.variation, 'sumo');

  const contribMap = new Map(sumo.contributions.map((c) => [getMuscleContributionTargetKey(c.target), c]));
  assert.equal(contribMap.get('anatomical:gluteus_maximus')?.role, 'prime');
  assert.equal(contribMap.get('anatomical:quadriceps')?.role, 'co_prime');
  assert.equal(contribMap.get('anatomical:hamstrings')?.role, 'secondary');

  const am = contribMap.get('anatomical:adductor_magnus');
  assert.ok(am);
  assert.equal(am.role, 'secondary');
  assert.equal(am.status, 'provisional');

  assert.equal(contribMap.get('anatomical:erector_spinae')?.role, 'resisted_isometric');
  assert.equal(validateExerciseSemantics(sumo).valid, true);
});

test('18. Lower Body Regression: Romanian Deadlift has hamstrings prime and quadriceps minimal', () => {
  const rdl = LOWER_BODY_SEMANTICS_REGISTRY['romanian_deadlift'];
  assert.ok(rdl);
  assert.equal(rdl.movementFamily, 'romanian_deadlift');
  assert.equal(rdl.variation, 'standard');

  const contribMap = new Map(rdl.contributions.map((c) => [getMuscleContributionTargetKey(c.target), c]));
  assert.equal(contribMap.get('anatomical:hamstrings')?.role, 'prime');
  assert.equal(contribMap.get('anatomical:gluteus_maximus')?.role, 'co_prime');
  assert.equal(contribMap.get('anatomical:adductor_magnus')?.role, 'secondary');
  assert.equal(contribMap.get('anatomical:adductor_magnus')?.status, 'provisional');
  assert.equal(contribMap.get('anatomical:quadriceps')?.role, 'minimal');
  assert.equal(contribMap.get('anatomical:erector_spinae')?.role, 'resisted_isometric');

  assert.equal(validateExerciseSemantics(rdl).valid, true);
});

test('19. Lower Body Regression: Hip Thrust profile has gluteus maximus prime and hamstrings secondary', () => {
  const ht = LOWER_BODY_SEMANTICS_REGISTRY['hip_thrust'];
  assert.ok(ht);
  assert.equal(ht.movementFamily, 'hip_thrust');
  assert.equal(ht.variation, 'barbell');

  const contribMap = new Map(ht.contributions.map((c) => [getMuscleContributionTargetKey(c.target), c]));
  assert.equal(contribMap.get('anatomical:gluteus_maximus')?.role, 'prime');
  assert.equal(contribMap.get('anatomical:hamstrings')?.role, 'secondary');
  assert.equal(contribMap.get('anatomical:quadriceps')?.role, 'secondary');

  assert.equal(validateExerciseSemantics(ht).valid, true);
});

test('20. Upper Body Registry: Flat Bench Press has exact contributions, roles, and modifiers', () => {
  const bench = UPPER_BODY_SEMANTICS_REGISTRY['flat_bench_press'];
  assert.ok(bench);
  assert.equal(bench.movementFamily, 'bench_press');
  assert.equal(bench.variation, 'flat_barbell');

  const contribMap = new Map(bench.contributions.map((c) => [getMuscleContributionTargetKey(c.target), c]));

  // pectoralis_major prime high established
  const pec = contribMap.get('anatomical:pectoralis_major');
  assert.ok(pec);
  assert.equal(pec.role, 'prime');
  assert.equal(pec.confidence, 'high');
  assert.equal(pec.status, 'established');

  // triceps_brachii co_prime high established
  const tri = contribMap.get('anatomical:triceps_brachii');
  assert.ok(tri);
  assert.equal(tri.role, 'co_prime');
  assert.equal(tri.confidence, 'high');
  assert.equal(tri.status, 'established');

  // anterior_deltoid secondary high established (INVARIANT: secondary, NOT co_prime)
  const adel = contribMap.get('anatomical:anterior_deltoid');
  assert.ok(adel);
  assert.equal(adel.role, 'secondary');
  assert.equal(adel.confidence, 'high');
  assert.equal(adel.status, 'established');

  // rotator_cuff functional stabilizer high established
  const rc = contribMap.get('functional:rotator_cuff');
  assert.ok(rc);
  assert.equal(rc.role, 'stabilizer');
  assert.equal(rc.confidence, 'high');
  assert.equal(rc.status, 'established');

  // Modifiers: narrow_grip triceps ↑, narrow_grip anterior_deltoid ↑, wide_grip triceps ↓
  assert.ok(bench.modifiers && bench.modifiers.length >= 2);
  const narrowTri = bench.modifiers.find((m) => m.condition === 'narrow_grip' && m.target.kind === 'anatomical' && m.target.entity === 'triceps_brachii');
  assert.ok(narrowTri);
  assert.equal(narrowTri.effect, 'increased_contribution');

  assert.equal(validateExerciseSemantics(bench).valid, true);
});

test('21. Upper Body Registry: Incline and Decline Bench Press profiles have exact structure', () => {
  const lowIncline = UPPER_BODY_SEMANTICS_REGISTRY['incline_bench_press'];
  assert.ok(lowIncline);
  assert.equal(lowIncline.variation, 'low_incline');
  const lowInclineMap = new Map(lowIncline.contributions.map((c) => [getMuscleContributionTargetKey(c.target), c]));
  assert.equal(lowInclineMap.get('anatomical:pectoralis_major')?.role, 'prime');
  assert.equal(lowInclineMap.get('anatomical:triceps_brachii')?.role, 'co_prime');
  assert.equal(lowInclineMap.get('anatomical:anterior_deltoid')?.role, 'secondary');
  assert.equal(lowInclineMap.get('functional:rotator_cuff')?.role, 'stabilizer');

  // Higher incline modifier
  const higherInclineMod = lowIncline.modifiers?.find((m) => m.condition === 'higher_incline');
  assert.ok(higherInclineMod);
  assert.deepEqual(higherInclineMod.target, { kind: 'anatomical', entity: 'anterior_deltoid' });
  assert.equal(higherInclineMod.effect, 'increased_contribution');

  // Moderate incline transition
  const modIncline = UPPER_BODY_SEMANTICS_REGISTRY['moderate_incline_bench_press'];
  assert.ok(modIncline);
  assert.equal(modIncline.variation, 'moderate_incline_transition');
  const modInclineMap = new Map(modIncline.contributions.map((c) => [getMuscleContributionTargetKey(c.target), c]));
  assert.equal(modInclineMap.get('anatomical:anterior_deltoid')?.role, 'co_prime');
  assert.equal(modInclineMap.get('anatomical:anterior_deltoid')?.status, 'provisional');

  // Decline bench
  const decline = UPPER_BODY_SEMANTICS_REGISTRY['decline_bench_press'];
  assert.ok(decline);
  assert.equal(decline.variation, 'standard');
  const declineMap = new Map(decline.contributions.map((c) => [getMuscleContributionTargetKey(c.target), c]));
  assert.equal(declineMap.get('anatomical:pectoralis_major')?.role, 'prime');
  assert.equal(declineMap.get('anatomical:triceps_brachii')?.role, 'co_prime');
  assert.equal(declineMap.get('anatomical:anterior_deltoid')?.role, 'secondary');
  assert.equal(declineMap.get('functional:rotator_cuff')?.role, 'stabilizer');

  assert.equal(validateExerciseSemantics(lowIncline).valid, true);
  assert.equal(validateExerciseSemantics(modIncline).valid, true);
  assert.equal(validateExerciseSemantics(decline).valid, true);
});

test('22. Upper Body Registry: Barbell Standing OHP has dynamic scapular & resisted-isometric trunk', () => {
  const ohp = UPPER_BODY_SEMANTICS_REGISTRY['standing_barbell_overhead_press'];
  assert.ok(ohp);
  assert.equal(ohp.movementFamily, 'vertical_press');
  assert.equal(ohp.variation, 'barbell_standing');

  const contribMap = new Map(ohp.contributions.map((c) => [getMuscleContributionTargetKey(c.target), c]));

  assert.equal(contribMap.get('anatomical:anterior_deltoid')?.role, 'prime');
  assert.equal(contribMap.get('anatomical:triceps_brachii')?.role, 'co_prime');
  assert.equal(contribMap.get('anatomical:lateral_deltoid')?.role, 'secondary');
  assert.equal(contribMap.get('anatomical:lateral_deltoid')?.status, 'provisional');
  assert.equal(contribMap.get('anatomical:trapezius')?.role, 'secondary');
  assert.equal(contribMap.get('anatomical:serratus_anterior')?.role, 'secondary');
  assert.equal(contribMap.get('anatomical:rectus_abdominis')?.role, 'resisted_isometric');
  assert.equal(contribMap.get('anatomical:obliques')?.role, 'resisted_isometric');
  assert.equal(contribMap.get('anatomical:erector_spinae')?.role, 'resisted_isometric');
  assert.equal(contribMap.get('functional:rotator_cuff')?.role, 'stabilizer');

  assert.equal(validateExerciseSemantics(ohp).valid, true);
});

test('23. Upper Body Registry: Machine Shoulder Press omits abdominal and spinal stabilizers', () => {
  const msp = UPPER_BODY_SEMANTICS_REGISTRY['machine_shoulder_press'];
  assert.ok(msp);
  assert.equal(msp.movementFamily, 'vertical_press');
  assert.equal(msp.variation, 'machine_supported');

  const contribMap = new Map(msp.contributions.map((c) => [getMuscleContributionTargetKey(c.target), c]));

  assert.equal(contribMap.get('anatomical:anterior_deltoid')?.role, 'prime');
  assert.equal(contribMap.get('anatomical:triceps_brachii')?.role, 'co_prime');
  assert.equal(contribMap.get('functional:rotator_cuff')?.role, 'stabilizer');

  // Invariant: no core/spinal stabilizers in machine supported profile
  assert.equal(contribMap.has('anatomical:rectus_abdominis'), false);
  assert.equal(contribMap.has('anatomical:obliques'), false);
  assert.equal(contribMap.has('anatomical:erector_spinae'), false);

  assert.equal(validateExerciseSemantics(msp).valid, true);
});

test('24. Upper Body Registry: Barbell Row, Chest-Supported Row, and High Flared Row', () => {
  // Barbell row low elbow
  const bbRow = UPPER_BODY_SEMANTICS_REGISTRY['barbell_row'];
  assert.ok(bbRow);
  assert.equal(bbRow.variation, 'barbell_low_elbow');
  const bbRowMap = new Map(bbRow.contributions.map((c) => [getMuscleContributionTargetKey(c.target), c]));
  assert.equal(bbRowMap.get('anatomical:latissimus_dorsi')?.role, 'prime');
  assert.equal(bbRowMap.get('anatomical:erector_spinae')?.role, 'resisted_isometric');
  assert.equal(bbRowMap.get('anatomical:posterior_deltoid')?.role, 'secondary');

  // Flared modifier checks
  const flaredPostDelt = bbRow.modifiers?.find((m) => m.condition === 'elbow_path_flared' && m.target.kind === 'anatomical' && m.target.entity === 'posterior_deltoid');
  assert.ok(flaredPostDelt);
  assert.equal(flaredPostDelt.effect, 'increased_contribution');

  const flaredLats = bbRow.modifiers?.find((m) => m.condition === 'elbow_path_flared' && m.target.kind === 'anatomical' && m.target.entity === 'latissimus_dorsi');
  assert.ok(flaredLats);
  assert.equal(flaredLats.effect, 'decreased_contribution');

  // Chest-supported row: NO erector_spinae
  const csRow = UPPER_BODY_SEMANTICS_REGISTRY['chest_supported_row'];
  assert.ok(csRow);
  assert.equal(csRow.variation, 'chest_supported_low_elbow');
  const csRowMap = new Map(csRow.contributions.map((c) => [getMuscleContributionTargetKey(c.target), c]));
  assert.equal(csRowMap.has('anatomical:erector_spinae'), false, 'Chest-supported row must not include erector_spinae');
  assert.equal(csRowMap.get('anatomical:latissimus_dorsi')?.role, 'prime');

  // High flared row: posterior_deltoid = prime (provisional), latissimus_dorsi = secondary (provisional)
  const hfRow = UPPER_BODY_SEMANTICS_REGISTRY['high_flared_row'];
  assert.ok(hfRow);
  assert.equal(hfRow.variation, 'high_flared');
  const hfRowMap = new Map(hfRow.contributions.map((c) => [getMuscleContributionTargetKey(c.target), c]));
  assert.equal(hfRowMap.get('anatomical:posterior_deltoid')?.role, 'prime');
  assert.equal(hfRowMap.get('anatomical:posterior_deltoid')?.status, 'provisional');
  assert.equal(hfRowMap.get('anatomical:latissimus_dorsi')?.role, 'secondary');
  assert.equal(hfRowMap.get('anatomical:latissimus_dorsi')?.status, 'provisional');

  assert.equal(validateExerciseSemantics(bbRow).valid, true);
  assert.equal(validateExerciseSemantics(csRow).valid, true);
  assert.equal(validateExerciseSemantics(hfRow).valid, true);
});

test('25. Upper Body Registry: Pull-Up, Chin-Up, and Lat Pulldown', () => {
  // Pull-up: latissimus_dorsi prime, biceps secondary, brachialis secondary
  const pullUp = UPPER_BODY_SEMANTICS_REGISTRY['pull_up'];
  assert.ok(pullUp);
  assert.equal(pullUp.movementFamily, 'pull_up');
  assert.equal(pullUp.variation, 'pronated_standard');
  const pullUpMap = new Map(pullUp.contributions.map((c) => [getMuscleContributionTargetKey(c.target), c]));
  assert.equal(pullUpMap.get('anatomical:latissimus_dorsi')?.role, 'prime');
  assert.equal(pullUpMap.get('anatomical:biceps_brachii')?.role, 'secondary');
  assert.equal(pullUpMap.get('anatomical:brachialis')?.role, 'secondary');
  assert.equal(pullUpMap.get('functional:rotator_cuff')?.role, 'stabilizer');

  // Chin-up: latissimus_dorsi prime, biceps_brachii co_prime (provisional)
  const chinUp = UPPER_BODY_SEMANTICS_REGISTRY['chin_up'];
  assert.ok(chinUp);
  assert.equal(chinUp.movementFamily, 'chin_up');
  assert.equal(chinUp.variation, 'supinated_standard');
  const chinUpMap = new Map(chinUp.contributions.map((c) => [getMuscleContributionTargetKey(c.target), c]));
  assert.equal(chinUpMap.get('anatomical:latissimus_dorsi')?.role, 'prime');
  assert.equal(chinUpMap.get('anatomical:biceps_brachii')?.role, 'co_prime');
  assert.equal(chinUpMap.get('anatomical:biceps_brachii')?.status, 'provisional');
  assert.equal(chinUpMap.get('anatomical:biceps_brachii')?.confidence, 'moderate');

  // Invariant: chin_up:supinated_standard does NOT contain forearm_pronated modifier
  const chinUpPronatedMod = chinUp.modifiers?.find((m) => m.condition === 'forearm_pronated');
  assert.equal(chinUpPronatedMod, undefined, 'chin_up must not contain forearm_pronated modifier');
  assert.ok(!chinUp.modifiers || chinUp.modifiers.length === 0, 'chin_up must not contain modifiers altering its canonical identity');

  // Invariant: pull_up:pronated_standard does NOT contain forearm_neutral or forearm_pronated modifier
  const pullUpNeutralMod = pullUp.modifiers?.find((m) => m.condition === 'forearm_neutral' || m.condition === 'forearm_supinated' || m.condition === 'forearm_pronated');
  assert.equal(pullUpNeutralMod, undefined, 'pull_up must not contain forearm_neutral/supinated/pronated modifier');
  assert.ok(!pullUp.modifiers || pullUp.modifiers.length === 0, 'pull_up must not contain modifiers overriding its canonical identity');

  // Lat Pulldown: latissimus_dorsi prime, biceps secondary, NO core stabilizers
  const pulldown = UPPER_BODY_SEMANTICS_REGISTRY['lat_pulldown'];
  assert.ok(pulldown);
  assert.equal(pulldown.movementFamily, 'pulldown');
  assert.equal(pulldown.variation, 'pronated_standard');
  const pulldownMap = new Map(pulldown.contributions.map((c) => [getMuscleContributionTargetKey(c.target), c]));
  assert.equal(pulldownMap.get('anatomical:latissimus_dorsi')?.role, 'prime');
  assert.equal(pulldownMap.get('anatomical:biceps_brachii')?.role, 'secondary');
  assert.equal(pulldownMap.has('anatomical:rectus_abdominis'), false, 'Lat pulldown must not include core stabilizers in base profile');

  // Forearm orientation modifiers preserved in lat_pulldown
  assert.ok(pulldown.modifiers && pulldown.modifiers.length === 2);
  const supMod = pulldown.modifiers?.find((m) => m.condition === 'forearm_supinated');
  assert.ok(supMod);
  assert.deepEqual(supMod.target, { kind: 'anatomical', entity: 'biceps_brachii' });
  assert.equal(supMod.effect, 'increased_contribution');

  const neutralMod = pulldown.modifiers?.find((m) => m.condition === 'forearm_neutral');
  assert.ok(neutralMod);
  assert.deepEqual(neutralMod.target, { kind: 'anatomical', entity: 'brachioradialis' });
  assert.equal(neutralMod.effect, 'increased_contribution');

  assert.equal(validateExerciseSemantics(pullUp).valid, true);
  assert.equal(validateExerciseSemantics(chinUp).valid, true);
  assert.equal(validateExerciseSemantics(pulldown).valid, true);
});

test('26. Every profile in EXERCISE_SEMANTICS_REGISTRY passes strict validation', () => {
  const entries = Object.entries(EXERCISE_SEMANTICS_REGISTRY);
  assert.ok(entries.length >= 19, `Expected at least 19 profiles (6 lower + 13 upper), got ${entries.length}`);

  for (const [key, profile] of entries) {
    const res = validateExerciseSemantics(profile);
    assert.equal(res.valid, true, `Profile "${key}" failed validation: ${res.errors.join('; ')}`);
  }
});

test('27. No Product Policy Invariant: exerciseSemantics module contains NO fractional sets or volume multipliers', () => {
  const exportedKeys = Object.keys(semantics);

  const prohibitedSubstrings = [
    'setcredit',
    'fractionalset',
    'roleweight',
    'stimulusweight',
    'hypertrophyweight',
    'volumecoefficient',
    'musclepercentage',
    'creditpolicy'
  ];

  for (const key of exportedKeys) {
    const lowerKey = key.toLowerCase();
    for (const prohibited of prohibitedSubstrings) {
      assert.ok(
        !lowerKey.includes(prohibited),
        `Prohibited product policy token "${prohibited}" found in export "${key}"`
      );
    }
  }
});
