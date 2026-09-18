import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  type TrainingCreditClassification,
  type CreditConfidence,
  type TrainingCreditStatus,
  type TrainingCreditEvidenceBasis,
  type TrainingCreditProfileV1,
  TRAINING_CREDIT_CLASSIFICATIONS,
  RESOLVED_TRAINING_CREDIT_CLASSIFICATIONS,
  CREDIT_CONFIDENCES,
  TRAINING_CREDIT_STATUSES,
  TRAINING_CREDIT_EVIDENCE_BASES,
  TRAINING_CREDIT_V1_REGISTRY,
  validateTrainingCreditProfile,
  getTrainingCreditProfile,
  getTrainingCreditEntry
} from './trainingCredit.js';
import {
  type MuscleContributionTarget,
  EXERCISE_SEMANTICS_REGISTRY,
  validateExerciseSemantics,
  getMuscleContributionTargetKey
} from './exerciseSemantics.js';
import {
  auditExerciseCatalog,
  type RawDatasetExercise
} from './index.js';

const require = createRequire(import.meta.url);
const { EXDB } = require('../../../apps/web/src/lib/exercises-data.js') as { EXDB: RawDatasetExercise[] };

test('1. valid DIRECT entry passes', () => {
  const profile: TrainingCreditProfileV1 = {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'pectoralis_major' },
        classification: 'direct',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['biomechanics']
      }
    ]
  };

  const res = validateTrainingCreditProfile(profile);
  assert.equal(res.valid, true, res.errors.join(', '));
});

test('2. valid INDIRECT entry passes', () => {
  const profile: TrainingCreditProfileV1 = {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'triceps_brachii' },
        classification: 'indirect',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['biomechanics']
      }
    ]
  };

  const res = validateTrainingCreditProfile(profile);
  assert.equal(res.valid, true, res.errors.join(', '));
});

test('3. valid EXPOSURE_ONLY entry passes', () => {
  const profile: TrainingCreditProfileV1 = {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'functional', group: 'rotator_cuff' },
        classification: 'exposure_only',
        confidence: 'moderate',
        status: 'provisional',
        evidenceBasis: ['biomechanics']
      }
    ]
  };

  const res = validateTrainingCreditProfile(profile);
  assert.equal(res.valid, true, res.errors.join(', '));
});

test('4. valid NONE entry passes', () => {
  const profile: TrainingCreditProfileV1 = {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'anterior_deltoid' },
        classification: 'none',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['biomechanics']
      }
    ]
  };

  const res = validateTrainingCreditProfile(profile);
  assert.equal(res.valid, true, res.errors.join(', '));
});

test('5. valid UNRESOLVED entry passes', () => {
  const profile: TrainingCreditProfileV1 = {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'anterior_deltoid' },
        classification: 'unresolved',
        status: 'unresolved',
        evidenceBasis: ['biomechanics'],
        reason: 'Pending standardized longitudinal EMG normalization against prime generators'
      }
    ]
  };

  const res = validateTrainingCreditProfile(profile);
  assert.equal(res.valid, true, res.errors.join(', '));
});

test('6. invalid classification fails', () => {
  const profile = {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'pectoralis_major' },
        classification: 'semi_direct',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['biomechanics']
      }
    ]
  };

  const res = validateTrainingCreditProfile(profile);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('classification is invalid')));
});

test('7. duplicate target keys fail', () => {
  const profile = {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'pectoralis_major' },
        classification: 'direct',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['biomechanics']
      },
      {
        target: { kind: 'anatomical', entity: 'pectoralis_major' },
        classification: 'indirect',
        confidence: 'low',
        status: 'provisional',
        evidenceBasis: ['emg']
      }
    ]
  };

  const res = validateTrainingCreditProfile(profile);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('Duplicate target credit entry')));
});

test('8. invalid target fails', () => {
  const profile = {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'non_existent_muscle' },
        classification: 'direct',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['biomechanics']
      }
    ]
  };

  const res = validateTrainingCreditProfile(profile);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('not a recognized MuscleEntityId')));
});

test('9. target not present in corresponding Exercise Semantics profile fails', () => {
  const profile = {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'quadriceps' },
        classification: 'direct',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['biomechanics']
      }
    ]
  };

  const res = validateTrainingCreditProfile(profile);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('does not exist in corresponding ExerciseSemanticsV2 profile contributions')));
});

test('10. unresolved with confidence fails', () => {
  const profile = {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'anterior_deltoid' },
        classification: 'unresolved',
        confidence: 'moderate',
        status: 'unresolved',
        evidenceBasis: ['biomechanics'],
        reason: 'Unresolved evidence'
      }
    ]
  };

  const res = validateTrainingCreditProfile(profile);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('unresolved classification must NOT have confidence')));
});

test('11. unresolved without reason fails', () => {
  const profile = {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'anterior_deltoid' },
        classification: 'unresolved',
        status: 'unresolved',
        evidenceBasis: ['biomechanics']
      }
    ]
  };

  const res = validateTrainingCreditProfile(profile);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('requires a non-empty reason string')));
});

test('12. unresolved with non-unresolved status fails', () => {
  const profile = {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'anterior_deltoid' },
        classification: 'unresolved',
        status: 'provisional',
        evidenceBasis: ['biomechanics'],
        reason: 'Under study'
      }
    ]
  };

  const res = validateTrainingCreditProfile(profile);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('unresolved classification must have status === "unresolved"')));
});

test('13. resolved classification without confidence fails', () => {
  const profile = {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'pectoralis_major' },
        classification: 'direct',
        status: 'established',
        evidenceBasis: ['biomechanics']
      }
    ]
  };

  const res = validateTrainingCreditProfile(profile);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('resolved classification requires valid confidence')));
});

test('14. resolved entry with status unresolved fails', () => {
  const profile = {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'pectoralis_major' },
        classification: 'direct',
        confidence: 'high',
        status: 'unresolved',
        evidenceBasis: ['biomechanics']
      }
    ]
  };

  const res = validateTrainingCreditProfile(profile);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('resolved classification cannot have status === "unresolved"')));
});

test('15. resolved entry without evidenceBasis fails', () => {
  const profile = {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'pectoralis_major' },
        classification: 'direct',
        confidence: 'high',
        status: 'established',
        evidenceBasis: []
      }
    ]
  };

  const res = validateTrainingCreditProfile(profile);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('evidenceBasis must be a non-empty array')));
});

test('16. invalid evidenceBasis fails', () => {
  const profile = {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'pectoralis_major' },
        classification: 'direct',
        confidence: 'high',
        status: 'established',
        evidenceBasis: ['invalid_basis_source']
      }
    ]
  };

  const res = validateTrainingCreditProfile(profile);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('contains invalid evidence')));
});

test('17. inherited entry with established status fails', () => {
  const profile = {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'pectoralis_major' },
        classification: 'direct',
        confidence: 'moderate',
        status: 'established',
        evidenceBasis: ['inherited']
      }
    ]
  };

  const res = validateTrainingCreditProfile(profile);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('entries with inherited evidence must have status === "provisional"')));
});

test('18. inherited-only HIGH confidence fails', () => {
  const profile = {
    version: 1,
    family: 'bench_press',
    variation: 'flat_barbell',
    credits: [
      {
        target: { kind: 'anatomical', entity: 'pectoralis_major' },
        classification: 'direct',
        confidence: 'high',
        status: 'provisional',
        evidenceBasis: ['inherited']
      }
    ]
  };

  const res = validateTrainingCreditProfile(profile);
  assert.equal(res.valid, false);
  assert.ok(res.errors.some((e) => e.includes('inherited-only evidence cannot have confidence === "high"')));
});

test('19. every seeded registry profile validates', () => {
  const profiles = Object.values(TRAINING_CREDIT_V1_REGISTRY);
  assert.equal(profiles.length, 13);
  for (const profile of profiles) {
    const res = validateTrainingCreditProfile(profile);
    assert.equal(res.valid, true, `Profile ${profile.family}:${profile.variation} failed: ${res.errors.join(', ')}`);
  }
});

test('20. every Training Credit target exists in corresponding Exercise Semantics', () => {
  for (const profile of Object.values(TRAINING_CREDIT_V1_REGISTRY)) {
    const sem = Object.values(EXERCISE_SEMANTICS_REGISTRY).find(
      (s) => s.movementFamily === profile.family && s.variation === profile.variation
    );
    assert.ok(sem, `Missing semantics profile for ${profile.family}:${profile.variation}`);
    const semKeys = new Set(sem.contributions.map((c) => getMuscleContributionTargetKey(c.target)));

    for (const credit of profile.credits) {
      const creditKey = getMuscleContributionTargetKey(credit.target);
      assert.ok(
        semKeys.has(creditKey),
        `Target ${creditKey} in ${profile.family}:${profile.variation} does not exist in semantics contributions`
      );
    }
  }
});

test('21. Flat Bench triceps_brachii === indirect', () => {
  const p = getTrainingCreditProfile('bench_press', 'flat_barbell');
  assert.ok(p);
  const entry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'triceps_brachii' });
  assert.equal(entry?.classification, 'indirect');
  assert.equal(entry?.confidence, 'high');
  assert.equal(entry?.status, 'established');
});

test('22. Flat Bench anterior_deltoid === indirect', () => {
  const p = getTrainingCreditProfile('bench_press', 'flat_barbell');
  assert.ok(p);
  const entry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'anterior_deltoid' });
  assert.equal(entry?.classification, 'indirect');
  assert.equal(entry?.confidence, 'high');
  assert.equal(entry?.status, 'established');
});

test('23. Flat Bench pectoralis_major === direct', () => {
  const p = getTrainingCreditProfile('bench_press', 'flat_barbell');
  assert.ok(p);
  const entry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'pectoralis_major' });
  assert.equal(entry?.classification, 'direct');
  assert.equal(entry?.confidence, 'high');
  assert.equal(entry?.status, 'established');
});

test('24. Back Squat gluteus_maximus === direct', () => {
  const p = getTrainingCreditProfile('squat', 'back_squat');
  assert.ok(p);
  const entry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'gluteus_maximus' });
  assert.equal(entry?.classification, 'direct');
  assert.equal(entry?.confidence, 'high');
  assert.equal(entry?.status, 'established');
});

test('25. Back Squat hamstrings === exposure_only', () => {
  const p = getTrainingCreditProfile('squat', 'back_squat');
  assert.ok(p);
  const entry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'hamstrings' });
  assert.equal(entry?.classification, 'exposure_only');
  assert.equal(entry?.confidence, 'high');
  assert.equal(entry?.status, 'established');
});

test('26. Leg Press gluteus_maximus === indirect', () => {
  const p = getTrainingCreditProfile('leg_press', 'generic_leg_press');
  assert.ok(p);
  const entry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'gluteus_maximus' });
  assert.equal(entry?.classification, 'indirect');
  assert.equal(entry?.confidence, 'moderate');
  assert.equal(entry?.status, 'provisional');
});

test('27. Conventional Deadlift gluteus_maximus === direct, confidence === moderate, status === provisional', () => {
  const p = getTrainingCreditProfile('deadlift', 'conventional');
  assert.ok(p);
  const entry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'gluteus_maximus' });
  assert.equal(entry?.classification, 'direct');
  assert.equal(entry?.confidence, 'moderate');
  assert.equal(entry?.status, 'provisional');
});

test('28. Conventional Deadlift hamstrings === indirect', () => {
  const p = getTrainingCreditProfile('deadlift', 'conventional');
  assert.ok(p);
  const entry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'hamstrings' });
  assert.equal(entry?.classification, 'indirect');
  assert.equal(entry?.confidence, 'moderate');
  assert.equal(entry?.status, 'provisional');
});

test('29. Conventional Deadlift adductor_magnus === indirect', () => {
  const p = getTrainingCreditProfile('deadlift', 'conventional');
  assert.ok(p);
  const entry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'adductor_magnus' });
  assert.equal(entry?.classification, 'indirect');
  assert.equal(entry?.confidence, 'moderate');
  assert.equal(entry?.status, 'provisional');
});

test('30. RDL hamstrings === direct', () => {
  const p = getTrainingCreditProfile('romanian_deadlift', 'standard');
  assert.ok(p);
  const entry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'hamstrings' });
  assert.equal(entry?.classification, 'direct');
  assert.equal(entry?.confidence, 'high');
  assert.equal(entry?.status, 'established');
});

test('31. RDL gluteus_maximus === direct, confidence === moderate, status === provisional', () => {
  const p = getTrainingCreditProfile('romanian_deadlift', 'standard');
  assert.ok(p);
  const entry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'gluteus_maximus' });
  assert.equal(entry?.classification, 'direct');
  assert.equal(entry?.confidence, 'moderate');
  assert.equal(entry?.status, 'provisional');
});

test('32. RDL adductor_magnus === indirect, confidence === low, status === provisional', () => {
  const p = getTrainingCreditProfile('romanian_deadlift', 'standard');
  assert.ok(p);
  const entry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'adductor_magnus' });
  assert.equal(entry?.classification, 'indirect');
  assert.equal(entry?.confidence, 'low');
  assert.equal(entry?.status, 'provisional');
});

test('33. Hip Thrust gluteus_maximus === direct', () => {
  const p = getTrainingCreditProfile('hip_thrust', 'barbell');
  assert.ok(p);
  const entry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'gluteus_maximus' });
  assert.equal(entry?.classification, 'direct');
  assert.equal(entry?.confidence, 'high');
  assert.equal(entry?.status, 'established');
});

test('34. Hip Thrust hamstrings === exposure_only', () => {
  const p = getTrainingCreditProfile('hip_thrust', 'barbell');
  assert.ok(p);
  const entry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'hamstrings' });
  assert.equal(entry?.classification, 'exposure_only');
  assert.equal(entry?.confidence, 'high');
  assert.equal(entry?.status, 'established');
});

test('35. OHP anterior_deltoid === direct', () => {
  const p = getTrainingCreditProfile('vertical_press', 'barbell_standing');
  assert.ok(p);
  const entry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'anterior_deltoid' });
  assert.equal(entry?.classification, 'direct');
  assert.equal(entry?.confidence, 'high');
  assert.equal(entry?.status, 'established');
});

test('36. OHP triceps_brachii === indirect', () => {
  const p = getTrainingCreditProfile('vertical_press', 'barbell_standing');
  assert.ok(p);
  const entry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'triceps_brachii' });
  assert.equal(entry?.classification, 'indirect');
  assert.equal(entry?.confidence, 'high');
  assert.equal(entry?.status, 'established');
});

test('37. Chin-Up biceps_brachii === indirect', () => {
  const p = getTrainingCreditProfile('chin_up', 'supinated_standard');
  assert.ok(p);
  const entry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'biceps_brachii' });
  assert.equal(entry?.classification, 'indirect');
  assert.equal(entry?.confidence, 'moderate');
  assert.equal(entry?.status, 'provisional');
});

test('38. Lat Pulldown biceps_brachii === indirect and unauthorized targets are absent', () => {
  const p = getTrainingCreditProfile('pulldown', 'pronated_standard');
  assert.ok(p);
  assert.equal(p.credits.length, 6, 'lat_pulldown profile must contain exactly 6 approved targets');
  const entry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'biceps_brachii' });
  assert.equal(entry?.classification, 'indirect');
  assert.equal(entry?.confidence, 'high');
  assert.equal(entry?.status, 'established');

  // Verify rhomboids and rotator_cuff are NOT present in Training Credit seed
  const rhomboidsEntry = getTrainingCreditEntry(p, { kind: 'anatomical', entity: 'rhomboids' });
  assert.equal(rhomboidsEntry, undefined, 'rhomboids must be absent from lat_pulldown training credit seed');

  const rotatorCuffEntry = getTrainingCreditEntry(p, { kind: 'functional', group: 'rotator_cuff' });
  assert.equal(rotatorCuffEntry, undefined, 'rotator_cuff must be absent from lat_pulldown training credit seed');
});

test('39. no seeded Training Credit profile changes MuscleRole', () => {
  // Verify that ExerciseSemanticsV2 MuscleRole assignments remain independent and intact:
  // Bench press triceps is co_prime in semantics, but indirect in training credit
  const benchSem = EXERCISE_SEMANTICS_REGISTRY.flat_bench_press;
  const benchTricepsSem = benchSem.contributions.find((c) => getMuscleContributionTargetKey(c.target) === 'anatomical:triceps_brachii');
  assert.equal(benchTricepsSem?.role, 'co_prime');

  const benchCredit = getTrainingCreditProfile('bench_press', 'flat_barbell');
  const benchTricepsCredit = getTrainingCreditEntry(benchCredit!, { kind: 'anatomical', entity: 'triceps_brachii' });
  assert.equal(benchTricepsCredit?.classification, 'indirect');

  // Chin-up biceps is co_prime in semantics, but indirect in training credit
  const chinSem = EXERCISE_SEMANTICS_REGISTRY.chin_up;
  const chinBicepsSem = chinSem.contributions.find((c) => getMuscleContributionTargetKey(c.target) === 'anatomical:biceps_brachii');
  assert.equal(chinBicepsSem?.role, 'co_prime');

  const chinCredit = getTrainingCreditProfile('chin_up', 'supinated_standard');
  const chinBicepsCredit = getTrainingCreditEntry(chinCredit!, { kind: 'anatomical', entity: 'biceps_brachii' });
  assert.equal(chinBicepsCredit?.classification, 'indirect');

  // Back squat hamstrings is secondary in semantics, but exposure_only in training credit
  const squatSem = EXERCISE_SEMANTICS_REGISTRY.back_squat;
  const squatHamSem = squatSem.contributions.find((c) => getMuscleContributionTargetKey(c.target) === 'anatomical:hamstrings');
  assert.equal(squatHamSem?.role, 'secondary');

  const squatCredit = getTrainingCreditProfile('squat', 'back_squat');
  const squatHamCredit = getTrainingCreditEntry(squatCredit!, { kind: 'anatomical', entity: 'hamstrings' });
  assert.equal(squatHamCredit?.classification, 'exposure_only');
});

test('40. Exercise Semantics registry still validates', () => {
  for (const [key, profile] of Object.entries(EXERCISE_SEMANTICS_REGISTRY)) {
    const res = validateExerciseSemantics(profile);
    assert.equal(res.valid, true, `Profile ${key} failed validation: ${res.errors.join(', ')}`);
  }
});

test('41. exercise audit behavior/output remains unchanged', () => {
  const { records, summary } = auditExerciseCatalog(EXDB);
  assert.equal(records.length, 1324);
  assert.equal(summary.totalExercises, 1324);
  assert.equal(summary.bySeverity.critical, 0);
  const totalFlags = Object.values(summary.byFlag).reduce((a, b) => a + b, 0);
  assert.equal(totalFlags, 2592);
});

test('42. Architectural Invariant: trainingCredit.ts contains no numeric credit coefficients or multipliers', () => {
  const fs = require('fs');
  const path = require('path');
  const { fileURLToPath } = require('url');
  let targetPath = path.resolve(process.cwd(), 'src/trainingCredit.ts');
  if (!fs.existsSync(targetPath)) {
    targetPath = fileURLToPath(new URL('../src/trainingCredit.ts', import.meta.url));
  }
  const code = fs.readFileSync(targetPath, 'utf-8');
  assert.equal(/effectiveSets/i.test(code), false, 'Must not contain effectiveSets');
  assert.equal(/equivalentSets/i.test(code), false, 'Must not contain equivalentSets');
  assert.equal(/RIRMultiplier/i.test(code), false, 'Must not contain RIRMultiplier');
  assert.equal(/stimulusMultiplier/i.test(code), false, 'Must not contain stimulusMultiplier');
  assert.equal(/fractionalSets/i.test(code), false, 'Must not contain fractionalSets');
  assert.equal(/\b0\.5\b/.test(code), false, 'Must not contain numeric 0.5 credit');
  assert.equal(/\b0\.25\b/.test(code), false, 'Must not contain numeric 0.25 credit');
  assert.equal(/\b0\.75\b/.test(code), false, 'Must not contain numeric 0.75 credit');
});

test('43. Immutability Audit: exported domain constants are immutable readonly tuples, not mutable Sets', () => {
  assert.ok(Array.isArray(TRAINING_CREDIT_CLASSIFICATIONS), 'TRAINING_CREDIT_CLASSIFICATIONS must be an array/tuple');
  assert.equal(TRAINING_CREDIT_CLASSIFICATIONS instanceof Set, false, 'Must not expose mutable Set');
  assert.equal(TRAINING_CREDIT_CLASSIFICATIONS.length, 5);

  assert.ok(Array.isArray(RESOLVED_TRAINING_CREDIT_CLASSIFICATIONS));
  assert.equal(RESOLVED_TRAINING_CREDIT_CLASSIFICATIONS instanceof Set, false);
  assert.equal(RESOLVED_TRAINING_CREDIT_CLASSIFICATIONS.length, 4);

  assert.ok(Array.isArray(CREDIT_CONFIDENCES));
  assert.equal(CREDIT_CONFIDENCES instanceof Set, false);
  assert.equal(CREDIT_CONFIDENCES.length, 3);

  assert.ok(Array.isArray(TRAINING_CREDIT_STATUSES));
  assert.equal(TRAINING_CREDIT_STATUSES instanceof Set, false);
  assert.equal(TRAINING_CREDIT_STATUSES.length, 3);

  assert.ok(Array.isArray(TRAINING_CREDIT_EVIDENCE_BASES));
  assert.equal(TRAINING_CREDIT_EVIDENCE_BASES instanceof Set, false);
  assert.equal(TRAINING_CREDIT_EVIDENCE_BASES.length, 7);
});

test('44. Absence Semantics A: existing Exercise Semantics profile with no Training Credit seed returns undefined', () => {
  // row:high_flared exists in Exercise Semantics:
  const semanticsProfile = EXERCISE_SEMANTICS_REGISTRY.high_flared_row;
  assert.ok(semanticsProfile, 'high_flared_row must exist in EXERCISE_SEMANTICS_REGISTRY');
  assert.equal(semanticsProfile.movementFamily, 'row');
  assert.equal(semanticsProfile.variation, 'high_flared');

  // But returns undefined in Training Credit registry:
  const creditProfile = getTrainingCreditProfile('row', 'high_flared');
  assert.equal(
    creditProfile,
    undefined,
    'Training credit profile must be undefined — no family fallback, no inheritance, no automatic classification'
  );
});

test('45. Absence Semantics B: target present in Semantics but intentionally absent from Training Credit seed returns undefined (not none)', () => {
  const rowCreditProfile = getTrainingCreditProfile('row', 'barbell_low_elbow');
  assert.ok(rowCreditProfile, 'row:barbell_low_elbow must exist in TRAINING_CREDIT_V1_REGISTRY');

  // Verify rhomboids is modeled in Exercise Semantics for barbell_row:
  const rowSemantics = EXERCISE_SEMANTICS_REGISTRY.barbell_row;
  const hasRhomboidsInSemantics = rowSemantics.contributions.some(
    (c) => c.target.kind === 'anatomical' && c.target.entity === 'rhomboids'
  );
  assert.equal(hasRhomboidsInSemantics, true, 'rhomboids must exist in barbell_row Semantics contributions');

  // Verify rhomboids is strictly undefined in Training Credit (not classified as "none"):
  const rhomboidsTarget: MuscleContributionTarget = { kind: 'anatomical', entity: 'rhomboids' };
  const rhomboidsCreditEntry = getTrainingCreditEntry(rowCreditProfile, rhomboidsTarget);
  assert.equal(
    rhomboidsCreditEntry,
    undefined,
    'rhomboids entry must be undefined (target absent != explicit NONE)'
  );
});
