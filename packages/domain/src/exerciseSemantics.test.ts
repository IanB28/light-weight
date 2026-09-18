import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as semantics from './exerciseSemantics.js';
import {
  type MuscleRole,
  type EvidenceConfidence,
  type SemanticEvidenceStatus,
  type ExerciseSemanticsV2,
  VALID_MUSCLE_ROLES,
  VALID_EVIDENCE_CONFIDENCES,
  VALID_SEMANTIC_EVIDENCE_STATUSES,
  VALID_MOVEMENT_FAMILIES,
  validateExerciseSemantics,
  LOWER_BODY_SEMANTICS_REGISTRY,
  EXERCISE_SEMANTICS_REGISTRY
} from './exerciseSemantics.js';

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

test('4. Validator: validates a correct multi-contribution profile', () => {
  const profile: ExerciseSemanticsV2 = {
    version: 2,
    movementFamily: 'squat',
    variation: 'back_squat',
    contributions: [
      { muscle: 'quadriceps', role: 'prime', confidence: 'high', status: 'established' },
      { muscle: 'gluteus_maximus', role: 'co_prime', confidence: 'high', status: 'established' }
    ]
  };

  const res = validateExerciseSemantics(profile);
  assert.equal(res.valid, true);
  assert.deepEqual(res.errors, []);
});

test('5. Validator: rejects malformed input and invalid version', () => {
  assert.equal(validateExerciseSemantics(null).valid, false);
  assert.equal(validateExerciseSemantics(undefined).valid, false);
  assert.equal(validateExerciseSemantics('string').valid, false);

  const wrongVersion = {
    version: 1,
    movementFamily: 'squat',
    contributions: [
      { muscle: 'quadriceps', role: 'prime', confidence: 'high', status: 'established' }
    ]
  };
  const resVersion = validateExerciseSemantics(wrongVersion);
  assert.equal(resVersion.valid, false);
  assert.ok(resVersion.errors.some((e) => e.includes('Invalid version')));
});

test('6. Validator: rejects empty contributions array', () => {
  const emptyContributions = {
    version: 2,
    movementFamily: 'squat',
    contributions: []
  };
  const res = validateExerciseSemantics(emptyContributions);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('contributions must be a non-empty array')));
});

test('7. Validator: rejects duplicate muscle contributions within same profile', () => {
  const duplicate = {
    version: 2,
    movementFamily: 'squat',
    contributions: [
      { muscle: 'quadriceps', role: 'prime', confidence: 'high', status: 'established' },
      { muscle: 'quadriceps', role: 'secondary', confidence: 'moderate', status: 'provisional' }
    ]
  };
  const res = validateExerciseSemantics(duplicate);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('Duplicate muscle contribution: quadriceps')));
});

test('8. Validator: rejects modifier pointing to muscle not present in contributions', () => {
  const invalidModifier = {
    version: 2,
    movementFamily: 'squat',
    contributions: [
      { muscle: 'quadriceps', role: 'prime', confidence: 'high', status: 'established' }
    ],
    modifiers: [
      {
        id: 'mod_1',
        muscle: 'adductor_magnus', // NOT in contributions!
        condition: 'deep_hip_flexion',
        effect: 'increased_contribution',
        confidence: 'moderate',
        status: 'provisional'
      }
    ]
  };
  const res = validateExerciseSemantics(invalidModifier);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('references muscle "adductor_magnus" which does not exist in profile contributions')));
});

test('9. Lower Body Registry: Back Squat profile has exact contributions, roles and modifier', () => {
  const squat = LOWER_BODY_SEMANTICS_REGISTRY['back_squat'];
  assert.ok(squat, 'back_squat profile must exist in registry');
  assert.equal(squat.version, 2);
  assert.equal(squat.movementFamily, 'squat');
  assert.equal(squat.variation, 'back_squat');

  const contribMap = new Map(squat.contributions.map((c) => [c.muscle, c]));

  // Quadriceps prime
  const quads = contribMap.get('quadriceps');
  assert.ok(quads);
  assert.equal(quads.role, 'prime');
  assert.equal(quads.confidence, 'high');
  assert.equal(quads.status, 'established');

  // Gluteus maximus co_prime
  const gmax = contribMap.get('gluteus_maximus');
  assert.ok(gmax);
  assert.equal(gmax.role, 'co_prime');
  assert.equal(gmax.confidence, 'high');
  assert.equal(gmax.status, 'established');

  // Hamstrings secondary
  const hams = contribMap.get('hamstrings');
  assert.ok(hams);
  assert.equal(hams.role, 'secondary');
  assert.equal(hams.confidence, 'high');
  assert.equal(hams.status, 'established');

  // Adductor magnus secondary
  const am = contribMap.get('adductor_magnus');
  assert.ok(am);
  assert.equal(am.role, 'secondary');
  assert.equal(am.confidence, 'moderate');
  assert.equal(am.status, 'established');

  // Erector spinae resisted_isometric
  const es = contribMap.get('erector_spinae');
  assert.ok(es);
  assert.equal(es.role, 'resisted_isometric');
  assert.equal(es.confidence, 'high');
  assert.equal(es.status, 'established');

  // Glute medius & minimus stabilizers
  const gmed = contribMap.get('gluteus_medius');
  assert.ok(gmed);
  assert.equal(gmed.role, 'stabilizer');

  const gmin = contribMap.get('gluteus_minimus');
  assert.ok(gmin);
  assert.equal(gmin.role, 'stabilizer');

  // Modifier: deep_hip_flexion on adductor_magnus
  assert.equal(squat.modifiers?.length, 1);
  const mod = squat.modifiers![0];
  assert.equal(mod.muscle, 'adductor_magnus');
  assert.equal(mod.condition, 'deep_hip_flexion');
  assert.equal(mod.effect, 'increased_contribution');
  assert.equal(mod.status, 'provisional');

  // Passes validation
  assert.equal(validateExerciseSemantics(squat).valid, true);
});

test('10. Lower Body Registry: Leg Press profile has exact contributions and no erector minimal', () => {
  const lp = LOWER_BODY_SEMANTICS_REGISTRY['generic_leg_press'];
  assert.ok(lp);
  assert.equal(lp.movementFamily, 'leg_press');
  assert.equal(lp.variation, 'generic_leg_press');

  const contribMap = new Map(lp.contributions.map((c) => [c.muscle, c]));
  assert.equal(contribMap.get('quadriceps')?.role, 'prime');
  assert.equal(contribMap.get('gluteus_maximus')?.role, 'co_prime');
  assert.equal(contribMap.get('adductor_magnus')?.role, 'secondary');
  assert.equal(contribMap.get('hamstrings')?.role, 'secondary');

  // Invariant: no erector_spinae minimal in leg press
  assert.equal(contribMap.has('erector_spinae'), false);

  assert.equal(validateExerciseSemantics(lp).valid, true);
});

test('11. Lower Body Registry: Conventional Deadlift profile has exact contributions', () => {
  const dl = LOWER_BODY_SEMANTICS_REGISTRY['conventional_deadlift'];
  assert.ok(dl);
  assert.equal(dl.movementFamily, 'deadlift');
  assert.equal(dl.variation, 'conventional');

  const contribMap = new Map(dl.contributions.map((c) => [c.muscle, c]));
  assert.equal(contribMap.get('gluteus_maximus')?.role, 'prime');
  assert.equal(contribMap.get('hamstrings')?.role, 'co_prime');
  assert.equal(contribMap.get('quadriceps')?.role, 'secondary');
  assert.equal(contribMap.get('adductor_magnus')?.role, 'secondary');
  assert.equal(contribMap.get('erector_spinae')?.role, 'resisted_isometric');

  assert.equal(validateExerciseSemantics(dl).valid, true);
});

test('12. Lower Body Registry: Sumo Deadlift profile has adductor_magnus marked provisional', () => {
  const sumo = LOWER_BODY_SEMANTICS_REGISTRY['sumo_deadlift'];
  assert.ok(sumo);
  assert.equal(sumo.movementFamily, 'deadlift');
  assert.equal(sumo.variation, 'sumo');

  const contribMap = new Map(sumo.contributions.map((c) => [c.muscle, c]));
  assert.equal(contribMap.get('gluteus_maximus')?.role, 'prime');
  assert.equal(contribMap.get('quadriceps')?.role, 'co_prime');
  assert.equal(contribMap.get('hamstrings')?.role, 'secondary');

  const am = contribMap.get('adductor_magnus');
  assert.ok(am);
  assert.equal(am.role, 'secondary');
  assert.equal(am.status, 'provisional', 'Sumo deadlift adductor magnus contribution must be provisional');

  assert.equal(contribMap.get('erector_spinae')?.role, 'resisted_isometric');
  assert.equal(validateExerciseSemantics(sumo).valid, true);
});

test('13. Lower Body Registry: Romanian Deadlift has hamstrings prime and quadriceps minimal', () => {
  const rdl = LOWER_BODY_SEMANTICS_REGISTRY['romanian_deadlift'];
  assert.ok(rdl);
  assert.equal(rdl.movementFamily, 'romanian_deadlift');
  assert.equal(rdl.variation, 'standard');

  const contribMap = new Map(rdl.contributions.map((c) => [c.muscle, c]));
  assert.equal(contribMap.get('hamstrings')?.role, 'prime');
  assert.equal(contribMap.get('gluteus_maximus')?.role, 'co_prime');
  assert.equal(contribMap.get('adductor_magnus')?.role, 'secondary');
  assert.equal(contribMap.get('adductor_magnus')?.status, 'provisional');
  assert.equal(contribMap.get('quadriceps')?.role, 'minimal');
  assert.equal(contribMap.get('erector_spinae')?.role, 'resisted_isometric');

  assert.equal(validateExerciseSemantics(rdl).valid, true);
});

test('14. Lower Body Registry: Hip Thrust profile has gluteus maximus prime and hamstrings secondary', () => {
  const ht = LOWER_BODY_SEMANTICS_REGISTRY['hip_thrust'];
  assert.ok(ht);
  assert.equal(ht.movementFamily, 'hip_thrust');
  assert.equal(ht.variation, 'barbell');

  const contribMap = new Map(ht.contributions.map((c) => [c.muscle, c]));
  assert.equal(contribMap.get('gluteus_maximus')?.role, 'prime');
  assert.equal(contribMap.get('hamstrings')?.role, 'secondary');
  assert.equal(contribMap.get('quadriceps')?.role, 'secondary');

  assert.equal(validateExerciseSemantics(ht).valid, true);
});

test('15. Every profile in EXERCISE_SEMANTICS_REGISTRY passes strict validation', () => {
  const entries = Object.entries(EXERCISE_SEMANTICS_REGISTRY);
  assert.ok(entries.length >= 6, 'Registry must contain at least 6 established lower body profiles');

  for (const [key, profile] of entries) {
    const res = validateExerciseSemantics(profile);
    assert.equal(res.valid, true, `Profile "${key}" failed validation: ${res.errors.join('; ')}`);
  }
});

test('16. No Product Policy Invariant: exerciseSemantics module contains NO fractional sets or volume multipliers', () => {
  const exportedKeys = Object.keys(semantics);

  // Prohibited tokens representing product policy / fractional sets / hypertrophy weights
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
