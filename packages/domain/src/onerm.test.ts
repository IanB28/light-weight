import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEpley,
  calculateBrzycki,
  calculateLombardi,
  estimateOneRm,
  estimate1RM,
  bestSetOf,
  is1RMRecord,
  REP_CAP
} from './onerm.js';
import {
  calculateVolume,
  checkProgressionTarget,
  calculateDeload,
  defaultIncrement,
  evaluateNextWeight
} from './progression.js';
import { rirToRpe, rpeToRir } from './effort.js';
import {
  calculateSessionTotalVolume,
  getPreviousPerformance,
  getExerciseProgressSeries,
  getNeglectedMuscles,
  calculateMuscleFatigue,
  calculateWeeklyStreak,
  weekKey,
  getWorkoutsThisWeek
} from './history.js';
import { evaluateRelativeStrength } from './strengthStandards.js';
import { calculateAge } from './profile.js';
import {
  calculateLoadedBarWeight,
  decomposeLoadedBarWeight,
  kilogramsToPounds,
  normalizeWeightKg,
  poundsToKilograms
} from './weight.js';
import type { LoggedSet, WorkoutSession } from './types.js';

test('1RM estimation with openGym REP_CAP = 12', () => {
  // 1 rep of 100kg is exactly 100kg
  assert.equal(estimate1RM(100, 1), 100);

  // 10 reps of 100kg
  assert.equal(estimate1RM(100, 10, 'epley'), 133.3);
  assert.equal(estimate1RM(100, 10, 'brzycki'), 133.3);
  assert.equal(calculateLombardi(100, 10), 125.9);

  // Above REP_CAP (12) must refuse to guess and return null
  assert.equal(estimate1RM(100, 13), null);
  assert.equal(estimate1RM(100, 20), null);
  assert.equal(calculateEpley(100, 15), 0);

  // Non-positive values return null
  assert.equal(estimate1RM(-10, 5), null);
  assert.equal(estimate1RM(100, 0), null);
});

test('bestSetOf and is1RMRecord', () => {
  const sets: LoggedSet[] = [
    { setIndex: 1, weightKg: 80, reps: 10, completed: true, isWarmup: false }, // 80 * (1 + 10/30) = 106.7
    { setIndex: 2, weightKg: 90, reps: 8, completed: true, isWarmup: false },  // 90 * (1 + 8/30) = 114
    { setIndex: 3, weightKg: 100, reps: 4, completed: false, isWarmup: false } // not completed
  ];

  const best = bestSetOf(sets, 'epley');
  assert.ok(best);
  assert.equal(best.w, 90);
  assert.equal(best.r, 8);
  assert.equal(best.est, 114);

  // Check new PR detection
  const newSetPr: LoggedSet = { setIndex: 4, weightKg: 100, reps: 6, completed: true, isWarmup: false }; // 100 * (1 + 6/30) = 120
  const prResult = is1RMRecord(114, newSetPr, 'epley');
  assert.ok(prResult);
  assert.equal(prResult.isPr, true);
  assert.equal(prResult.newEst, 120);
  assert.equal(prResult.diff, 6);

  // Non-PR
  const nonPrSet: LoggedSet = { setIndex: 5, weightKg: 80, reps: 5, completed: true, isWarmup: false };
  const nonPrResult = is1RMRecord(114, nonPrSet, 'epley');
  assert.ok(nonPrResult);
  assert.equal(nonPrResult.isPr, false);
});

test('Effort scale conversions', () => {
  assert.equal(rirToRpe(0), 10);
  assert.equal(rirToRpe(2), 8);
  assert.equal(rpeToRir(8), 2);
  assert.equal(rpeToRir(10), 0);
});

test('Progression deload and muscle increments', () => {
  // Lower body vs Upper body increments
  assert.equal(defaultIncrement('quadriceps'), 5.0);
  assert.equal(defaultIncrement('chest'), 2.5);

  // Deload calculation (10% drop snapped to 2.5)
  // 100kg * 0.9 = 90kg
  assert.equal(calculateDeload(100, 2.5), 90);
  // 82.5kg * 0.9 = 74.25 -> snapped to 75
  assert.equal(calculateDeload(82.5, 2.5), 75);

  // Deload after 3 stalls
  const failedSets: LoggedSet[] = [
    { setIndex: 1, weightKg: 100, reps: 6, completed: true, isWarmup: false },
    { setIndex: 2, weightKg: 100, reps: 5, completed: true, isWarmup: false }
  ];
  const evalDeload = evaluateNextWeight(100, failedSets, 3, 8, 'chest', 2, 'double');
  assert.equal(evalDeload.isDeload, true);
  assert.equal(evalDeload.nextWeightKg, 90);
});

test('History volume and previous performance lookup', () => {
  const session1: WorkoutSession = {
    id: 's1',
    userId: 'u1',
    startedAt: '2026-09-01T10:00:00Z',
    sets: {
      'ex-bench': [
        { setIndex: 1, weightKg: 80, reps: 8, completed: true, isWarmup: false },
        { setIndex: 2, weightKg: 80, reps: 8, completed: true, isWarmup: false }
      ]
    }
  };

  const session2: WorkoutSession = {
    id: 's2',
    userId: 'u1',
    startedAt: '2026-09-05T10:00:00Z',
    sets: {
      'ex-bench': [
        { setIndex: 1, weightKg: 82.5, reps: 8, completed: true, isWarmup: false }
      ]
    }
  };

  assert.equal(calculateSessionTotalVolume(session1), 1280);

  const prev = getPreviousPerformance([session1, session2], 'ex-bench');
  assert.ok(prev);
  assert.equal(prev.summary, '82.5 kg × 8');

  // Exercise Progress Series
  const series = getExerciseProgressSeries([session1, session2], 'ex-bench');
  assert.equal(series.length, 2);
  assert.equal(series[0].topWeightKg, 80);
  assert.equal(series[1].topWeightKg, 82.5);

  // Neglected Muscles Detection
  const exercisesById = {
    'ex-bench': { id: 'ex-bench', name: 'Bench', category: 'barbell' as const, primaryMuscle: 'chest' as const }
  };
  const analysis = getNeglectedMuscles([session1, session2], exercisesById, 0);
  assert.equal(analysis.worked.some(w => w.muscle === 'chest'), true);
  assert.equal(analysis.neglected.includes('hamstrings'), true);
  assert.equal(analysis.neglected.includes('biceps'), true);
});

test('calculateMuscleFatigue physiological model with RIR and time decay', () => {
  const nowMs = 1700000000000;
  // Session 1: 12h ago, 4 hard sets at RIR 0 (to failure)
  const sessionRecentHard: WorkoutSession = {
    id: 's-hard',
    userId: 'u1',
    startedAt: new Date(nowMs - 12 * 3600000).toISOString(),
    sets: {
      'ex-bench': [
        { setIndex: 1, weightKg: 100, reps: 6, rir: 0, completed: true, isWarmup: false },
        { setIndex: 2, weightKg: 100, reps: 6, rir: 0, completed: true, isWarmup: false },
        { setIndex: 3, weightKg: 100, reps: 5, rir: 0, completed: true, isWarmup: false },
        { setIndex: 4, weightKg: 100, reps: 5, rir: 0, completed: true, isWarmup: false }
      ]
    }
  };

  const exercisesById = {
    'ex-bench': {
      id: 'ex-bench',
      name: 'Bench Press',
      category: 'barbell' as const,
      primaryMuscle: 'chest' as const,
      secondaryMuscles: ['triceps' as const, 'shoulders' as const]
    }
  };

  const fatigueRecent = calculateMuscleFatigue([sessionRecentHard], exercisesById, nowMs);
  // Chest should be fatigued (> 4.5)
  assert.equal(fatigueRecent.chest.status, 'fatigued');
  assert.ok(fatigueRecent.chest.fatigueScore >= 4.5);
  assert.equal(fatigueRecent.chest.hoursSinceLastTrained, 12);
  assert.equal(fatigueRecent.chest.recentHardSetsCount, 4);

  // Now simulate 60 hours later with same workout
  const fatigueLater = calculateMuscleFatigue([sessionRecentHard], exercisesById, nowMs + 48 * 3600000);
  // Chest should now be recovered/ready
  assert.equal(fatigueLater.chest.status, 'ready');
  assert.ok(fatigueLater.chest.fatigueScore < 1.8);
});

test('evaluateRelativeStrength StrengthLevel gamification and gender standards', () => {
  // Male with 80kg BW benching 100kg -> ratio 1.25 -> Novice/Intermediate boundary (Intermediate: 1.25)
  const maleEval = evaluateRelativeStrength('chest', 100, 80, 'male');
  assert.equal(maleEval.tier, 'intermediate');
  assert.equal(maleEval.currentRatio, 1.25);
  assert.equal(maleEval.nextTier, 'advanced');
  assert.ok(maleEval.kgToNextTier !== null && maleEval.kgToNextTier > 0);

  // Female with 60kg BW benching 45kg -> ratio 0.75 -> Intermediate (Female intermediate: 0.75)
  const femaleEval = evaluateRelativeStrength('chest', 45, 60, 'female');
  assert.equal(femaleEval.tier, 'intermediate');
  assert.equal(femaleEval.currentRatio, 0.75);
  assert.equal(femaleEval.nextTier, 'advanced');

  // Elite lifter: Male 80kg benching 170kg -> ratio 2.125 >= 2.05 (Elite)
  const eliteEval = evaluateRelativeStrength('chest', 170, 80, 'male');
  assert.equal(eliteEval.tier, 'elite');
  assert.equal(eliteEval.nextTier, null);
  assert.equal(eliteEval.emoji, '💎');
});

test('calculateWeeklyStreak and weekKey calculation', () => {
  const now = new Date();
  const week1 = new Date(now.getTime() - 86400000 * 2).toISOString(); // this week
  const week2 = new Date(now.getTime() - 86400000 * 9).toISOString(); // last week
  const week3 = new Date(now.getTime() - 86400000 * 16).toISOString(); // 2 weeks ago

  const mockHistory: WorkoutSession[] = [
    { id: '1', userId: 'u', routineName: 'R1', startedAt: week1, sets: {} },
    { id: '2', userId: 'u', routineName: 'R2', startedAt: week2, sets: {} },
    { id: '3', userId: 'u', routineName: 'R3', startedAt: week3, sets: {} }
  ];

  const streak = calculateWeeklyStreak(mockHistory);
  assert.equal(streak, 3);

  // Empty history returns 0
  assert.equal(calculateWeeklyStreak([]), 0);

  // Week key format check
  assert.match(weekKey(week1), /^\d{4}-\d+$/);

  // Workouts this week
  const thisWeekSessions = getWorkoutsThisWeek(mockHistory);
  assert.equal(thisWeekSessions.length, 1);
});

test('calculateAge derives age from birth date and rejects invalid dates', () => {
  assert.equal(calculateAge('2000-09-12', new Date(2026, 8, 12)), 26);
  assert.equal(calculateAge('2000-09-13', new Date(2026, 8, 12)), 25);
  assert.equal(calculateAge('2004-02-29', new Date(2026, 1, 28)), 21);
  assert.equal(calculateAge('not-a-date', new Date(2026, 8, 12)), null);
  assert.equal(calculateAge('2027-01-01', new Date(2026, 8, 12)), null);
});

test('loaded bar weight and unit conversions stay finite and symmetric', () => {
  assert.equal(calculateLoadedBarWeight(20, [20, 10, 2.5]), 85);
  assert.equal(calculateLoadedBarWeight(0, [20, 10, 2.5], 1), 32.5);
  assert.equal(calculateLoadedBarWeight(-20, [10, Number.NaN]), 20);
  assert.ok(Math.abs(kilogramsToPounds(100) - 220.462) < 0.001);
  assert.ok(Math.abs(poundsToKilograms(220.462) - 100) < 0.001);
  assert.equal(normalizeWeightKg(Number.NaN), 0);
  assert.equal(normalizeWeightKg(-5), 0);
});

test('loaded bar decomposition restores exact plates and rejects inexact loads', () => {
  const exact = decomposeLoadedBarWeight(85, 20, [25, 20, 15, 10, 5, 2.5, 1.25]);
  assert.equal(exact.isExact, true);
  const restoredPlates = Object.entries(exact.counts).flatMap(([plate, count]) => Array.from({ length: count }, () => Number(plate)));
  assert.equal(calculateLoadedBarWeight(20, restoredPlates), 85);

  const inexact = decomposeLoadedBarWeight(83, 20, [20, 10, 5, 2.5]);
  assert.equal(inexact.isExact, false);
  assert.deepEqual(inexact.counts, {});

  const nonGreedy = decomposeLoadedBarWeight(32, 20, [5, 3]);
  assert.equal(nonGreedy.isExact, true);
  assert.deepEqual(nonGreedy.counts, { '3': 2 });

  const singleLoad = decomposeLoadedBarWeight(32.5, 0, [20, 10, 2.5], 0.02, 1);
  assert.equal(singleLoad.isExact, true);
  assert.deepEqual(singleLoad.counts, { '20': 1, '10': 1, '2.5': 1 });
});
