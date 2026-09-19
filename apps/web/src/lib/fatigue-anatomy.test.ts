import test from 'node:test';
import assert from 'node:assert/strict';
import type { Exercise, WorkoutSession } from '@light-weight/domain';
import {
  aggregateFatigueByBodyPath,
  computeSemanticFatigueForHistory,
  getSortedBodyPathsByFatigue
} from './fatigue-anatomy.js';
import { aggregateBalanceByBodyPath } from './balance-anatomy.js';
import { extractMuscleExposures } from '@light-weight/domain';

// Curated exercises
const BARBELL_ROW: Exercise = {
  id: 'ex-0027', // barbell_row in EXERCISE_ID_TO_SEMANTICS_KEY
  name: 'Barbell Bent Over Row',
  category: 'barbell',
  primaryMuscle: 'back',
  secondaryMuscles: ['biceps']
};

const BACK_SQUAT: Exercise = {
  id: 'ex-0043',
  name: 'Barbell Full Squat',
  category: 'barbell',
  primaryMuscle: 'quadriceps',
  secondaryMuscles: ['glutes', 'hamstrings']
};

const EXERCISES_MAP: Record<string, Exercise> = {
  [BARBELL_ROW.id]: BARBELL_ROW,
  [BACK_SQUAT.id]: BACK_SQUAT
};

test('1. Fatigue vs Balance: Upper-back aggregates distinct semantic target FEU while Balance deduplicates physical sets', () => {
  // Barbell Row set:
  // Stimulates latissimus_dorsi (prime), rhomboids (co_prime), teres_major (secondary), etc.
  // All three map to 'upper-back' SVG path.
  const session: WorkoutSession = {
    id: 'row-sess-1',
    userId: 'u1',
    startedAt: '2026-09-18T10:00:00Z',
    sets: {
      [BARBELL_ROW.id]: [
        { setIndex: 0, setType: 'working' as const, weightKg: 80, reps: 8, completed: true, isWarmup: false, rir: 0 } // RIR 0 -> effort 1.00
      ]
    }
  };

  const exposures = extractMuscleExposures([session], EXERCISES_MAP);

  // 1. In Balance: physical set deduplication
  const balancePaths = aggregateBalanceByBodyPath(exposures);
  const upperBackBalance = balancePaths['upper-back'];
  assert.ok(upperBackBalance);
  assert.equal(upperBackBalance.exposureCount, 1, 'Balance deduplicates physical sets to 1');
  assert.ok(upperBackBalance.contributors.length >= 2, 'Balance preserves multiple contributors');

  // 2. In Fatigue: semantic target FEU aggregation
  const fatigueResult = computeSemanticFatigueForHistory([session], EXERCISES_MAP, Date.parse('2026-09-18T10:00:00Z'));
  const upperBackFatigue = fatigueResult.pathFatigue['upper-back'];
  assert.ok(upperBackFatigue);

  // In Barbell Row:
  // latissimus_dorsi: prime (1.00) -> 1.00 FEU
  // rhomboids: co_prime (0.70) -> 0.70 FEU
  // teres_major: secondary (0.40) -> 0.40 FEU
  // Expected upper-back residual FEU = 1.00 + 0.70 + 0.40 = 2.10 FEU
  assert.ok(upperBackFatigue.residualFeu >= 2.10, 'Upper-back residual FEU must sum distinct anatomical contributors');
  assert.equal(upperBackFatigue.state, 'recovering'); // 2.10 is between 1.00 and 3.00
  assert.ok(upperBackFatigue.contributors.length >= 3, 'Must preserve all distinct contributors');
});

test('2. Detailed subregions exist and display independently in Fatigue mode', () => {
  // Back Squat stimulates:
  // - quadriceps -> 'quadriceps' (prime: 1.00)
  // - gluteus_maximus -> 'gluteal' (co_prime: 0.70)
  // - adductor_magnus -> 'adductors' (secondary: 0.40)
  // - erector_spinae -> 'lower-back' (resisted_isometric: 0.20)
  const session: WorkoutSession = {
    id: 'squat-subregions',
    userId: 'u1',
    startedAt: '2026-09-18T10:00:00Z',
    sets: {
      [BACK_SQUAT.id]: [
        { setIndex: 0, setType: 'working' as const, weightKg: 140, reps: 5, completed: true, isWarmup: false, rir: 0 },
        { setIndex: 1, setType: 'working' as const, weightKg: 140, reps: 5, completed: true, isWarmup: false, rir: 0 },
        { setIndex: 2, setType: 'working' as const, weightKg: 140, reps: 5, completed: true, isWarmup: false, rir: 0 },
        { setIndex: 3, setType: 'working' as const, weightKg: 140, reps: 5, completed: true, isWarmup: false, rir: 0 }
      ]
    }
  };

  const fatigueResult = computeSemanticFatigueForHistory([session], EXERCISES_MAP, Date.parse('2026-09-18T10:00:00Z'));
  const paths = fatigueResult.pathFatigue;

  // Verify adductors exists independently from quadriceps
  assert.ok(paths['adductors'], 'Adductors path must exist independently');
  assert.ok(paths['quadriceps'], 'Quadriceps path must exist independently');
  assert.notEqual(paths['adductors']?.residualFeu, paths['quadriceps']?.residualFeu);

  // 4 sets @ RIR 0:
  // Quad: 4 * 1.00 = 4.00 FEU (fatigued)
  // Adductor magnus: 4 * 0.40 = 1.60 FEU (recovering)
  assert.equal(paths['quadriceps']?.residualFeu, 4.00);
  assert.equal(paths['quadriceps']?.state, 'fatigued');
  assert.equal(paths['adductors']?.residualFeu, 1.60);
  assert.equal(paths['adductors']?.state, 'recovering');

  // Verify lower-back exists independently
  assert.ok(paths['lower-back'], 'Lower-back path must exist independently');
  // Erector spinae: 4 * 0.20 = 0.80 FEU (ready)
  assert.equal(paths['lower-back']?.residualFeu, 0.80);
  assert.equal(paths['lower-back']?.state, 'ready');
});

test('3. getSortedBodyPathsByFatigue sorts paths descending by residual FEU', () => {
  const session: WorkoutSession = {
    id: 'squat-sort',
    userId: 'u1',
    startedAt: '2026-09-18T10:00:00Z',
    sets: {
      [BACK_SQUAT.id]: [
        { setIndex: 0, setType: 'working' as const, weightKg: 140, reps: 5, completed: true, isWarmup: false, rir: 0 }
      ]
    }
  };

  const fatigueResult = computeSemanticFatigueForHistory([session], EXERCISES_MAP, Date.parse('2026-09-18T10:00:00Z'));
  const sorted = getSortedBodyPathsByFatigue(fatigueResult.pathFatigue);

  assert.ok(sorted.length > 0);
  // Quadriceps (1.00 FEU) > Gluteal (0.70 FEU) > Adductors (0.40 FEU)
  const quadIdx = sorted.indexOf('quadriceps');
  const gluteIdx = sorted.indexOf('gluteal');
  const adductorIdx = sorted.indexOf('adductors');

  assert.ok(quadIdx < gluteIdx, 'Quadriceps must appear before gluteal in fatigue order');
  assert.ok(gluteIdx < adductorIdx, 'Gluteal must appear before adductors in fatigue order');
});

test('4. selectMuscleAnalytics provides semanticFatigue alongside legacy outputs', async () => {
  const { selectMuscleAnalytics } = await import('../features/stats/stats-selectors.js');

  const session: WorkoutSession = {
    id: 'stats-fatigue-sess',
    userId: 'u1',
    startedAt: '2026-09-18T10:00:00Z',
    sets: {
      [BACK_SQUAT.id]: [
        { setIndex: 0, setType: 'working', weightKg: 140, reps: 5, completed: true, isWarmup: false, rir: 0 }
      ]
    }
  };

  const analytics = selectMuscleAnalytics([session], EXERCISES_MAP, 7, 80, 'male');
  assert.ok(analytics.semanticFatigue, 'semanticFatigue must be returned by selectMuscleAnalytics');
  assert.ok(analytics.semanticFatigue.pathFatigue['quadriceps']);
  assert.equal(analytics.semanticFatigue.pathFatigue['quadriceps']?.residualFeu, 1.00);
  assert.equal(analytics.semanticFatigue.pathFatigue['quadriceps']?.state, 'recovering');
});

test('5. Unknown-heavy path preserves unknownEffortCount and degrades confidence without changing state fresh', () => {
  const session: WorkoutSession = {
    id: 'unknown-path-sess',
    userId: 'u1',
    startedAt: '2026-09-18T10:00:00Z',
    sets: {
      [BACK_SQUAT.id]: [
        { setIndex: 0, setType: 'working', weightKg: 140, reps: 5, completed: true, isWarmup: false } // missing rir/rpe
      ]
    }
  };

  const fatigueResult = computeSemanticFatigueForHistory([session], EXERCISES_MAP, Date.parse('2026-09-18T10:00:00Z'));
  const quadPath = fatigueResult.pathFatigue['quadriceps'];
  assert.ok(quadPath);
  assert.equal(quadPath.residualFeu, 0.00);
  assert.equal(quadPath.state, 'fresh');
  assert.equal(quadPath.unknownEffortCount, 1);
  assert.equal(quadPath.confidence, 'low');
  assert.ok(quadPath.reasons.some((r) => r.code === 'insufficient_effort_data'));
});
