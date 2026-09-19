import test from 'node:test';
import assert from 'node:assert/strict';
import type { Exercise, LoggedSet, WorkoutSession } from './types.js';
import {
  extractMuscleExposures,
  classifySetEffort,
  getContributionTargetKey,
  PROVISIONAL_EFFORT_POLICY
} from './muscleExposure.js';
import { calculateSemanticMuscleBalance } from './muscleBalance.js';
import type { ResolvedExerciseContributionTarget } from './exerciseSemanticsResolver.js';
import {
  extractMuscleFatigueEvidence,
  DefaultFatiguePolicy,
  calculateTargetFatigueV2,
  resolveFatigueStateFromResidualFeu
} from './fatiguePolicy.js';

// Curated exercises present in EXERCISE_ID_TO_SEMANTICS_KEY
const BENCH_PRESS: Exercise = {
  id: 'ex-0025',
  name: 'Barbell Bench Press',
  category: 'barbell',
  primaryMuscle: 'chest',
  secondaryMuscles: ['triceps', 'shoulders']
};

const BACK_SQUAT: Exercise = {
  id: 'ex-0043',
  name: 'Barbell Full Squat',
  category: 'barbell',
  primaryMuscle: 'quadriceps',
  secondaryMuscles: ['glutes', 'hamstrings']
};

const ROMANIAN_DEADLIFT: Exercise = {
  id: 'ex-0085',
  name: 'Barbell Romanian Deadlift',
  category: 'barbell',
  primaryMuscle: 'hamstrings',
  secondaryMuscles: ['glutes', 'back']
};

// Uncurated legacy exercise
const UNCURATED_LEGACY: Exercise = {
  id: 'ex-9999',
  name: 'Custom Bicep Machine',
  category: 'machine',
  primaryMuscle: 'biceps',
  secondaryMuscles: ['forearms']
};

const EXERCISES_MAP: Record<string, Exercise> = {
  [BENCH_PRESS.id]: BENCH_PRESS,
  [BACK_SQUAT.id]: BACK_SQUAT,
  [ROMANIAN_DEADLIFT.id]: ROMANIAN_DEADLIFT,
  [UNCURATED_LEGACY.id]: UNCURATED_LEGACY
};

test('1. Semantic exposure: Bench Press generates multiple targets sharing identical physical set identity', () => {
  const session: WorkoutSession = {
    id: 'sess-bench-1',
    userId: 'user-1',
    startedAt: '2026-09-18T10:00:00Z',
    sets: {
      [BENCH_PRESS.id]: [
        {
          setIndex: 0,
          weightKg: 100,
          reps: 8,
          completed: true,
          setType: 'working',
          isWarmup: false,
          rir: 1
        }
      ]
    }
  };

  const exposures = extractMuscleExposures([session], EXERCISES_MAP);

  // Bench press has 4 contributions: pectoralis_major (prime), triceps_brachii (co_prime), anterior_deltoid (secondary), rotator_cuff (stabilizer)
  assert.equal(exposures.length, 4);

  // All 4 exposures must share the exact physical set coordinate
  for (const exp of exposures) {
    assert.equal(exp.sessionId, 'sess-bench-1');
    assert.equal(exp.exerciseId, BENCH_PRESS.id);
    assert.equal(exp.setIndex, 0);
    assert.equal(exp.source, 'semantic_v2');
    assert.equal(exp.effort, 'hard'); // rir = 1 <= 2 -> hard
    assert.equal(exp.reps, 8);
    assert.equal(exp.loadKg, 100);
  }

  // Verify roles
  const roles = exposures.map((e) => e.role);
  assert.ok(roles.includes('prime'), 'Should contain prime');
  assert.ok(roles.includes('co_prime'), 'Should contain co_prime');
  assert.ok(roles.includes('secondary'), 'Should contain secondary');
  assert.ok(roles.includes('stabilizer'), 'Should contain stabilizer');

  // Verify deterministic IDs
  const chestExp = exposures.find(
    (e) => e.target.kind === 'anatomical' && e.target.entity === 'pectoralis_major'
  );
  assert.ok(chestExp);
  assert.equal(chestExp?.id, 'sess-bench-1:ex-0025:0:anatomical:pectoralis_major');
});

test('2. Back Squat: preserves all 5 qualitative roles in exposure', () => {
  const session: WorkoutSession = {
    id: 'sess-squat-1',
    userId: 'user-1',
    startedAt: '2026-09-18T11:00:00Z',
    sets: {
      [BACK_SQUAT.id]: [
        {
          setIndex: 0,
          weightKg: 140,
          reps: 5,
          completed: true,
          setType: 'working',
          isWarmup: false,
          rir: 2
        }
      ]
    }
  };

  const exposures = extractMuscleExposures([session], EXERCISES_MAP);

  const roles = new Set(exposures.map((e) => e.role));
  assert.ok(roles.has('prime'), 'Must include prime (quadriceps)');
  assert.ok(roles.has('co_prime'), 'Must include co_prime (gluteus_maximus)');
  assert.ok(roles.has('secondary'), 'Must include secondary (hamstrings, adductor_magnus)');
  assert.ok(roles.has('resisted_isometric'), 'Must include resisted_isometric (erector_spinae)');
  assert.ok(roles.has('stabilizer'), 'Must include stabilizer (gluteus_medius, gluteus_minimus)');
});

test('3. Romanian Deadlift: proves "minimal" survives the entire exposure and balance pipeline', () => {
  const session: WorkoutSession = {
    id: 'sess-rdl-1',
    userId: 'user-1',
    startedAt: '2026-09-18T12:00:00Z',
    sets: {
      [ROMANIAN_DEADLIFT.id]: [
        {
          setIndex: 0,
          weightKg: 120,
          reps: 8,
          completed: true,
          setType: 'working',
          isWarmup: false,
          rpe: 8.5
        }
      ]
    }
  };

  const exposures = extractMuscleExposures([session], EXERCISES_MAP);
  const quadExposure = exposures.find(
    (e) => e.target.kind === 'anatomical' && e.target.entity === 'quadriceps'
  );

  assert.ok(quadExposure, 'Quadriceps exposure must exist for RDL');
  assert.equal(quadExposure?.role, 'minimal', 'Quadriceps role must be minimal');
  assert.equal(quadExposure?.source, 'semantic_v2');

  // Verify minimal survives in Balance aggregation
  const balance = calculateSemanticMuscleBalance(exposures);
  const quadBalance = balance.find(
    (b) => b.target.kind === 'anatomical' && b.target.entity === 'quadriceps'
  );
  assert.ok(quadBalance);
  assert.equal(quadBalance?.roleExposureCounts.minimal, 1);
  assert.ok(quadBalance?.roles.includes('minimal'));
});

test('4. Effort classification: categorical extraction without numeric fatigue scores', () => {
  // Valid RIR paths
  assert.equal(classifySetEffort({ rir: 0 }), 'failure');
  assert.equal(classifySetEffort({ rir: 1 }), 'hard');
  assert.equal(classifySetEffort({ rir: 2 }), 'hard');
  assert.equal(classifySetEffort({ rir: 3 }), 'hard');
  assert.equal(classifySetEffort({ rir: 4 }), 'submaximal');
  assert.equal(classifySetEffort({ rir: 5 }), 'submaximal');
  assert.equal(classifySetEffort({ rir: 6 }), 'submaximal');
  assert.equal(classifySetEffort({ rir: 8 }), 'submaximal');

  // Malformed RIR paths: NEVER failure, ignore invalid RIR
  assert.equal(classifySetEffort({ rir: -1 }), 'unknown');
  assert.equal(classifySetEffort({ rir: -2 }), 'unknown');
  // Fallback to valid RPE when RIR is malformed
  assert.equal(classifySetEffort({ rir: -1, rpe: 9 }), 'hard');
  assert.equal(classifySetEffort({ rir: -2, rpe: 10 }), 'failure');

  // Valid RPE paths
  assert.equal(classifySetEffort({ rpe: 10 }), 'failure');
  assert.equal(classifySetEffort({ rpe: 9 }), 'hard');
  assert.equal(classifySetEffort({ rpe: 8 }), 'hard');
  assert.equal(classifySetEffort({ rpe: 7 }), 'hard');
  assert.equal(classifySetEffort({ rpe: 6.5 }), 'submaximal');
  assert.equal(classifySetEffort({ rpe: 6 }), 'submaximal');

  // Malformed RPE paths: out-of-range RPE must NEVER create measured effort
  assert.equal(classifySetEffort({ rpe: 10.5 }), 'unknown');
  assert.equal(classifySetEffort({ rpe: 15 }), 'unknown');
  assert.equal(classifySetEffort({ rpe: -1 }), 'unknown');

  // STRICT INVARIANT: Missing RIR/RPE MUST BE 'unknown', NEVER assumed as 2
  assert.equal(classifySetEffort({}), 'unknown');
  assert.equal(classifySetEffort({ rir: undefined, rpe: undefined }), 'unknown');
});

test('5. Set eligibility: warmups and uncompleted sets generate ZERO exposure', () => {
  const session: WorkoutSession = {
    id: 'sess-warmup-1',
    userId: 'user-1',
    startedAt: '2026-09-18T13:00:00Z',
    sets: {
      [BENCH_PRESS.id]: [
        {
          setIndex: 0,
          weightKg: 40,
          reps: 15,
          completed: true,
          setType: 'warmup',
          isWarmup: true
        },
        {
          setIndex: 1,
          weightKg: 100,
          reps: 0,
          completed: false,
          setType: 'working',
          isWarmup: false
        },
        {
          setIndex: 2,
          weightKg: 100,
          reps: 8,
          completed: true,
          setType: 'working',
          isWarmup: false
        }
      ]
    }
  };

  const exposures = extractMuscleExposures([session], EXERCISES_MAP);

  // Only set 3 (working, completed) should generate exposures (4 for bench press)
  assert.equal(exposures.length, 4);
  for (const exp of exposures) {
    assert.equal(exp.setIndex, 2);
  }
});

test('6. Legacy fallback: uncurated exercise resolves safely with source = "legacy"', () => {
  const session: WorkoutSession = {
    id: 'sess-legacy-1',
    userId: 'user-1',
    startedAt: '2026-09-18T14:00:00Z',
    sets: {
      [UNCURATED_LEGACY.id]: [
        {
          setIndex: 0,
          weightKg: 30,
          reps: 12,
          completed: true,
          setType: 'working',
          isWarmup: false
        }
      ]
    }
  };

  const exposures = extractMuscleExposures([session], EXERCISES_MAP);

  // Primary: biceps (prime), Secondary: forearms (secondary)
  assert.equal(exposures.length, 2);

  const bicepExp = exposures.find(
    (e) => e.target.kind === 'legacy' && e.target.group === 'biceps'
  );
  assert.ok(bicepExp);
  assert.equal(bicepExp?.role, 'prime');
  assert.equal(bicepExp?.source, 'legacy');
  assert.equal(bicepExp?.effort, 'unknown'); // Missing RIR -> unknown

  const forearmExp = exposures.find(
    (e) => e.target.kind === 'legacy' && e.target.group === 'forearms'
  );
  assert.ok(forearmExp);
  assert.equal(forearmExp?.role, 'secondary');
  assert.equal(forearmExp?.source, 'legacy');
});

test('7. Balance v2: multi-set deduplication per muscle target', () => {
  const session: WorkoutSession = {
    id: 'sess-multi-1',
    userId: 'user-1',
    startedAt: '2026-09-18T15:00:00Z',
    sets: {
      [BENCH_PRESS.id]: [
        {
          setIndex: 0,
          weightKg: 100,
          reps: 8,
          completed: true,
          setType: 'working',
          isWarmup: false,
          rir: 1 // hard
        },
        {
          setIndex: 1,
          weightKg: 100,
          reps: 7,
          completed: true,
          setType: 'working',
          isWarmup: false,
          rir: 4 // submaximal (RIR >= 4)
        }
      ]
    }
  };

  const exposures = extractMuscleExposures([session], EXERCISES_MAP);
  assert.equal(exposures.length, 8); // 4 targets * 2 sets

  const balance = calculateSemanticMuscleBalance(exposures);

  const chestBalance = balance.find(
    (b) => b.target.kind === 'anatomical' && b.target.entity === 'pectoralis_major'
  );
  assert.ok(chestBalance);
  assert.equal(chestBalance?.exposureCount, 2, 'Should count 2 unique physical sets');
  assert.equal(chestBalance?.hardExposureCount, 1, 'Only 1 set was hard');
  assert.equal(chestBalance?.sessionCount, 1);
  assert.equal(chestBalance?.source, 'semantic_v2');
  assert.equal(chestBalance?.roleExposureCounts.prime, 2);
});

test('8. Fatigue v2 Evidence & Policy: facts-first extraction and central policy interface', () => {
  const session1: WorkoutSession = {
    id: 'sess-f1',
    userId: 'user-1',
    startedAt: '2026-09-17T10:00:00Z',
    sets: {
      [BENCH_PRESS.id]: [
        {
          setIndex: 0,
          weightKg: 100,
          reps: 5,
          completed: true,
          setType: 'working',
          isWarmup: false,
          rir: 0 // failure
        },
        {
          setIndex: 1,
          weightKg: 95,
          reps: 6,
          completed: true,
          setType: 'working',
          isWarmup: false,
          rir: 2 // hard
        },
        {
          setIndex: 2,
          weightKg: 90,
          reps: 8,
          completed: true,
          setType: 'working',
          isWarmup: false // unknown effort
        }
      ]
    }
  };

  const exposures = extractMuscleExposures([session1], EXERCISES_MAP);
  const evidenceList = extractMuscleFatigueEvidence(exposures);

  const chestEvidence = evidenceList.find(
    (e) => e.target.kind === 'anatomical' && e.target.entity === 'pectoralis_major'
  );

  assert.ok(chestEvidence);
  assert.equal(chestEvidence?.totalEligibleSets, 3);
  assert.equal(chestEvidence?.failureSets, 1);
  assert.equal(chestEvidence?.hardSets, 1);
  assert.equal(chestEvidence?.unknownEffortSets, 1);
  assert.equal(chestEvidence?.submaximalSets, 0);

  // Test pluggable policy interface
  const stimulus = DefaultFatiguePolicy.classifyStimulus(chestEvidence!);
  assert.equal(stimulus.totalSets, 3);
  assert.equal(stimulus.effectiveHardSets, 2);
  assert.equal(stimulus.dominantRole, 'prime');

  const time2h = new Date('2026-09-17T12:00:00Z');
  // Pluggable policy resolves confidence requiring referenceTime
  const conf = DefaultFatiguePolicy.resolveConfidence(chestEvidence!, time2h);
  assert.equal(conf, 'moderate'); // 1 unknown of 3 sets -> moderate

  // Canonical state evaluation via calculateTargetFatigueV2 and resolveFatigueStateFromResidualFeu:
  // 2h later: residual = 1.70 - 0.25 = 1.45 FEU -> recovering
  const results2h = calculateTargetFatigueV2([session1], EXERCISES_MAP, { referenceTimeMs: time2h.getTime() });
  const res2h = results2h.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;
  assert.equal(res2h.state, 'recovering');
  assert.equal(resolveFatigueStateFromResidualFeu(res2h.residualFeu), 'recovering');

  // 12h later: residual = 1.70 - 1.50 = 0.20 FEU -> fresh
  const time12h = new Date('2026-09-17T22:00:00Z');
  const results12h = calculateTargetFatigueV2([session1], EXERCISES_MAP, { referenceTimeMs: time12h.getTime() });
  const res12h = results12h.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;
  assert.equal(res12h.state, 'fresh');
  assert.equal(resolveFatigueStateFromResidualFeu(res12h.residualFeu), 'fresh');

  // Empty history resolves to 'fresh'
  const resultsEmpty = calculateTargetFatigueV2([], EXERCISES_MAP, { referenceTimeMs: time12h.getTime() });
  assert.equal(resultsEmpty.length, 0);
  assert.equal(resolveFatigueStateFromResidualFeu(0), 'fresh');
});

test('9. Time identity: performedAt uses session.endedAt when available, falling back to startedAt', () => {
  const sessionWithEnded: WorkoutSession = {
    id: 'sess-with-end',
    userId: 'user-1',
    startedAt: '2026-09-18T10:00:00Z',
    endedAt: '2026-09-18T11:15:00Z',
    sets: {
      [BENCH_PRESS.id]: [
        {
          setIndex: 0,
          weightKg: 100,
          reps: 8,
          completed: true,
          setType: 'working',
          isWarmup: false
        }
      ]
    }
  };

  const sessionWithoutEnded: WorkoutSession = {
    id: 'sess-without-end',
    userId: 'user-1',
    startedAt: '2026-09-18T14:00:00Z',
    sets: {
      [BENCH_PRESS.id]: [
        {
          setIndex: 0,
          weightKg: 100,
          reps: 8,
          completed: true,
          setType: 'working',
          isWarmup: false
        }
      ]
    }
  };

  const exposuresWithEnd = extractMuscleExposures([sessionWithEnded], EXERCISES_MAP);
  assert.equal(
    exposuresWithEnd[0]?.performedAt,
    '2026-09-18T11:15:00Z',
    'Must prefer session.endedAt when available'
  );

  const exposuresWithoutEnd = extractMuscleExposures([sessionWithoutEnded], EXERCISES_MAP);
  assert.equal(
    exposuresWithoutEnd[0]?.performedAt,
    '2026-09-18T14:00:00Z',
    'Must fall back to session.startedAt when endedAt is missing'
  );
});
