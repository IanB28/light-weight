import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FATIGUE_POLICY_V1,
  FATIGUE_EFFORT_COEFFICIENTS_V1,
  FATIGUE_ROLE_COEFFICIENTS_V1,
  BASE_CLEARANCE_RATE_V1,
  FATIGUE_STATE_THRESHOLDS_V1,
  resolveSetEffortV1,
  calculatePersonalWeeklyBaseline,
  calculateTargetFatigueV2,
  resolveFatigueStateFromResidualFeu,
  calculateResidualFeuFromExposures,
  evaluateEffortCoverageConfidence,
  aggregateSemanticEvidence,
  extractMuscleFatigueEvidence,
  DefaultFatiguePolicy,
  resolveFatigueConfidence
} from './fatiguePolicy.js';
import { extractMuscleExposures } from './muscleExposure.js';
import { classifySetEffort, FATIGUE_EFFORT_CATEGORIES_V1 } from './muscleExposure.js';
import type { Exercise, WorkoutSession } from './types.js';

// Curated exercises present in EXERCISE_ID_TO_SEMANTICS_KEY
const BENCH_PRESS: Exercise = {
  id: 'ex-0025',
  name: 'Barbell Bench Press',
  category: 'barbell',
  primaryMuscle: 'chest',
  secondaryMuscles: ['triceps', 'shoulders']
};

const SQUAT: Exercise = {
  id: 'ex-0043',
  name: 'Barbell Full Squat',
  category: 'barbell',
  primaryMuscle: 'quadriceps',
  secondaryMuscles: ['glutes', 'hamstrings']
};

const RDL: Exercise = {
  id: 'ex-0085',
  name: 'Barbell Romanian Deadlift',
  category: 'barbell',
  primaryMuscle: 'hamstrings',
  secondaryMuscles: ['glutes', 'back']
};

const SHOULDER_PRESS: Exercise = {
  id: 'ex-0405',
  name: 'Dumbbell Seated Shoulder Press',
  category: 'dumbbell',
  primaryMuscle: 'shoulders',
  secondaryMuscles: ['triceps']
};

const TRICEPS_PUSHDOWN: Exercise = {
  id: 'ex-uncurated-triceps',
  name: 'Triceps Pushdown',
  category: 'cable',
  primaryMuscle: 'triceps',
  secondaryMuscles: []
};

const EXERCISES_MAP: Record<string, Exercise> = {
  [BENCH_PRESS.id]: BENCH_PRESS,
  [SQUAT.id]: SQUAT,
  [RDL.id]: RDL,
  [SHOULDER_PRESS.id]: SHOULDER_PRESS,
  [TRICEPS_PUSHDOWN.id]: TRICEPS_PUSHDOWN
};

test('1. Effort Table & RPE Fallback Resolution', () => {
  // Explicit RIR
  assert.equal(resolveSetEffortV1({ rir: 0 }).effortCoeff, 1.00);
  assert.equal(resolveSetEffortV1({ rir: 1 }).effortCoeff, 0.85);
  assert.equal(resolveSetEffortV1({ rir: 2 }).effortCoeff, 0.70);
  assert.equal(resolveSetEffortV1({ rir: 3 }).effortCoeff, 0.55);
  assert.equal(resolveSetEffortV1({ rir: 4 }).effortCoeff, 0.40);
  assert.equal(resolveSetEffortV1({ rir: 5 }).effortCoeff, 0.25);
  assert.equal(resolveSetEffortV1({ rir: 6 }).effortCoeff, 0.10);
  assert.equal(resolveSetEffortV1({ rir: 8 }).effortCoeff, 0.10);

  // RPE Fallback (when RIR absent)
  assert.equal(resolveSetEffortV1({ rpe: 10 }).effortCoeff, 1.00);
  assert.equal(resolveSetEffortV1({ rpe: 9 }).effortCoeff, 0.85);
  assert.equal(resolveSetEffortV1({ rpe: 8 }).effortCoeff, 0.70);
  assert.equal(resolveSetEffortV1({ rpe: 7 }).effortCoeff, 0.55);
  assert.equal(resolveSetEffortV1({ rpe: 6 }).effortCoeff, 0.40);
  assert.equal(resolveSetEffortV1({ rpe: 5 }).effortCoeff, 0.25);
  assert.equal(resolveSetEffortV1({ rpe: 4 }).effortCoeff, 0.10);

  // Missing RIR & RPE -> strictly 0 measured FEU, isUnknown = true
  const missingEffort = resolveSetEffortV1({});
  assert.equal(missingEffort.effortCoeff, 0);
  assert.equal(missingEffort.isUnknown, true);
  assert.equal(missingEffort.effortConflict, false);

  // Explicit RIR authoritative over RPE
  const bothPresent = resolveSetEffortV1({ rir: 1, rpe: 8 });
  assert.equal(bothPresent.effortCoeff, 0.85);
  assert.equal(bothPresent.isUnknown, false);
  assert.equal(bothPresent.effortConflict, false);

  // Material conflict (|RIR - (10 - RPE)| >= 2)
  const conflictPresent = resolveSetEffortV1({ rir: 0, rpe: 7 }); // RIR 0 vs RPE 7 (RIR 3 equivalent)
  assert.equal(conflictPresent.effortCoeff, 1.00); // RIR is still authoritative
  assert.equal(conflictPresent.effortConflict, true);
});

test('2. Role Contributions match approved heuristics', () => {
  assert.equal(FATIGUE_ROLE_COEFFICIENTS_V1.prime, 1.00);
  assert.equal(FATIGUE_ROLE_COEFFICIENTS_V1.co_prime, 0.70);
  assert.equal(FATIGUE_ROLE_COEFFICIENTS_V1.secondary, 0.40);
  assert.equal(FATIGUE_ROLE_COEFFICIENTS_V1.resisted_isometric, 0.20);
  assert.equal(FATIGUE_ROLE_COEFFICIENTS_V1.stabilizer, 0.10);
  assert.equal(FATIGUE_ROLE_COEFFICIENTS_V1.minimal, 0.05);

  // Base clearance rate
  assert.equal(BASE_CLEARANCE_RATE_V1, 0.125);
});

test('3. Push convergence: compound chest, direct shoulder, direct triceps accumulate naturally', () => {
  const session: WorkoutSession = {
    id: 'push-sess-1',
    userId: 'u1',
    startedAt: '2026-09-18T10:00:00Z',
    sets: {
      [BENCH_PRESS.id]: [
{ setIndex: 0, setType: 'working' as const, weightKg: 100, reps: 8, completed: true, isWarmup: false, rir: 1 },
        { setIndex: 1, setType: 'working' as const, weightKg: 100, reps: 8, completed: true, isWarmup: false, rir: 1 },
        { setIndex: 2, setType: 'working' as const, weightKg: 100, reps: 7, completed: true, isWarmup: false, rir: 0 }
      ],
      [SHOULDER_PRESS.id]: [
{ setIndex: 0, setType: 'working' as const, weightKg: 26, reps: 8, completed: true, isWarmup: false, rir: 2 },
        { setIndex: 1, setType: 'working' as const, weightKg: 26, reps: 7, completed: true, isWarmup: false, rir: 1 }
      ],
      [TRICEPS_PUSHDOWN.id]: [
{ setIndex: 0, setType: 'working' as const, weightKg: 35, reps: 12, completed: true, isWarmup: false, rir: 1 },
        { setIndex: 1, setType: 'working' as const, weightKg: 35, reps: 10, completed: true, isWarmup: false, rir: 0 }
      ]
    }
  };

  const results = calculateTargetFatigueV2([session], EXERCISES_MAP, {
    referenceTimeMs: Date.parse('2026-09-18T10:00:00Z')
  });

  const chestResult = results.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major');
  const tricepsResult = results.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'triceps_brachii');
  const deltResult = results.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'anterior_deltoid');

  assert.ok(chestResult, 'Pectoralis major must be evaluated');
  assert.ok(tricepsResult, 'Triceps brachii must be evaluated');
  assert.ok(deltResult, 'Anterior deltoid must be evaluated');

  // Both chest and triceps received heavy volume, accumulating realistic FEU
  assert.ok(chestResult.residualFeu >= 2.7, 'Chest should have significant FEU');
  assert.ok(tricepsResult.residualFeu > 1.5, 'Triceps should accumulate significant load from presses');
  assert.ok(deltResult.residualFeu > 1.0, 'Delts should accumulate significant load');
});

test('4. Quad dominant: high quad volume results in quad FEU >> hamstring FEU naturally', () => {
  const session: WorkoutSession = {
    id: 'squat-sess-1',
    userId: 'u1',
    startedAt: '2026-09-18T10:00:00Z',
    sets: {
      [SQUAT.id]: [
{ setIndex: 0, setType: 'working' as const, weightKg: 140, reps: 6, completed: true, isWarmup: false, rir: 1 },
        { setIndex: 1, setType: 'working' as const, weightKg: 140, reps: 6, completed: true, isWarmup: false, rir: 1 },
        { setIndex: 2, setType: 'working' as const, weightKg: 140, reps: 5, completed: true, isWarmup: false, rir: 1 },
        { setIndex: 3, setType: 'working' as const, weightKg: 140, reps: 5, completed: true, isWarmup: false, rir: 1 }
      ]
    }
  };

  const results = calculateTargetFatigueV2([session], EXERCISES_MAP, {
    referenceTimeMs: Date.parse('2026-09-18T10:00:00Z')
  });

  const quadResult = results.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'quadriceps');
  const hamResult = results.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'hamstrings');

  assert.ok(quadResult);
  assert.ok(hamResult);

  // 4 sets @ RIR 1:
  // Quad is prime (1.00): 4 * 0.85 * 1.00 = 3.40 FEU
  // Hamstring is secondary (0.40): 4 * 0.85 * 0.40 = 1.36 FEU
  assert.equal(quadResult.residualFeu, 3.40);
  assert.equal(hamResult.residualFeu, 1.36);
  assert.ok(quadResult.residualFeu > 2 * hamResult.residualFeu, 'Quad FEU must be >> Hamstring FEU');
  assert.equal(quadResult.state, 'fatigued');
  assert.equal(hamResult.state, 'recovering');
});

test('5. Multi-role muscle: Anterior deltoid as secondary in Bench and prime in Shoulder Press accumulates both', () => {
  const session: WorkoutSession = {
    id: 'multi-role-delt',
    userId: 'u1',
    startedAt: '2026-09-18T10:00:00Z',
    sets: {
      [BENCH_PRESS.id]: [
{ setIndex: 0, setType: 'working' as const, weightKg: 100, reps: 8, completed: true, isWarmup: false, rir: 1 } // Effort 0.85 * secondary 0.40 = 0.340
      ],
      [SHOULDER_PRESS.id]: [
{ setIndex: 0, setType: 'working' as const, weightKg: 30, reps: 10, completed: true, isWarmup: false, rir: 1 } // Effort 0.85 * prime 1.00 = 0.850
      ]
    }
  };

  const results = calculateTargetFatigueV2([session], EXERCISES_MAP, {
    referenceTimeMs: Date.parse('2026-09-18T10:00:00Z')
  });

  const deltResult = results.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'anterior_deltoid');
  assert.ok(deltResult);

  const expectedFeu = 0.85 * 0.40 + 0.85 * 1.00; // 0.34 + 0.85 = 1.190
  assert.ok(Math.abs(deltResult.residualFeu - expectedFeu) < 1e-9);
  assert.equal(deltResult.dominantRole, 'prime');
  assert.equal(deltResult.totalEligibleSets, 2);
});

test('6. Stabilizer and minimal roles produce strictly non-zero contribution', () => {
  assert.equal(FATIGUE_ROLE_COEFFICIENTS_V1.stabilizer, 0.10);
  assert.equal(FATIGUE_ROLE_COEFFICIENTS_V1.minimal, 0.05);

  const effort0 = resolveSetEffortV1({ rir: 0 }); // 1.00
  const stabilizerFeu = effort0.effortCoeff * FATIGUE_ROLE_COEFFICIENTS_V1.stabilizer;
  const minimalFeu = effort0.effortCoeff * FATIGUE_ROLE_COEFFICIENTS_V1.minimal;

  assert.equal(stabilizerFeu, 0.10);
  assert.equal(minimalFeu, 0.05);
  assert.ok(stabilizerFeu > 0);
  assert.ok(minimalFeu > 0);
});

test('7. Unknown effort sets generate 0 measured FEU and reduce confidence', () => {
  const session: WorkoutSession = {
    id: 'sess-unknown-effort',
    userId: 'u1',
    startedAt: '2026-09-18T10:00:00Z',
    sets: {
      [BENCH_PRESS.id]: [
        { setIndex: 0, setType: 'working' as const, weightKg: 100, reps: 8, completed: true, isWarmup: false }, // missing rir & rpe
        { setIndex: 1, setType: 'working' as const, weightKg: 100, reps: 8, completed: true, isWarmup: false }  // missing rir & rpe
      ]
    }
  };

  const results = calculateTargetFatigueV2([session], EXERCISES_MAP, {
    referenceTimeMs: Date.parse('2026-09-18T10:00:00Z')
  });

  const chest = results.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major');
  assert.ok(chest);
  assert.equal(chest.totalEligibleSets, 2);
  assert.equal(chest.unknownEffortExposureCount, 2);
  assert.equal(chest.residualFeu, 0, 'Measured FEU must be 0 when effort is unknown');
  assert.equal(chest.confidence, 'low');
  assert.ok(chest.reasons.some((r) => r.code === 'insufficient_effort_data'));

  // UNKNOWN-DATA SAFETY: Even though residualFeu is 0 (<0.25 fresh), confidence is NOT high!
  assert.notEqual(chest.confidence, 'high');
});

test('8. Temporal clearance: 1 FEU clears in 8 hours, 6 FEU clears in 48 hours without fixed windows', () => {
  const startTime = '2026-09-18T00:00:00Z';
  const startMs = Date.parse(startTime);

  // 1 FEU: 1 set Bench @ RIR 0
  const session1Feu: WorkoutSession = {
    id: 's-1feu',
    userId: 'u1',
    startedAt: startTime,
    sets: {
      [BENCH_PRESS.id]: [
{ setIndex: 0, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 0 } // 1.00 FEU
      ]
    }
  };

  // At 4h: 1.00 - 4 * 0.125 = 0.50 FEU (ready)
  const res4h = calculateTargetFatigueV2([session1Feu], EXERCISES_MAP, { referenceTimeMs: startMs + 4 * 3600000 });
  const chest4h = res4h.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;
  assert.equal(chest4h.residualFeu, 0.50);
  assert.equal(chest4h.state, 'ready');

  // At 8h: 1.00 - 8 * 0.125 = 0.00 FEU (fresh)
  const res8h = calculateTargetFatigueV2([session1Feu], EXERCISES_MAP, { referenceTimeMs: startMs + 8 * 3600000 });
  const chest8h = res8h.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;
  assert.equal(chest8h.residualFeu, 0.00);
  assert.equal(chest8h.state, 'fresh');

  // 6 FEU: 6 sets Bench @ RIR 0
  const session6Feu: WorkoutSession = {
    id: 's-6feu',
    userId: 'u1',
    startedAt: startTime,
    sets: {
      [BENCH_PRESS.id]: Array.from({ length: 6 }, (_, i) => ({
        setIndex: i, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 0
      }))
    }
  };

  // At 8h: 6.00 - 8 * 0.125 = 5.00 FEU (fatigued) -> 1 FEU is cleared, but 6 FEU is still heavily fatigued!
  const res6Feu8h = calculateTargetFatigueV2([session6Feu], EXERCISES_MAP, { referenceTimeMs: startMs + 8 * 3600000 });
  const chest6Feu8h = res6Feu8h.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;
  assert.equal(chest6Feu8h.residualFeu, 5.00);
  assert.equal(chest6Feu8h.state, 'fatigued');

  // At 48h: 6.00 - 48 * 0.125 = 0.00 FEU (fresh)
  const res6Feu48h = calculateTargetFatigueV2([session6Feu], EXERCISES_MAP, { referenceTimeMs: startMs + 48 * 3600000 });
  const chest6Feu48h = res6Feu48h.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;
  assert.equal(chest6Feu48h.residualFeu, 0.00);
  assert.equal(chest6Feu48h.state, 'fresh');
});

test('9. Multiple sessions sum their independent residuals', () => {
  const refTime = Date.parse('2026-09-18T20:00:00Z');

  // Session 1: 24h ago, 4 FEU. Elapsed: 24h. Cleared: 24 * 0.125 = 3.0 FEU. Residual: 1.0 FEU
  const s1: WorkoutSession = {
    id: 'sess-1',
    userId: 'u1',
    startedAt: new Date(refTime - 24 * 3600000).toISOString(),
    sets: {
      [BENCH_PRESS.id]: Array.from({ length: 4 }, (_, i) => ({
        setIndex: i, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 0 // 4 * 1.00 = 4 FEU
      }))
    }
  };

  // Session 2: 8h ago, 3 FEU. Elapsed: 8h. Cleared: 8 * 0.125 = 1.0 FEU. Residual: 2.0 FEU
  const s2: WorkoutSession = {
    id: 'sess-2',
    userId: 'u1',
    startedAt: new Date(refTime - 8 * 3600000).toISOString(),
    sets: {
      [BENCH_PRESS.id]: Array.from({ length: 3 }, (_, i) => ({
        setIndex: i, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 0 // 3 * 1.00 = 3 FEU
      }))
    }
  };

  const results = calculateTargetFatigueV2([s1, s2], EXERCISES_MAP, { referenceTimeMs: refTime });
  const chest = results.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;

  assert.equal(chest.residualFeu, 3.00); // 1.0 + 2.0 = 3.00 FEU
  assert.equal(chest.state, 'fatigued'); // >= 3.00 -> fatigued
});

test('10. Personal weekly baseline: requires >= 4 valid weeks, zero population fallback', () => {
  // 0 weeks
  const res0 = calculatePersonalWeeklyBaseline([], 10);
  assert.equal(res0.baseline, null);
  assert.equal(res0.modifier, 1.00);

  // 3 weeks (insufficient history -> disabled)
  const res3 = calculatePersonalWeeklyBaseline([12, 14, 16], 20);
  assert.equal(res3.baseline, null);
  assert.equal(res3.modifier, 1.00);

  // 4 valid weeks -> median active
  // [10, 12, 14, 16] -> median is (12 + 14)/2 = 13.0
  const res4Norm = calculatePersonalWeeklyBaseline([10, 12, 14, 16], 13.0);
  assert.equal(res4Norm.baseline, 13.0);
  assert.equal(res4Norm.modifier, 1.00); // <= 1.00 * baseline

  // 4 valid weeks with rolling load > 1.00 and <= 1.25 baseline (13 * 1.25 = 16.25)
  const res4Mod90 = calculatePersonalWeeklyBaseline([10, 12, 14, 16], 15.0);
  assert.equal(res4Mod90.baseline, 13.0);
  assert.equal(res4Mod90.modifier, 0.90);

  // 4 valid weeks with rolling load > 1.25 baseline
  const res4Mod80 = calculatePersonalWeeklyBaseline([10, 12, 14, 16], 18.0);
  assert.equal(res4Mod80.baseline, 13.0);
  assert.equal(res4Mod80.modifier, 0.80);
});

test('11. State boundary thresholds are exact', () => {
  assert.equal(FATIGUE_STATE_THRESHOLDS_V1.fatigued, 3.00);
  assert.equal(FATIGUE_STATE_THRESHOLDS_V1.recovering, 1.00);
  assert.equal(FATIGUE_STATE_THRESHOLDS_V1.ready, 0.25);

  function getStateForFeu(feu: number) {
    if (feu >= 3.00) return 'fatigued';
    if (feu >= 1.00) return 'recovering';
    if (feu >= 0.25) return 'ready';
    return 'fresh';
  }

  assert.equal(getStateForFeu(3.00), 'fatigued');
  assert.equal(getStateForFeu(2.999), 'recovering');
  assert.equal(getStateForFeu(1.00), 'recovering');
  assert.equal(getStateForFeu(0.999), 'ready');
  assert.equal(getStateForFeu(0.25), 'ready');
  assert.equal(getStateForFeu(0.249), 'fresh');
  assert.equal(getStateForFeu(0.00), 'fresh');
});
test('12. Canonical state engine: two sessions at different timestamps produce session-aware result distinct from synthetic merge', () => {
  const t0 = Date.parse('2026-09-18T00:00:00Z');
  // Session 1: at t = 0h, 3 sets Bench @ RIR 0 -> 3.00 FEU
  const s1: WorkoutSession = {
    id: 's1',
    userId: 'u1',
    startedAt: new Date(t0).toISOString(),
    sets: {
      [BENCH_PRESS.id]: Array.from({ length: 3 }, (_, i) => ({
        setIndex: i, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 0
      }))
    }
  };

  // Session 2: at t = 16h, 3 sets Bench @ RIR 0 -> 3.00 FEU
  const s2: WorkoutSession = {
    id: 's2',
    userId: 'u1',
    startedAt: new Date(t0 + 16 * 3600000).toISOString(),
    sets: {
      [BENCH_PRESS.id]: Array.from({ length: 3 }, (_, i) => ({
        setIndex: i, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 0
      }))
    }
  };

  // Evaluation at t = 24h:
  // Session 1: elapsed 24h -> cleared 24 * 0.125 = 3.00 FEU -> residual 0.00 FEU
  // Session 2: elapsed 8h -> cleared 8 * 0.125 = 1.00 FEU -> residual 2.00 FEU
  // True session-aware residual = 0.00 + 2.00 = 2.00 FEU -> state 'recovering'
  // (A naive synthetic single-session model at lastExposureAt (t=16h) with 6.00 FEU would have:
  // elapsed 8h -> 6.00 - 1.00 = 5.00 FEU -> state 'fatigued')
  const refTime = t0 + 24 * 3600000;
  const results = calculateTargetFatigueV2([s1, s2], EXERCISES_MAP, { referenceTimeMs: refTime });
  const chest = results.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;

  assert.equal(chest.residualFeu, 2.00);
  assert.equal(chest.state, 'recovering');

  // And pure classifier resolveFatigueStateFromResidualFeu maps 2.00 FEU to recovering
  assert.equal(resolveFatigueStateFromResidualFeu(chest.residualFeu), 'recovering');
});

test('13. Baseline partial week: history begins halfway through candidate week -> that week is NOT valid', () => {
  const refTime = Date.parse('2026-09-18T12:00:00Z');
  // Candidate week 1: [refTime - 14d, refTime - 7d].
  // User earliest session is at refTime - 10d (history begins halfway through candidate week 1).
  // Therefore coverageStart (refTime - 10d) > weekStart (refTime - 14d) -> week 1 is INVALID!
  const sPartial: WorkoutSession = {
    id: 's-partial',
    userId: 'u1',
    startedAt: new Date(refTime - 10 * 24 * 3600000).toISOString(),
    sets: {
      [BENCH_PRESS.id]: [{ setIndex: 0, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 0 }]
    }
  };

  const results = calculateTargetFatigueV2([sPartial], EXERCISES_MAP, { referenceTimeMs: refTime });
  const chest = results.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;
  // Only 0 valid previous complete weeks -> baseline is null, modifier is 1.00
  assert.equal(chest.baselineWeeklyFeu, null);
  assert.equal(chest.weeklyClearanceModifier, 1.00);
});

test('14. Four genuinely complete previous windows -> personal baseline activates', () => {
  const refTime = Date.parse('2026-09-18T12:00:00Z');
  // History starts 35 days ago (covers 4 complete 7-day windows: 7-14d, 14-21d, 21-28d, 28-35d).
  const sessions: WorkoutSession[] = [];
  // Earliest session at refTime - 35d
  sessions.push({
    id: 's-start',
    userId: 'u1',
    startedAt: new Date(refTime - 35 * 24 * 3600000).toISOString(),
    sets: {
      [BENCH_PRESS.id]: [{ setIndex: 0, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 0 }]
    }
  });
  // One session in each of the 4 complete candidate weeks (weeks 1, 2, 3, 4):
  // Week 4: 28-35d ago -> 10 FEU
  // Week 3: 21-28d ago -> 12 FEU
  // Week 2: 14-21d ago -> 14 FEU
  // Week 1: 7-14d ago -> 16 FEU
  for (const [w, sets] of [[1, 16], [2, 14], [3, 12], [4, 10]] as const) {
    sessions.push({
      id: `s-w${w}`,
      userId: 'u1',
      startedAt: new Date(refTime - (w * 7 + 3) * 24 * 3600000).toISOString(),
      sets: {
        [BENCH_PRESS.id]: Array.from({ length: sets }, (_, i) => ({
          setIndex: i, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 0
        }))
      }
    });
  }

  const results = calculateTargetFatigueV2(sessions, EXERCISES_MAP, { referenceTimeMs: refTime });
  const chest = results.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;
  // 4 valid weeks: [16, 14, 12, 10] -> median is 13.0
  assert.equal(chest.baselineWeeklyFeu, 13.0);
});

test('15. Zero baseline safety: [0, 0, 0, 0] does not activate 0.80 modifier', () => {
  const res = calculatePersonalWeeklyBaseline([0, 0, 0, 0], 5.0);
  assert.equal(res.baseline, null);
  assert.equal(res.modifier, 1.00);
  assert.equal(res.isUsable, false);
});

test('16. Target isolation: historical baseline override is target-specific and not reused across other muscles', () => {
  const refTime = Date.parse('2026-09-18T10:00:00Z');
  const session: WorkoutSession = {
    id: 's-iso',
    userId: 'u1',
    startedAt: new Date(refTime).toISOString(),
    sets: {
      [BENCH_PRESS.id]: Array.from({ length: 20 }, (_, i) => ({
        setIndex: i, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 0
      }))
    }
  };

  const chestKey = 'anatomical:pectoralis_major';
  const results = calculateTargetFatigueV2([session], EXERCISES_MAP, {
    referenceTimeMs: refTime,
    historicalWeeklyTotalsByTarget: {
      [chestKey]: [10, 10, 10, 10] // Chest baseline = 10.0
    }
  });

  const chest = results.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;
  const triceps = results.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'triceps_brachii')!;

  assert.equal(chest.baselineWeeklyFeu, 10.0);
  // Chest rolling 7-day load = 20 * 1.00 * 1.00 = 20 FEU > 1.25 * 10 -> modifier 0.80
  assert.equal(chest.weeklyClearanceModifier, 0.80);

  // Triceps was NOT given an override, has <4 history weeks -> baseline null, modifier 1.00
  assert.equal(triceps.baselineWeeklyFeu, null);
  assert.equal(triceps.weeklyClearanceModifier, 1.00);
});

test('17. Option contract: minValidWeeksForBaseline and historicalLookbackWeeks directly affect behavior', () => {
  // With minValidWeeksForBaseline = 2, 2 weeks activates baseline
  const res2Weeks = calculatePersonalWeeklyBaseline([10, 12], 11, 2);
  assert.equal(res2Weeks.baseline, 11);
  assert.equal(res2Weeks.isUsable, true);

  // Default requires 4 weeks -> 2 weeks returns null
  const resDefault = calculatePersonalWeeklyBaseline([10, 12], 11);
  assert.equal(resDefault.baseline, null);
  assert.equal(resDefault.isUsable, false);
});

test('18. Unknown effort coverage confidence thresholds: 0%, 25%, 50%, 51%, 100%', () => {
  // 0% unknown (0 of 4) -> no penalty (high)
  const cov0 = evaluateEffortCoverageConfidence(0, 4);
  assert.equal(cov0.confidenceCap, 'high');
  assert.equal(cov0.reason, undefined);

  // 25% unknown (1 of 4) -> moderate
  const cov25 = evaluateEffortCoverageConfidence(1, 4);
  assert.equal(cov25.confidenceCap, 'moderate');
  assert.equal(cov25.reason?.code, 'partial_unknown_effort');

  // 50% unknown (2 of 4) -> moderate
  const cov50 = evaluateEffortCoverageConfidence(2, 4);
  assert.equal(cov50.confidenceCap, 'moderate');
  assert.equal(cov50.reason?.code, 'partial_unknown_effort');

  // 51% unknown (51 of 100) -> low
  const cov51 = evaluateEffortCoverageConfidence(51, 100);
  assert.equal(cov51.confidenceCap, 'low');
  assert.equal(cov51.reason?.code, 'insufficient_effort_data');

  // 100% unknown (4 of 4) -> low
  const cov100 = evaluateEffortCoverageConfidence(4, 4);
  assert.equal(cov100.confidenceCap, 'low');
  assert.equal(cov100.reason?.code, 'insufficient_effort_data');
});

test('19. Semantic aggregation: high + low semantic evidence resolves conservatively, not high', () => {
  const summary = aggregateSemanticEvidence(
    new Set(['semantic_v2']),
    ['high', 'low']
  );
  assert.equal(summary.source, 'semantic_v2');
  assert.equal(summary.semanticConfidence, 'low');
  assert.equal(summary.confidenceCap, 'moderate');
});

test('20. Mixed legacy/semantic evidence cannot resolve as full high-confidence', () => {
  const summary = aggregateSemanticEvidence(
    new Set(['semantic_v2', 'legacy']),
    ['high']
  );
  assert.equal(summary.source, 'mixed');
  assert.equal(summary.confidenceCap, 'moderate');
  assert.equal(summary.reason?.code, 'legacy_anatomy');
});

test('21. Unknown-heavy fresh exposes low confidence and insufficient_effort_data reason', () => {
  const session: WorkoutSession = {
    id: 's-unknown',
    userId: 'u1',
    startedAt: '2026-09-18T10:00:00Z',
    sets: {
      [BENCH_PRESS.id]: [
        { setIndex: 0, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false },
        { setIndex: 1, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false }
      ]
    }
  };

  const results = calculateTargetFatigueV2([session], EXERCISES_MAP, {
    referenceTimeMs: Date.parse('2026-09-18T10:00:00Z')
  });
  const chest = results.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;

  assert.equal(chest.residualFeu, 0);
  assert.equal(chest.state, 'fresh'); // Underlying mathematical state remains fresh
  assert.equal(chest.confidence, 'low'); // Data quality is LOW
  assert.equal(chest.unknownEffortExposureCount, 2);
  assert.ok(chest.reasons.some((r) => r.code === 'insufficient_effort_data'));
});

test('22. Balance regression: Effort category alignment does not modify Balance exposure counts or physical deduplication', () => {
  // Session with Bench Press (1 failure, 1 hard, 1 submaximal)
  const session: WorkoutSession = {
    id: 's-bal',
    userId: 'u1',
    startedAt: '2026-09-18T10:00:00Z',
    sets: {
      [BENCH_PRESS.id]: [
        { setIndex: 0, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 0 }, // failure
        { setIndex: 1, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 2 }, // hard
        { setIndex: 2, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 5 }  // submaximal
      ]
    }
  };

  const exposures = extractMuscleExposures([session], EXERCISES_MAP);
  const chestExposures = exposures.filter((e) => e.target.kind === 'anatomical' && e.target.entity === 'pectoralis_major');

  assert.equal(chestExposures.length, 3);
  assert.equal(chestExposures[0].effort, 'failure');
  assert.equal(chestExposures[1].effort, 'hard');
  assert.equal(chestExposures[2].effort, 'submaximal');

  // Hard exposure count in Balance foundation metadata remains 2 (failure + hard)
  const hardCount = chestExposures.filter((e) => e.effort === 'failure' || e.effort === 'hard').length;
  assert.equal(hardCount, 2);
});

test('23. Single canonical state engine: weeklyClearanceModifier = 0.80 boundary test produces identical result across all public state APIs', () => {
  const refTime = Date.parse('2026-09-18T12:00:00Z');

  // Establish 4 complete previous historical weeks with 4.00 FEU each -> median baseline = 4.00 FEU
  const sessions: WorkoutSession[] = [];
  sessions.push({
    id: 's-start-baseline',
    userId: 'u1',
    startedAt: new Date(refTime - 35 * 24 * 3600000).toISOString(),
    sets: {
      [BENCH_PRESS.id]: [{ setIndex: 0, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 0 }]
    }
  });

  for (let w = 1; w <= 4; w++) {
    sessions.push({
      id: `s-hist-w${w}`,
      userId: 'u1',
      startedAt: new Date(refTime - (w * 7 + 3) * 24 * 3600000).toISOString(),
      sets: {
        [BENCH_PRESS.id]: Array.from({ length: 4 }, (_, i) => ({
          setIndex: i, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 0 // 4 * 1.00 = 4.00 FEU
        }))
      }
    });
  }

  // Recent session 24h ago with SessionFEU = 5.50:
  // 4 sets @ RIR 0 (4.00) + 2 sets @ RIR 2 (2 * 0.70 = 1.40) + 1 set @ RIR 6+ (0.10) = 5.50 FEU
  // Baseline = 4.00 FEU. Rolling 7-day load = 5.50 > 1.25 * 4.00 = 5.00 -> weeklyClearanceModifier = 0.80.
  // Effective clearance rate = 0.125 * 0.80 = 0.100 FEU/h.
  // Cleared in 24h = 24 * 0.100 = 2.40 FEU.
  // Residual = 5.50 - 2.40 = 3.10 FEU -> STATE IS 'fatigued' (>= 3.00).
  // (Notice: if modifier 1.00 had been used, cleared = 24 * 0.125 = 3.00 FEU, residual = 2.50 FEU -> 'recovering').
  sessions.push({
    id: 's-recent-boundary',
    userId: 'u1',
    startedAt: new Date(refTime - 24 * 3600000).toISOString(),
    sets: {
      [BENCH_PRESS.id]: [
        { setIndex: 0, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 0 },
        { setIndex: 1, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 0 },
        { setIndex: 2, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 0 },
        { setIndex: 3, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 0 },
        { setIndex: 4, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 2 },
        { setIndex: 5, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 2 },
        { setIndex: 6, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 6 }
      ]
    }
  });

  const results = calculateTargetFatigueV2(sessions, EXERCISES_MAP, { referenceTimeMs: refTime });
  const chest = results.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;

  assert.equal(chest.baselineWeeklyFeu, 4.00);
  assert.equal(chest.weeklyClearanceModifier, 0.80);
  assert.equal(Math.round(chest.residualFeu * 100) / 100, 3.10);
  assert.equal(chest.state, 'fatigued');

  // Pure state function returns identical result
  assert.equal(resolveFatigueStateFromResidualFeu(chest.residualFeu), 'fatigued');
  assert.equal(FATIGUE_POLICY_V1.resolveFatigueStateFromResidualFeu(chest.residualFeu), 'fatigued');

  // Mathematical proof: if an incomplete evidence API had defaulted modifier to 1.00:
  // cleared = 24h * 0.125 * 1.00 = 3.00 FEU -> residual = 5.50 - 3.00 = 2.50 FEU -> recovering (WRONG!)
  // Under canonical history, modifier = 0.80 -> cleared = 2.40 FEU -> residual = 3.10 FEU -> fatigued (CORRECT!)
  const unwindowedCleared = 24 * BASE_CLEARANCE_RATE_V1 * 1.00;
  const incorrectResidual = 5.50 - unwindowedCleared;
  assert.equal(incorrectResidual, 2.50);
  assert.equal(resolveFatigueStateFromResidualFeu(incorrectResidual), 'recovering');

  // Architectural invariants:
  // 1. resolveState is permanently removed from FATIGUE_POLICY_V1 & DefaultFatiguePolicy
  assert.equal('resolveState' in FATIGUE_POLICY_V1, false);
  assert.equal('resolveState' in DefaultFatiguePolicy, false);

  // 2. Arbitrary-exposure confidence helper is absent from public policy API
  assert.equal('resolveFatigueConfidenceFromExposures' in FATIGUE_POLICY_V1, false);

  // 3. Low-level calculation/aggregation helpers are absent from public FATIGUE_POLICY_V1 surface
  assert.equal('calculateResidualFeuFromExposures' in FATIGUE_POLICY_V1, false);
  assert.equal('evaluateEffortCoverageConfidence' in FATIGUE_POLICY_V1, false);
  assert.equal('aggregateSemanticEvidence' in FATIGUE_POLICY_V1, false);
});

test('24. Current confidence evidence horizon: old unknown effort >168h ago does not contaminate today, while recent unknown does', () => {
  const refTime = Date.parse('2026-09-18T12:00:00Z');

  // Case A: Old unknown set 200h ago (>168h) + recent fully measured session 24h ago
  const sessionsA: WorkoutSession[] = [
    {
      id: 's-old-unknown',
      userId: 'u1',
      startedAt: new Date(refTime - 200 * 3600000).toISOString(),
      sets: {
        [BENCH_PRESS.id]: [
          { setIndex: 0, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false } // missing rir/rpe
        ]
      }
    },
    {
      id: 's-recent-measured',
      userId: 'u1',
      startedAt: new Date(refTime - 24 * 3600000).toISOString(),
      sets: {
        [BENCH_PRESS.id]: [
          { setIndex: 0, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 1 },
          { setIndex: 1, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 1 }
        ]
      }
    }
  ];

  const resultsA = calculateTargetFatigueV2(sessionsA, EXERCISES_MAP, { referenceTimeMs: refTime });
  const chestA = resultsA.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;

  // The 200h-old unknown set is outside the 168h evidence window -> does NOT degrade current confidence!
  assert.equal(chestA.unknownEffortExposureCount, 0);
  assert.equal(chestA.confidence, 'high');
  assert.equal(chestA.reasons.some((r) => r.code === 'insufficient_effort_data'), false);
  assert.equal(chestA.reasons.some((r) => r.code === 'partial_unknown_effort'), false);

  const exposuresA = extractMuscleExposures(sessionsA, EXERCISES_MAP);
  const evidenceA = extractMuscleFatigueEvidence(exposuresA).find((e) => e.target.kind === 'anatomical' && e.target.entity === 'pectoralis_major')!;
  assert.equal(FATIGUE_POLICY_V1.resolveConfidence(evidenceA, new Date(refTime)), 'high');
  assert.equal(resolveFatigueConfidence(evidenceA, new Date(refTime)), 'high');

  // Case B: Recent unknown set within 168h (24h ago) -> DOES degrade current confidence to moderate
  const sessionsB: WorkoutSession[] = [
    {
      id: 's-recent-partial-unknown',
      userId: 'u1',
      startedAt: new Date(refTime - 24 * 3600000).toISOString(),
      sets: {
        [BENCH_PRESS.id]: [
          { setIndex: 0, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 1 },
          { setIndex: 1, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false } // missing rir/rpe
        ]
      }
    }
  ];

  const resultsB = calculateTargetFatigueV2(sessionsB, EXERCISES_MAP, { referenceTimeMs: refTime });
  const chestB = resultsB.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;

  assert.equal(chestB.unknownEffortExposureCount, 1);
  assert.equal(chestB.confidence, 'moderate');
  assert.ok(chestB.reasons.some((r) => r.code === 'partial_unknown_effort'));
  assert.equal(chestB.reasons.some((r) => r.code === 'insufficient_effort_data'), false);

  const exposuresB = extractMuscleExposures(sessionsB, EXERCISES_MAP);
  const evidenceB = extractMuscleFatigueEvidence(exposuresB).find((e) => e.target.kind === 'anatomical' && e.target.entity === 'pectoralis_major')!;
  assert.equal(FATIGUE_POLICY_V1.resolveConfidence(evidenceB, new Date(refTime)), 'moderate');
  assert.equal(resolveFatigueConfidence(evidenceB, new Date(refTime)), 'moderate');

  // Case C: Recent unknown sets > 50% within 168h -> degrades to low
  const sessionsC: WorkoutSession[] = [
    {
      id: 's-recent-heavy-unknown',
      userId: 'u1',
      startedAt: new Date(refTime - 24 * 3600000).toISOString(),
      sets: {
        [BENCH_PRESS.id]: [
          { setIndex: 0, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 1 },
          { setIndex: 1, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false },
          { setIndex: 2, setType: 'working' as const, weightKg: 100, reps: 5, completed: true, isWarmup: false }
        ]
      }
    }
  ];

  const resultsC = calculateTargetFatigueV2(sessionsC, EXERCISES_MAP, { referenceTimeMs: refTime });
  const chestC = resultsC.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;

  assert.equal(chestC.unknownEffortExposureCount, 2);
  assert.equal(chestC.confidence, 'low');
  assert.ok(chestC.reasons.some((r) => r.code === 'insufficient_effort_data'));
  assert.equal(chestC.reasons.some((r) => r.code === 'partial_unknown_effort'), false);

  const exposuresC = extractMuscleExposures(sessionsC, EXERCISES_MAP);
  const evidenceC = extractMuscleFatigueEvidence(exposuresC).find((e) => e.target.kind === 'anatomical' && e.target.entity === 'pectoralis_major')!;
  assert.equal(FATIGUE_POLICY_V1.resolveConfidence(evidenceC, new Date(refTime)), 'low');
  assert.equal(resolveFatigueConfidence(evidenceC, new Date(refTime)), 'low');
});

test('25. Confidence Reason Taxonomy and Exact Thresholds: 0%, 25%, 50%, 51%, >168h', () => {
  const refTime = Date.parse('2026-09-18T12:00:00Z');

  // Case 1: 0% unknown (4 of 4 logged) -> HIGH confidence, no effort reason
  const s0: WorkoutSession = {
    id: 's-0-pct',
    userId: 'u1',
    startedAt: new Date(refTime - 12 * 3600000).toISOString(),
    sets: {
      [BENCH_PRESS.id]: [
        { setIndex: 0, setType: 'working', weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 2 },
        { setIndex: 1, setType: 'working', weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 2 },
        { setIndex: 2, setType: 'working', weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 2 },
        { setIndex: 3, setType: 'working', weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 2 }
      ]
    }
  };
  const res0 = calculateTargetFatigueV2([s0], EXERCISES_MAP, { referenceTimeMs: refTime });
  const c0 = res0.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;
  assert.equal(c0.confidence, 'high');
  assert.equal(c0.unknownEffortExposureCount, 0);
  assert.equal(c0.reasons.some((r) => r.code === 'partial_unknown_effort'), false);
  assert.equal(c0.reasons.some((r) => r.code === 'insufficient_effort_data'), false);

  // Case 2: 25% unknown (1 of 4 unknown) -> MODERATE confidence, reason: partial_unknown_effort
  const s25: WorkoutSession = {
    id: 's-25-pct',
    userId: 'u1',
    startedAt: new Date(refTime - 12 * 3600000).toISOString(),
    sets: {
      [BENCH_PRESS.id]: [
        { setIndex: 0, setType: 'working', weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 2 },
        { setIndex: 1, setType: 'working', weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 2 },
        { setIndex: 2, setType: 'working', weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 2 },
        { setIndex: 3, setType: 'working', weightKg: 100, reps: 5, completed: true, isWarmup: false } // missing
      ]
    }
  };
  const res25 = calculateTargetFatigueV2([s25], EXERCISES_MAP, { referenceTimeMs: refTime });
  const c25 = res25.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;
  assert.equal(c25.confidence, 'moderate');
  assert.equal(c25.unknownEffortExposureCount, 1);
  assert.ok(c25.reasons.some((r) => r.code === 'partial_unknown_effort'));
  assert.equal(c25.reasons.some((r) => r.code === 'insufficient_effort_data'), false);

  // Case 3: 50% unknown (2 of 4 unknown) -> MODERATE confidence, reason: partial_unknown_effort
  const s50: WorkoutSession = {
    id: 's-50-pct',
    userId: 'u1',
    startedAt: new Date(refTime - 12 * 3600000).toISOString(),
    sets: {
      [BENCH_PRESS.id]: [
        { setIndex: 0, setType: 'working', weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 2 },
        { setIndex: 1, setType: 'working', weightKg: 100, reps: 5, completed: true, isWarmup: false, rir: 2 },
        { setIndex: 2, setType: 'working', weightKg: 100, reps: 5, completed: true, isWarmup: false }, // missing
        { setIndex: 3, setType: 'working', weightKg: 100, reps: 5, completed: true, isWarmup: false }  // missing
      ]
    }
  };
  const res50 = calculateTargetFatigueV2([s50], EXERCISES_MAP, { referenceTimeMs: refTime });
  const c50 = res50.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;
  assert.equal(c50.confidence, 'moderate');
  assert.equal(c50.unknownEffortExposureCount, 2);
  assert.ok(c50.reasons.some((r) => r.code === 'partial_unknown_effort'));
  assert.equal(c50.reasons.some((r) => r.code === 'insufficient_effort_data'), false);

  // Case 4: 51% unknown (51 of 100 unknown) -> LOW confidence, reason: insufficient_effort_data
  const sets100 = [];
  for (let i = 0; i < 100; i++) {
    sets100.push({
      setIndex: i,
      setType: 'working' as const,
      weightKg: 100,
      reps: 5,
      completed: true,
      isWarmup: false,
      ...(i < 49 ? { rir: 2 } : {}) // 49 measured, 51 missing (51%)
    });
  }
  const s51: WorkoutSession = {
    id: 's-51-pct',
    userId: 'u1',
    startedAt: new Date(refTime - 12 * 3600000).toISOString(),
    sets: { [BENCH_PRESS.id]: sets100 }
  };
  const res51 = calculateTargetFatigueV2([s51], EXERCISES_MAP, { referenceTimeMs: refTime });
  const c51 = res51.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;
  assert.equal(c51.confidence, 'low');
  assert.equal(c51.unknownEffortExposureCount, 51);
  assert.ok(c51.reasons.some((r) => r.code === 'insufficient_effort_data'));
  assert.equal(c51.reasons.some((r) => r.code === 'partial_unknown_effort'), false);

  // Case 5: 100% unknown exposure older than 168h -> NO current confidence penalty
  const sOld: WorkoutSession = {
    id: 's-old-100-pct',
    userId: 'u1',
    startedAt: new Date(refTime - 200 * 3600000).toISOString(), // 200h ago
    sets: {
      [BENCH_PRESS.id]: [
        { setIndex: 0, setType: 'working', weightKg: 100, reps: 5, completed: true, isWarmup: false },
        { setIndex: 1, setType: 'working', weightKg: 100, reps: 5, completed: true, isWarmup: false }
      ]
    }
  };
  const resOldAndFresh = calculateTargetFatigueV2([sOld, s0], EXERCISES_MAP, { referenceTimeMs: refTime });
  const cOldAndFresh = resOldAndFresh.find((r) => r.target.kind === 'anatomical' && r.target.entity === 'pectoralis_major')!;
  assert.equal(cOldAndFresh.confidence, 'high');
  assert.equal(cOldAndFresh.unknownEffortExposureCount, 0);
  assert.equal(cOldAndFresh.reasons.some((r) => r.code === 'partial_unknown_effort'), false);
  assert.equal(cOldAndFresh.reasons.some((r) => r.code === 'insufficient_effort_data'), false);
});
