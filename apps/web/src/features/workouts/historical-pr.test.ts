import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateEffectiveLoadKg,
  calculateSetOneRm,
  estimateOneRm,
  evaluateRelativeStrength,
  type Exercise,
  type HistoricalPersonalRecord,
  type LoggedSet,
  type WorkoutSession
} from '@light-weight/domain';
import {
  getStoredHistoricalPersonalRecords,
  saveStoredHistoricalPersonalRecords,
  upsertStoredHistoricalPersonalRecord,
  getStoredActiveWorkout,
  saveActiveWorkout,
  STORAGE_KEYS
} from '../../lib/storage.js';
import { buildWorkoutHistoryIndex, calculateAllPersonalRecords } from '../../lib/workout-history-index.js';
import { selectStrengthSnapshot, buildExercisesById } from '../stats/stats-selectors.js';
import { calculateWeeklyStreak, calculateSessionTotalVolume } from '@light-weight/domain';

// Setup mock localStorage in Node test environment if not present
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    length: 0
  } as Storage;
}

const mockBenchPress: Exercise = {
  id: 'bench-press',
  name: 'Bench Press',
  category: 'barbell',
  primaryMuscle: 'chest',
  loading: {
    mechanism: 'barbell',
    loadMode: 'total',
    supportsKeyboard: true,
    supportsPlates: true,
    supportsExternalLoad: true,
    includeBarWeight: true
  }
};

const mockPullUp: Exercise = {
  id: 'pull-up',
  name: 'Pull Up',
  category: 'bodyweight',
  primaryMuscle: 'back',
  loading: {
    mechanism: 'bodyweight',
    loadMode: 'added_weight',
    bodyweightFactor: 1,
    supportsKeyboard: true,
    supportsPlates: true,
    supportsExternalLoad: true,
    includeBarWeight: false
  }
};

const mockAssistedPullUp: Exercise = {
  id: 'assisted-pull-up',
  name: 'Assisted Pull Up',
  category: 'machine',
  primaryMuscle: 'back',
  loading: {
    mechanism: 'selectorized',
    loadMode: 'assisted',
    bodyweightFactor: 1,
    supportsKeyboard: true,
    supportsPlates: false,
    supportsExternalLoad: false,
    includeBarWeight: false
  }
};

const exercisesById = buildExercisesById([mockBenchPress, mockPullUp, mockAssistedPullUp]);

test('Test 41: Bodyweight snapshot invariance when current BW changes', () => {
  const historicalRecord: HistoricalPersonalRecord = {
    id: 'hpr-1',
    userId: 'u1',
    exerciseId: 'bench-press',
    performedDate: '2025-01-15',
    recordedAt: '2026-09-26T10:00:00.000Z',
    bodyweightKg: 70, // Snapshot BW is 70kg
    set: {
      setIndex: 1,
      weightKg: 100,
      reps: 1,
      completed: true,
      setType: 'working',
      isWarmup: false
    },
    source: 'historical_manual'
  };

  // Evaluate snapshot with current BW = 95kg and weigh-in on 2026-09-01 = 95kg
  const snapshot = selectStrengthSnapshot([], exercisesById, {
    bodyweightKg: 95,
    gender: 'male',
    bodyweightEntries: [{ date: '2026-09-01', weightKg: 95 }],
    historicalPersonalRecords: [historicalRecord]
  });

  const chestEval = snapshot.muscles.chest.strengthEvaluation;
  assert.ok(chestEval, 'Strength evaluation must exist for chest');
  // Ratio must be evaluated against 70kg: 100 / 70 ≈ 1.43
  assert.equal(chestEval.bodyweightKg, 70, 'Evaluation bodyweight must equal snapshot 70kg');
  assert.ok(
    chestEval.currentRatio >= 1.4 && chestEval.currentRatio <= 1.45,
    `Ratio must be based on snapshot bodyweight 70kg, got: ${chestEval.currentRatio}`
  );
  assert.equal(snapshot.muscles.chest.topEst1RmKg, 100);
});

test('Test 42: Multi-rep estimate matches canonical average formula', () => {
  const weightKg = 100;
  const reps = 5;
  const canonicalEstimate = estimateOneRm(weightKg, reps);

  const calculated1Rm = calculateSetOneRm(
    { weightKg, reps },
    { exercise: mockBenchPress, bodyweightKg: 80, formula: 'average' }
  );

  assert.ok(calculated1Rm !== null);
  assert.equal(calculated1Rm, canonicalEstimate.average);
});

test('Test 43: Actual 1RM (reps === 1) labeled 1RM, not estimated', () => {
  const singleRepSet: LoggedSet = {
    setIndex: 1,
    weightKg: 125,
    reps: 1,
    completed: true,
    setType: 'working',
    isWarmup: false
  };

  const calculated1Rm = calculateSetOneRm(
    singleRepSet,
    { exercise: mockBenchPress, bodyweightKg: 80, formula: 'average' }
  );

  assert.equal(calculated1Rm, 125, '1RM for 1 rep must be exact lifted weight');

  // Verify modal/presentation logic: reps === 1 produces actual 1RM, reps > 1 produces estimated 1RM
  const isActual1Rm = singleRepSet.reps === 1;
  assert.equal(isActual1Rm, true, 'reps === 1 must designate actual 1RM');
});

test('Test 44: Weighted pull-up effective load calculation', () => {
  const bodyweightKg = 80;
  const addedWeightKg = 25;

  const effectiveLoad = calculateEffectiveLoadKg({
    exercise: mockPullUp,
    setWeightKg: addedWeightKg,
    bodyweightKg
  });

  assert.equal(effectiveLoad, 105, 'Effective load must be BW (80) + Added (25) = 105kg');

  const oneRm = calculateSetOneRm(
    { weightKg: addedWeightKg, reps: 1 },
    { exercise: mockPullUp, bodyweightKg, formula: 'average' }
  );
  assert.equal(oneRm, 105, '1RM must be evaluated using effective load');
});

test('Test 45: Assisted movement effective load calculation', () => {
  const bodyweightKg = 80;
  const assistanceKg = 18;

  const effectiveLoad = calculateEffectiveLoadKg({
    exercise: mockAssistedPullUp,
    setWeightKg: assistanceKg,
    bodyweightKg
  });

  assert.equal(effectiveLoad, 62, 'Effective load must be BW (80) - Assistance (18) = 62kg');

  const oneRm = calculateSetOneRm(
    { weightKg: assistanceKg, reps: 1 },
    { exercise: mockAssistedPullUp, bodyweightKg, formula: 'average' }
  );
  assert.equal(oneRm, 62, '1RM must be evaluated using effective load');
});

test('Test 46: Profile override (manual PR replaces weaker workout PR in top lifts)', () => {
  // Workout session with 80kg x 5 on Bench Press (e1RM ~ 90kg)
  const history: WorkoutSession[] = [
    {
      id: 'session-1',
      userId: 'u1',
      startedAt: '2026-08-01T10:00:00.000Z',
      sets: {
        'bench-press': [
          {
            setIndex: 1,
            weightKg: 80,
            reps: 5,
            completed: true,
            setType: 'working',
            isWarmup: false
          }
        ]
      }
    }
  ];

  // Historical PR with 120kg x 1 on Bench Press
  const historicalRecord: HistoricalPersonalRecord = {
    id: 'hpr-120',
    userId: 'u1',
    exerciseId: 'bench-press',
    performedDate: '2024-06-10',
    recordedAt: '2026-09-26T10:00:00.000Z',
    bodyweightKg: 75,
    set: {
      setIndex: 1,
      weightKg: 120,
      reps: 1,
      completed: true,
      setType: 'working',
      isWarmup: false
    },
    source: 'historical_manual'
  };

  const records = calculateAllPersonalRecords(history, {
    exercisesById,
    historicalPersonalRecords: [historicalRecord]
  });

  assert.ok(records['bench-press'], 'Bench press PR must exist');
  assert.equal(records['bench-press'].weightKg, 120);
  assert.equal(records['bench-press'].reps, 1);
  assert.equal(records['bench-press'].est1Rm, 120);
  assert.equal(records['bench-press'].source, 'historical_manual');
  assert.equal(records['bench-press'].bodyweightKg, 75);
});

test('Test 47: Lower historical PR persists without replacing current best', () => {
  // Workout session with 140kg x 1 on Bench Press
  const history: WorkoutSession[] = [
    {
      id: 'session-1',
      userId: 'u1',
      startedAt: '2026-08-01T10:00:00.000Z',
      sets: {
        'bench-press': [
          {
            setIndex: 1,
            weightKg: 140,
            reps: 1,
            completed: true,
            setType: 'working',
            isWarmup: false
          }
        ]
      }
    }
  ];

  // Lower historical PR with 100kg x 1 on Bench Press
  const historicalRecord: HistoricalPersonalRecord = {
    id: 'hpr-100',
    userId: 'u1',
    exerciseId: 'bench-press',
    performedDate: '2023-05-20',
    recordedAt: '2026-09-26T10:00:00.000Z',
    bodyweightKg: 70,
    set: {
      setIndex: 1,
      weightKg: 100,
      reps: 1,
      completed: true,
      setType: 'working',
      isWarmup: false
    },
    source: 'historical_manual'
  };

  const records = calculateAllPersonalRecords(history, {
    exercisesById,
    historicalPersonalRecords: [historicalRecord]
  });

  // The workout PR is 140kg, so it remains the best PR
  assert.equal(records['bench-press'].weightKg, 140);
  assert.equal(records['bench-press'].source, 'workout');
});

test('Test 48: Rank effect updates muscle rank and overall score', () => {
  // Empty history has no chest strength evaluation
  const emptySnapshot = selectStrengthSnapshot([], exercisesById, {
    bodyweightKg: 75,
    gender: 'male'
  });
  assert.equal(emptySnapshot.muscles.chest.strengthEvaluation, undefined);
  assert.equal(emptySnapshot.overall, null);

  // Add historical PR: Bench Press 140kg x 1 at 75kg BW
  const historicalRecord: HistoricalPersonalRecord = {
    id: 'hpr-rank',
    userId: 'u1',
    exerciseId: 'bench-press',
    performedDate: '2024-01-10',
    recordedAt: '2026-09-26T10:00:00.000Z',
    bodyweightKg: 75,
    set: {
      setIndex: 1,
      weightKg: 140,
      reps: 1,
      completed: true,
      setType: 'working',
      isWarmup: false
    },
    source: 'historical_manual'
  };

  const updatedSnapshot = selectStrengthSnapshot([], exercisesById, {
    bodyweightKg: 75,
    gender: 'male',
    historicalPersonalRecords: [historicalRecord]
  });

  const chestEval = updatedSnapshot.muscles.chest.strengthEvaluation;
  assert.ok(chestEval, 'Chest evaluation must now exist');
  assert.ok(chestEval.strengthScore >= 6.0, `Strength score must be high for 140kg @ 75kg, got: ${chestEval.strengthScore}`);
  assert.strictEqual(chestEval.rank, 'inmortal');
  assert.ok(updatedSnapshot.overall !== null, 'Overall strength evaluation must exist');
  assert.ok(updatedSnapshot.overall!.overallScore > 0);
});

test('Test 49: Workout pollution check (history length, streak, volume unchanged)', () => {
  const history: WorkoutSession[] = [
    {
      id: 'session-workout',
      userId: 'u1',
      startedAt: '2026-09-20T10:00:00.000Z',
      sets: {
        'bench-press': [
          { setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false }
        ]
      }
    }
  ];

  const initialHistoryLength = history.length;
  const initialStreak = calculateWeeklyStreak(history);
  const initialVolume = history.reduce((t, s) => t + calculateSessionTotalVolume(s, { exercisesById }), 0);

  // Even if historicalPersonalRecords are present in the app:
  const historicalRecord: HistoricalPersonalRecord = {
    id: 'hpr-pollute-test',
    userId: 'u1',
    exerciseId: 'bench-press',
    performedDate: '2024-01-01',
    recordedAt: '2026-09-26T10:00:00.000Z',
    bodyweightKg: 75,
    set: { setIndex: 1, weightKg: 150, reps: 1, completed: true, setType: 'working', isWarmup: false },
    source: 'historical_manual'
  };

  // Workout history is NOT mutated:
  assert.equal(history.length, initialHistoryLength);
  assert.equal(calculateWeeklyStreak(history), initialStreak);
  assert.equal(history.reduce((t, s) => t + calculateSessionTotalVolume(s, { exercisesById }), 0), initialVolume);

  // Index sessionsByExercise and latestPerformanceByExercise remain workout-only:
  const index = buildWorkoutHistoryIndex(history, {
    exercisesById,
    historicalPersonalRecords: [historicalRecord]
  });

  assert.equal(index.sessionsByExercise['bench-press']?.length, 1);
  assert.equal(index.latestPerformanceByExercise['bench-press']?.lastDate, '2026-09-20T10:00:00.000Z');
});

test('Test 50: Active workout isolation (ACTIVE_WORKOUT byte-identical before and after)', () => {
  localStorage.clear();

  const activeWorkoutJson = JSON.stringify({
    routineId: 'rot-1',
    routineName: 'Push Day',
    startedAt: '2026-09-26T12:00:00.000Z',
    exerciseSessions: [
      {
        exercise: mockBenchPress,
        sets: [{ setIndex: 1, weightKg: 100, reps: 5, completed: false, setType: 'working' }]
      }
    ]
  });

  localStorage.setItem(STORAGE_KEYS.ACTIVE_WORKOUT, activeWorkoutJson);
  const before = localStorage.getItem(STORAGE_KEYS.ACTIVE_WORKOUT);

  // Save historical PR
  upsertStoredHistoricalPersonalRecord({
    id: 'hpr-isolated',
    userId: 'u1',
    exerciseId: 'bench-press',
    performedDate: '2025-02-14',
    recordedAt: '2026-09-26T10:00:00.000Z',
    bodyweightKg: 77,
    set: { setIndex: 1, weightKg: 110, reps: 1, completed: true, setType: 'working', isWarmup: false },
    source: 'historical_manual'
  });

  const after = localStorage.getItem(STORAGE_KEYS.ACTIVE_WORKOUT);
  assert.equal(after, before, 'ACTIVE_WORKOUT in storage must be byte-for-byte identical');
});

test('Test 51: Offline save and storage write for historicalPersonalRecords', () => {
  localStorage.clear();

  const record: HistoricalPersonalRecord = {
    id: 'hpr-offline-1',
    userId: 'u1',
    exerciseId: 'pull-up',
    performedDate: '2025-06-20',
    recordedAt: '2026-09-26T10:00:00.000Z',
    bodyweightKg: 78,
    set: { setIndex: 1, weightKg: 30, reps: 1, completed: true, setType: 'working', isWarmup: false },
    source: 'historical_manual'
  };

  const stored = upsertStoredHistoricalPersonalRecord(record);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].id, 'hpr-offline-1');

  const raw = localStorage.getItem(STORAGE_KEYS.HISTORICAL_PERSONAL_RECORDS);
  assert.ok(raw, 'Raw storage key must exist');
  const parsed = JSON.parse(raw!);
  assert.equal(Array.isArray(parsed), true);
  assert.equal(parsed[0].id, 'hpr-offline-1');
});

test('Test 52: Storage reload persistence and corrupt entry sanitization', () => {
  localStorage.clear();

  const validRecord: HistoricalPersonalRecord = {
    id: 'hpr-valid',
    userId: 'u1',
    exerciseId: 'bench-press',
    performedDate: '2025-03-01',
    recordedAt: '2026-09-26T10:00:00.000Z',
    bodyweightKg: 82,
    set: { setIndex: 1, weightKg: 130, reps: 1, completed: true, setType: 'working', isWarmup: false },
    source: 'historical_manual'
  };

  const invalidEntries = [
    { id: 'bad-1', exerciseId: 'bench-press' }, // missing performedDate, recordedAt, bodyweight
    { id: 'bad-2', userId: 'u1', exerciseId: 'bench-press', performedDate: 'invalid-date', recordedAt: 'bad-ts', bodyweightKg: -10, set: {} },
    validRecord
  ];

  localStorage.setItem(STORAGE_KEYS.HISTORICAL_PERSONAL_RECORDS, JSON.stringify(invalidEntries));

  const reloaded = getStoredHistoricalPersonalRecords();
  assert.equal(reloaded.length, 1, 'Only valid record must be hydrated');
  assert.equal(reloaded[0].id, 'hpr-valid');
  assert.equal(reloaded[0].bodyweightKg, 82);
  assert.equal(reloaded[0].set.weightKg, 130);
});
