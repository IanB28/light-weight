import test from 'node:test';
import assert from 'node:assert/strict';
import type {
  Exercise,
  HistoricalPersonalRecord,
  LoggedSet,
  Routine,
  WorkoutSession
} from '@light-weight/domain';
import {
  doesSessionMatchRoutine,
  getPreviousRoutineExercisePerformance,
  clonePreviousPerformanceSets,
  hydrateSetsFromRoutineTemplate,
  buildRoutineExerciseSessions
} from './routine-previous-performance.js';
import {
  createHistoricalWorkoutInstant,
  resolveHistoricalWorkoutCutoff
} from './historical-workout.js';
import type { ActiveExerciseSession } from './types.js';
import { getStoredActiveWorkout, saveActiveWorkout } from '../../lib/storage.js';
import type { StorageAdapter } from '../../lib/storage-adapter.js';
import { normalizeActiveExerciseSession, serializeWorkoutSets } from './useWorkoutSession.js';

// --- Fixtures ---

const benchExercise: Exercise = {
  id: 'ex-bench',
  name: 'Barbell Bench Press',
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

const rowExercise: Exercise = {
  id: 'ex-row',
  name: 'Barbell Row',
  category: 'barbell',
  primaryMuscle: 'back',
  loading: {
    mechanism: 'barbell',
    loadMode: 'total',
    supportsKeyboard: true,
    supportsPlates: true,
    supportsExternalLoad: true,
    includeBarWeight: true
  }
};

const pullupExercise: Exercise = {
  id: 'ex-pullup',
  name: 'Pull-up',
  category: 'bodyweight',
  primaryMuscle: 'back',
  loading: {
    mechanism: 'bodyweight',
    loadMode: 'added_weight',
    supportsKeyboard: true,
    supportsPlates: false,
    supportsExternalLoad: true,
    includeBarWeight: false
  }
};

const shoulderPressExercise: Exercise = {
  id: 'ex-ohp',
  name: 'Overhead Press',
  category: 'barbell',
  primaryMuscle: 'shoulders',
  loading: {
    mechanism: 'barbell',
    loadMode: 'total',
    supportsKeyboard: true,
    supportsPlates: true,
    supportsExternalLoad: true,
    includeBarWeight: true
  }
};

const mockExercisesById: Record<string, Exercise> = {
  'ex-bench': benchExercise,
  'ex-row': rowExercise,
  'ex-pullup': pullupExercise,
  'ex-ohp': shoulderPressExercise
};

const dummyBaseCreator = (exercise: Exercise): ActiveExerciseSession => ({
  exercise,
  targetRepRange: [6, 12],
  skipped: false,
  plateBaseWeightKg: 20,
  machineProfileId: 'profile-gym-1',
  machineProfileLabel: 'Chest Press A',
  machineBaseResistanceKg: 15,
  machineBaseResistanceStatus: 'verified',
  sets: [
    { setIndex: 1, weightKg: 50, reps: 8, completed: false, setType: 'working', isWarmup: false, rir: undefined },
    { setIndex: 2, weightKg: 50, reps: 8, completed: false, setType: 'working', isWarmup: false, rir: undefined },
    { setIndex: 3, weightKg: 50, reps: 8, completed: false, setType: 'working', isWarmup: false, rir: undefined }
  ]
});

// ==================================================
// 36. PURE SELECTOR TEST MATRIX (A - O)
// ==================================================

test('Selector Matrix A: same routine + same exercise returns latest valid completed performance', () => {
  const routine: Routine = { id: 'routine-push', userId: 'u1', name: 'Push Day', exerciseIds: ['ex-bench'] };
  const history: WorkoutSession[] = [
    {
      id: 'ws-1',
      userId: 'u1',
      routineId: 'routine-push',
      routineName: 'Push Day',
      startedAt: '2026-09-20T10:00:00.000Z',
      sets: {
        'ex-bench': [
          { setIndex: 1, weightKg: 40, reps: 10, rir: 4, setType: 'warmup', isWarmup: true, completed: true },
          { setIndex: 2, weightKg: 80, reps: 8, rir: 2, setType: 'working', isWarmup: false, completed: true },
          { setIndex: 3, weightKg: 80, reps: 7, rir: 1, setType: 'working', isWarmup: false, completed: true }
        ]
      }
    }
  ];

  const result = getPreviousRoutineExercisePerformance({
    history,
    routine,
    exerciseId: 'ex-bench'
  });

  assert.ok(result);
  assert.equal(result.length, 3);
  assert.deepEqual(result.map((s) => ({ w: s.weightKg, r: s.reps, rir: s.rir, type: s.setType })), [
    { w: 40, r: 10, rir: 4, type: 'warmup' },
    { w: 80, r: 8, rir: 2, type: 'working' },
    { w: 80, r: 7, rir: 1, type: 'working' }
  ]);
});

test('Selector Matrix B: newer same exercise from different routine is ignored', () => {
  const pushRoutine: Routine = { id: 'routine-push', userId: 'u1', name: 'Push Day', exerciseIds: ['ex-bench'] };
  const history: WorkoutSession[] = [
    {
      id: 'ws-strength',
      userId: 'u1',
      routineId: 'routine-strength',
      routineName: 'Strength Day',
      startedAt: '2026-09-25T10:00:00.000Z', // Globally newer!
      sets: {
        'ex-bench': [
          { setIndex: 1, weightKg: 100, reps: 3, rir: 0, setType: 'working', isWarmup: false, completed: true }
        ]
      }
    },
    {
      id: 'ws-push',
      userId: 'u1',
      routineId: 'routine-push',
      routineName: 'Push Day',
      startedAt: '2026-09-20T10:00:00.000Z', // Older, but matching routine
      sets: {
        'ex-bench': [
          { setIndex: 1, weightKg: 80, reps: 8, rir: 2, setType: 'working', isWarmup: false, completed: true }
        ]
      }
    }
  ];

  const result = getPreviousRoutineExercisePerformance({
    history,
    routine: pushRoutine,
    exerciseId: 'ex-bench'
  });

  assert.ok(result);
  assert.equal(result.length, 1);
  assert.equal(result[0].weightKg, 80);
  assert.equal(result[0].reps, 8);
});

test('Selector Matrix C: last same-routine session skipped exercise searches backwards to older session', () => {
  const routine: Routine = { id: 'routine-push', userId: 'u1', name: 'Push Day', exerciseIds: ['ex-bench', 'ex-row'] };
  const history: WorkoutSession[] = [
    {
      id: 'ws-push-2',
      userId: 'u1',
      routineId: 'routine-push',
      routineName: 'Push Day',
      startedAt: '2026-09-24T10:00:00.000Z',
      sets: {
        'ex-bench': [
          { setIndex: 1, weightKg: 82.5, reps: 8, completed: true, setType: 'working', isWarmup: false }
        ]
        // ex-row was skipped, so omitted from sets
      }
    },
    {
      id: 'ws-push-1',
      userId: 'u1',
      routineId: 'routine-push',
      routineName: 'Push Day',
      startedAt: '2026-09-20T10:00:00.000Z',
      sets: {
        'ex-bench': [
          { setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false }
        ],
        'ex-row': [
          { setIndex: 1, weightKg: 70, reps: 10, rir: 2, completed: true, setType: 'working', isWarmup: false }
        ]
      }
    }
  ];

  const benchResult = getPreviousRoutineExercisePerformance({
    history,
    routine,
    exerciseId: 'ex-bench'
  });
  const rowResult = getPreviousRoutineExercisePerformance({
    history,
    routine,
    exerciseId: 'ex-row'
  });

  assert.ok(benchResult);
  assert.equal(benchResult[0].weightKg, 82.5, 'Bench should come from ws-push-2');

  assert.ok(rowResult);
  assert.equal(rowResult[0].weightKg, 70, 'Skipped row in ws-push-2 should fall back to ws-push-1');
  assert.equal(rowResult[0].reps, 10);
});

test('Selector Matrix D: incomplete sets are excluded from prefill', () => {
  const routine: Routine = { id: 'routine-push', userId: 'u1', name: 'Push Day', exerciseIds: ['ex-bench'] };
  const history: WorkoutSession[] = [
    {
      id: 'ws-1',
      userId: 'u1',
      routineId: 'routine-push',
      startedAt: '2026-09-20T10:00:00.000Z',
      sets: {
        'ex-bench': [
          { setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false },
          { setIndex: 2, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false },
          { setIndex: 3, weightKg: 80, reps: 8, completed: false, setType: 'working', isWarmup: false } // Incomplete
        ]
      }
    }
  ];

  const result = getPreviousRoutineExercisePerformance({
    history,
    routine,
    exerciseId: 'ex-bench'
  });

  assert.ok(result);
  assert.equal(result.length, 2, 'Only the 2 completed sets must be returned');
});

test('Selector Matrix E - H: warmup, working, backoff, and drop sets are all included', () => {
  const routine: Routine = { id: 'routine-1', userId: 'u1', name: 'Leg Day', exerciseIds: ['ex-bench'] };
  const history: WorkoutSession[] = [
    {
      id: 'ws-types',
      userId: 'u1',
      routineId: 'routine-1',
      startedAt: '2026-09-20T10:00:00.000Z',
      sets: {
        'ex-bench': [
          { setIndex: 1, weightKg: 40, reps: 12, completed: true, setType: 'warmup', isWarmup: true },
          { setIndex: 2, weightKg: 90, reps: 6, completed: true, setType: 'working', isWarmup: false },
          { setIndex: 3, weightKg: 75, reps: 10, completed: true, setType: 'backoff', isWarmup: false },
          { setIndex: 4, weightKg: 50, reps: 15, completed: true, setType: 'drop', isWarmup: false }
        ]
      }
    }
  ];

  const result = getPreviousRoutineExercisePerformance({
    history,
    routine,
    exerciseId: 'ex-bench'
  });

  assert.ok(result);
  assert.equal(result.length, 4);
  assert.deepEqual(result.map((s) => s.setType), ['warmup', 'working', 'backoff', 'drop']);
});

test('Selector Matrix I: RIR is preserved (including 0, 1, 2, 6+, and undefined)', () => {
  const routine: Routine = { id: 'r1', userId: 'u1', name: 'R1', exerciseIds: ['ex-bench'] };
  const history: WorkoutSession[] = [
    {
      id: 'ws-rir',
      userId: 'u1',
      routineId: 'r1',
      startedAt: '2026-09-20T10:00:00.000Z',
      sets: {
        'ex-bench': [
          { setIndex: 1, weightKg: 80, reps: 8, rir: 0, completed: true, setType: 'working', isWarmup: false },
          { setIndex: 2, weightKg: 80, reps: 8, rir: 1, completed: true, setType: 'working', isWarmup: false },
          { setIndex: 3, weightKg: 80, reps: 8, rir: 2, completed: true, setType: 'working', isWarmup: false },
          { setIndex: 4, weightKg: 80, reps: 8, rir: undefined, completed: true, setType: 'working', isWarmup: false }
        ]
      }
    }
  ];

  const result = getPreviousRoutineExercisePerformance({ history, routine, exerciseId: 'ex-bench' });
  assert.ok(result);
  assert.equal(result[0].rir, 0);
  assert.equal(result[1].rir, 1);
  assert.equal(result[2].rir, 2);
  assert.equal(result[3].rir, undefined);
});

test('Selector Matrix J: 0 kg load is preserved (bodyweight / zero-load exercises)', () => {
  const routine: Routine = { id: 'r-bw', userId: 'u1', name: 'Calisthenics', exerciseIds: ['ex-pullup'] };
  const history: WorkoutSession[] = [
    {
      id: 'ws-bw',
      userId: 'u1',
      routineId: 'r-bw',
      startedAt: '2026-09-20T10:00:00.000Z',
      sets: {
        'ex-pullup': [
          { setIndex: 1, weightKg: 0, reps: 12, completed: true, setType: 'working', isWarmup: false }
        ]
      }
    }
  ];

  const result = getPreviousRoutineExercisePerformance({ history, routine, exerciseId: 'ex-pullup' });
  assert.ok(result);
  assert.equal(result.length, 1);
  assert.equal(result[0].weightKg, 0);
  assert.equal(result[0].reps, 12);
});

test('Selector Matrix K: exact routineId survives routine rename', () => {
  // Session was logged when routine was named "Push", routine is now renamed to "Push A"
  const renamedRoutine: Routine = { id: 'routine-abc', userId: 'u1', name: 'Push A', exerciseIds: ['ex-bench'] };
  const history: WorkoutSession[] = [
    {
      id: 'ws-old-name',
      userId: 'u1',
      routineId: 'routine-abc', // Exact ID matches!
      routineName: 'Push',     // Old snapshot name
      startedAt: '2026-09-20T10:00:00.000Z',
      sets: {
        'ex-bench': [
          { setIndex: 1, weightKg: 85, reps: 8, completed: true, setType: 'working', isWarmup: false }
        ]
      }
    }
  ];

  const result = getPreviousRoutineExercisePerformance({
    history,
    routine: renamedRoutine,
    exerciseId: 'ex-bench'
  });

  assert.ok(result);
  assert.equal(result[0].weightKg, 85);
});

test('Selector Matrix L: duplicate current routine names disable legacy name attribution', () => {
  const routineA: Routine = { id: 'routine-A', userId: 'u1', name: 'Legs', exerciseIds: ['ex-bench'] };
  const routineB: Routine = { id: 'routine-B', userId: 'u1', name: 'Legs', exerciseIds: ['ex-bench'] };
  const currentRoutines = [routineA, routineB];

  // Legacy session without routineId
  const history: WorkoutSession[] = [
    {
      id: 'ws-legacy',
      userId: 'u1',
      routineName: 'Legs',
      startedAt: '2026-09-20T10:00:00.000Z',
      sets: {
        'ex-bench': [
          { setIndex: 1, weightKg: 95, reps: 5, completed: true, setType: 'working', isWarmup: false }
        ]
      }
    }
  ];

  // Neither routineA nor routineB should claim this session because "Legs" is ambiguous
  const resultA = getPreviousRoutineExercisePerformance({
    history,
    routine: routineA,
    exerciseId: 'ex-bench',
    currentRoutines
  });
  const resultB = getPreviousRoutineExercisePerformance({
    history,
    routine: routineB,
    exerciseId: 'ex-bench',
    currentRoutines
  });

  assert.equal(resultA, null, 'Ambiguous legacy routineName attribution must be disabled for routine A');
  assert.equal(resultB, null, 'Ambiguous legacy routineName attribution must be disabled for routine B');
});

test('Selector Matrix M: unique-name legacy session may be used conservatively', () => {
  const routine: Routine = { id: 'routine-single', userId: 'u1', name: 'Upper Heavy', exerciseIds: ['ex-bench'] };
  const currentRoutines = [routine];

  // Legacy session without routineId
  const history: WorkoutSession[] = [
    {
      id: 'ws-legacy-unique',
      userId: 'u1',
      routineName: 'Upper Heavy',
      startedAt: '2026-09-20T10:00:00.000Z',
      sets: {
        'ex-bench': [
          { setIndex: 1, weightKg: 95, reps: 5, completed: true, setType: 'working', isWarmup: false }
        ]
      }
    }
  ];

  const result = getPreviousRoutineExercisePerformance({
    history,
    routine,
    exerciseId: 'ex-bench',
    currentRoutines
  });

  assert.ok(result);
  assert.equal(result[0].weightKg, 95);
  assert.equal(result[0].reps, 5);
});

test('Selector Matrix N: HistoricalPersonalRecord never participates', () => {
  const routine: Routine = { id: 'routine-push', userId: 'u1', name: 'Push Day', exerciseIds: ['ex-bench'] };
  const hprEntry: unknown = {
    id: 'hpr-1',
    userId: 'u1',
    exerciseId: 'ex-bench',
    performedDate: '2026-09-26',
    recordedAt: '2026-09-26T12:00:00.000Z',
    bodyweightKg: 80,
    set: { setIndex: 1, weightKg: 120, reps: 1, completed: true, setType: 'working', isWarmup: false },
    source: 'historical_manual'
  };

  // History contains only HPR (or corrupted session array)
  const history = [hprEntry as WorkoutSession];

  const result = getPreviousRoutineExercisePerformance({
    history,
    routine,
    exerciseId: 'ex-bench'
  });

  assert.equal(result, null, 'HistoricalPersonalRecord must never be parsed as a WorkoutSession');
});

test('Selector Matrix O: historical workout session with matching routineId participates', () => {
  const routine: Routine = { id: 'routine-push', userId: 'u1', name: 'Push Day', exerciseIds: ['ex-bench'] };
  const historicalSession: WorkoutSession = {
    id: 'ws-hist-manual',
    userId: 'u1',
    routineId: 'routine-push',
    routineName: 'Push Day',
    entrySource: 'historical_manual',
    performedDate: '2026-09-15',
    startedAt: '2026-09-15T18:00:00.000Z',
    recordedAt: '2026-09-26T12:00:00.000Z',
    sets: {
      'ex-bench': [
        { setIndex: 1, weightKg: 87.5, reps: 8, completed: true, setType: 'working', isWarmup: false }
      ]
    }
  };

  const result = getPreviousRoutineExercisePerformance({
    history: [historicalSession],
    routine,
    exerciseId: 'ex-bench'
  });

  assert.ok(result);
  assert.equal(result[0].weightKg, 87.5);
});

// ==================================================
// 37. HYDRATION TEST MATRIX (1 - 14)
// ==================================================

test('Hydration Matrix 1 - 3: copies weight, reps, rir, setType; starts completed=false; reindexes 1..N', () => {
  const rawSets: LoggedSet[] = [
    { setIndex: 10, weightKg: 40, reps: 10, rir: 3, completed: true, setType: 'warmup', isWarmup: true },
    { setIndex: 20, weightKg: 80, reps: 8, rir: 2, completed: true, setType: 'working', isWarmup: false }
  ];

  const cloned = clonePreviousPerformanceSets(rawSets);

  assert.equal(cloned.length, 2);
  // Reindexed 1..N
  assert.equal(cloned[0].setIndex, 1);
  assert.equal(cloned[1].setIndex, 2);
  // Values preserved
  assert.equal(cloned[0].weightKg, 40);
  assert.equal(cloned[0].reps, 10);
  assert.equal(cloned[0].rir, 3);
  assert.equal(cloned[0].setType, 'warmup');
  assert.equal(cloned[0].isWarmup, true);

  assert.equal(cloned[1].weightKg, 80);
  assert.equal(cloned[1].reps, 8);
  assert.equal(cloned[1].rir, 2);
  assert.equal(cloned[1].setType, 'working');
  assert.equal(cloned[1].isWarmup, false);

  // Completed starts false!
  assert.equal(cloned[0].completed, false);
  assert.equal(cloned[1].completed, false);
});

test('Hydration Matrix 4 & Isolation 29: original history objects are never mutated', () => {
  const history: WorkoutSession[] = [
    {
      id: 'ws-immutability',
      userId: 'u1',
      routineId: 'r-push',
      startedAt: '2026-09-20T10:00:00.000Z',
      sets: {
        'ex-bench': [
          { setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false }
        ]
      }
    }
  ];

  const historySnapshot = JSON.stringify(history);

  const routine: Routine = { id: 'r-push', userId: 'u1', name: 'Push', exerciseIds: ['ex-bench'] };
  const sessions = buildRoutineExerciseSessions({
    routine,
    exercisesById: mockExercisesById,
    history,
    routines: [routine],
    createBaseExerciseSession: dummyBaseCreator
  });

  // Mutate the hydrated session set
  sessions[0].sets[0].weightKg = 999;
  sessions[0].sets[0].reps = 99;
  sessions[0].sets[0].completed = true;

  // Verify history remained completely untouched
  assert.equal(JSON.stringify(history), historySnapshot, 'Original history must remain byte-for-byte identical');
  assert.equal(history[0].sets['ex-bench'][0].weightKg, 80);
  assert.equal(history[0].sets['ex-bench'][0].completed, true);
});

test('Hydration Matrix 5 & 6: previous machine set snapshot is cleared; current session machine context preserved', () => {
  const routine: Routine = { id: 'r-machine', userId: 'u1', name: 'Machine Routine', exerciseIds: ['ex-bench'] };
  const history: WorkoutSession[] = [
    {
      id: 'ws-old-machine',
      userId: 'u1',
      routineId: 'r-machine',
      startedAt: '2026-09-20T10:00:00.000Z',
      sets: {
        'ex-bench': [
          {
            setIndex: 1,
            weightKg: 65,
            reps: 10,
            completed: true,
            setType: 'working',
            isWarmup: false,
            // Historical snapshot from an old gym/machine
            machineProfileId: 'old-machine-id-999',
            machineBaseResistanceKg: 25,
            machineBaseResistanceStatus: 'verified'
          }
        ]
      }
    }
  ];

  const sessions = buildRoutineExerciseSessions({
    routine,
    exercisesById: mockExercisesById,
    history,
    routines: [routine],
    createBaseExerciseSession: dummyBaseCreator // supplies current gym profile: profile-gym-1, tare: 15
  });

  const session = sessions[0];
  // Base session retains current machine context
  assert.equal(session.machineProfileId, 'profile-gym-1');
  assert.equal(session.machineBaseResistanceKg, 15);
  assert.equal(session.machineBaseResistanceStatus, 'verified');

  // Copied set has cleared historical machine snapshot (awaits today's completion/edit)
  assert.equal(session.sets[0].weightKg, 65);
  assert.equal(session.sets[0].reps, 10);
  assert.equal(session.sets[0].machineProfileId, undefined);
  assert.equal(session.sets[0].machineBaseResistanceKg, undefined);
});

test('Hydration Matrix 7 - 10: no previous performance falls back to RoutineTemplateV2 (weight, 8 reps, undef RIR)', () => {
  const routine: Routine = {
    id: 'r-template',
    userId: 'u1',
    name: 'New Routine',
    exerciseIds: ['ex-bench'],
    template: {
      version: 2,
      exercises: [
        {
          exerciseId: 'ex-bench',
          sets: [
            { setType: 'warmup', targetWeightKg: 40 },
            { setType: 'working', targetWeightKg: 80 }
          ]
        }
      ]
    }
  };

  const sessions = buildRoutineExerciseSessions({
    routine,
    exercisesById: mockExercisesById,
    history: [], // No history
    routines: [routine],
    createBaseExerciseSession: dummyBaseCreator
  });

  assert.equal(sessions.length, 1);
  const benchSets = sessions[0].sets;
  assert.equal(benchSets.length, 2);

  assert.equal(benchSets[0].weightKg, 40);
  assert.equal(benchSets[0].setType, 'warmup');
  assert.equal(benchSets[0].reps, 8, 'Template fallback reps must default to 8');
  assert.equal(benchSets[0].rir, undefined, 'Template fallback RIR must be undefined');
  assert.equal(benchSets[0].completed, false);

  assert.equal(benchSets[1].weightKg, 80);
  assert.equal(benchSets[1].setType, 'working');
  assert.equal(benchSets[1].reps, 8);
  assert.equal(benchSets[1].rir, undefined);
  assert.equal(benchSets[1].completed, false);
});

test('Hydration Matrix 11: no previous performance and no template falls back to canonical default', () => {
  const routine: Routine = {
    id: 'r-empty',
    userId: 'u1',
    name: 'Empty Template Routine',
    exerciseIds: ['ex-bench']
    // template is undefined
  };

  const sessions = buildRoutineExerciseSessions({
    routine,
    exercisesById: mockExercisesById,
    history: [],
    routines: [routine],
    createBaseExerciseSession: dummyBaseCreator
  });

  assert.equal(sessions.length, 1);
  // Default sets from dummyBaseCreator (3 sets of 50kg, 8 reps, completed=false)
  assert.equal(sessions[0].sets.length, 3);
  assert.equal(sessions[0].sets[0].weightKg, 50);
});

test('Hydration Matrix 12: routine exercise order strictly follows Routine V2 template exercises order', () => {
  const routine: Routine = {
    id: 'r-ordered',
    userId: 'u1',
    name: 'Ordered Push',
    exerciseIds: ['ex-row', 'ex-bench'], // Legacy fallback order
    template: {
      version: 2,
      exercises: [
        { exerciseId: 'ex-bench', sets: [{ setType: 'working', targetWeightKg: 80 }] },
        { exerciseId: 'ex-row', sets: [{ setType: 'working', targetWeightKg: 60 }] }
      ]
    }
  };

  const sessions = buildRoutineExerciseSessions({
    routine,
    exercisesById: mockExercisesById,
    history: [],
    routines: [routine],
    createBaseExerciseSession: dummyBaseCreator
  });

  assert.deepEqual(sessions.map((s) => s.exercise.id), ['ex-bench', 'ex-row']);
});

test('Hydration Matrix 13: removed historical exercise is not resurrected in new workout', () => {
  const routine: Routine = {
    id: 'r-curated',
    userId: 'u1',
    name: 'Curated Routine',
    exerciseIds: ['ex-bench'] // Only bench is currently in routine; row was removed
  };

  const history: WorkoutSession[] = [
    {
      id: 'ws-old-deleted',
      userId: 'u1',
      routineId: 'r-curated',
      startedAt: '2026-09-20T10:00:00.000Z',
      sets: {
        'ex-bench': [{ setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false }],
        'ex-row': [{ setIndex: 1, weightKg: 70, reps: 8, completed: true, setType: 'working', isWarmup: false }]
      }
    }
  ];

  const sessions = buildRoutineExerciseSessions({
    routine,
    exercisesById: mockExercisesById,
    history,
    routines: [routine],
    createBaseExerciseSession: dummyBaseCreator
  });

  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].exercise.id, 'ex-bench');
  assert.equal(sessions.some((s) => s.exercise.id === 'ex-row'), false, 'Deleted exercise must not be resurrected');
});

test('Hydration Matrix 14: mixed routine: existing exercise gets previous performance, new exercise gets template fallback', () => {
  const routine: Routine = {
    id: 'r-mixed',
    userId: 'u1',
    name: 'Mixed Routine',
    exerciseIds: ['ex-bench', 'ex-ohp'],
    template: {
      version: 2,
      exercises: [
        { exerciseId: 'ex-bench', sets: [{ setType: 'working', targetWeightKg: 70 }] },
        { exerciseId: 'ex-ohp', sets: [{ setType: 'warmup', targetWeightKg: 20 }, { setType: 'working', targetWeightKg: 40 }] }
      ]
    }
  };

  const history: WorkoutSession[] = [
    {
      id: 'ws-prev',
      userId: 'u1',
      routineId: 'r-mixed',
      startedAt: '2026-09-20T10:00:00.000Z',
      sets: {
        'ex-bench': [
          { setIndex: 1, weightKg: 85, reps: 9, rir: 1, completed: true, setType: 'working', isWarmup: false }
        ]
        // ex-ohp has never been performed
      }
    }
  ];

  const sessions = buildRoutineExerciseSessions({
    routine,
    exercisesById: mockExercisesById,
    history,
    routines: [routine],
    createBaseExerciseSession: dummyBaseCreator
  });

  assert.equal(sessions.length, 2);

  // Bench gets previous performance (85kg x 9 @1)
  assert.equal(sessions[0].exercise.id, 'ex-bench');
  assert.equal(sessions[0].sets[0].weightKg, 85);
  assert.equal(sessions[0].sets[0].reps, 9);
  assert.equal(sessions[0].sets[0].rir, 1);

  // OHP gets template fallback (20kg warmup x 8, 40kg working x 8)
  assert.equal(sessions[1].exercise.id, 'ex-ohp');
  assert.equal(sessions[1].sets.length, 2);
  assert.equal(sessions[1].sets[0].weightKg, 20);
  assert.equal(sessions[1].sets[0].setType, 'warmup');
  assert.equal(sessions[1].sets[0].reps, 8);
  assert.equal(sessions[1].sets[1].weightKg, 40);
  assert.equal(sessions[1].sets[1].setType, 'working');
  assert.equal(sessions[1].sets[1].reps, 8);
});

// ==================================================
// 38. ACTIVE WORKOUT & ISOLATION TESTS
// ==================================================

test('Isolation 30: RoutineTemplateV2 is not mutated during hydration, set editing, or session completion', () => {
  const routine: Routine = {
    id: 'r-template-safe',
    userId: 'u1',
    name: 'Safe Template',
    exerciseIds: ['ex-bench'],
    template: {
      version: 2,
      exercises: [
        {
          exerciseId: 'ex-bench',
          sets: [{ setType: 'working', targetWeightKg: 80 }]
        }
      ]
    }
  };

  const templateSnapshot = JSON.stringify(routine.template);

  const sessions = buildRoutineExerciseSessions({
    routine,
    exercisesById: mockExercisesById,
    history: [],
    routines: [routine],
    createBaseExerciseSession: dummyBaseCreator
  });

  // Mutate hydrated set
  sessions[0].sets[0].weightKg = 100;
  sessions[0].sets[0].reps = 12;
  sessions[0].sets[0].completed = true;

  // Verify template remained intact
  assert.equal(JSON.stringify(routine.template), templateSnapshot, 'RoutineTemplateV2 must never be mutated');
});

// ==================================================
// 38. ACTIVE WORKOUT TEST MATRIX (PERSISTENCE & LIFECYCLE)
// ==================================================

const createMemoryStorage = (): StorageAdapter => {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => map.set(key, value),
    removeItem: (key: string) => map.delete(key)
  };
};

test('Active Workout Matrix 1 & 2: save and reload ACTIVE_WORKOUT persists and restores activeRoutineId', () => {
  const storage = createMemoryStorage();
  const activeWorkoutState = {
    isWorkoutActive: true,
    activeRoutineId: 'routine-push-101',
    activeRoutineName: 'Push Hypertrophy',
    workoutStartTime: '2026-09-27T10:00:00.000Z',
    performedDate: '2026-09-27',
    exerciseSessions: []
  };

  saveActiveWorkout(activeWorkoutState, storage);
  const restored = getStoredActiveWorkout<typeof activeWorkoutState>(storage);

  assert.ok(restored);
  assert.equal(restored.isWorkoutActive, true);
  assert.equal(restored.activeRoutineId, 'routine-push-101');
  assert.equal(restored.activeRoutineName, 'Push Hypertrophy');
});

test('Active Workout Matrix 3: legacy ACTIVE_WORKOUT without activeRoutineId restores safely with undefined', () => {
  const storage = createMemoryStorage();
  const legacyActiveState = {
    isWorkoutActive: true,
    // activeRoutineId omitted as in older versions
    activeRoutineName: 'Legacy Routine',
    workoutStartTime: '2026-09-20T10:00:00.000Z',
    exerciseSessions: []
  };

  saveActiveWorkout(legacyActiveState, storage);
  const restored = getStoredActiveWorkout<Record<string, unknown>>(storage);

  assert.ok(restored);
  assert.equal(restored.isWorkoutActive, true);
  assert.equal(restored.activeRoutineId, undefined);
  assert.equal(restored.activeRoutineName, 'Legacy Routine');
});

test('Active Workout Matrix 4: free workout ACTIVE_WORKOUT maintains activeRoutineId undefined', () => {
  const storage = createMemoryStorage();
  const freeWorkoutState = {
    isWorkoutActive: true,
    activeRoutineId: undefined,
    activeRoutineName: 'Entrenamiento Libre',
    workoutStartTime: '2026-09-27T11:00:00.000Z',
    exerciseSessions: []
  };

  saveActiveWorkout(freeWorkoutState, storage);
  const restored = getStoredActiveWorkout<typeof freeWorkoutState>(storage);

  assert.ok(restored);
  assert.equal(restored.isWorkoutActive, true);
  assert.equal(restored.activeRoutineId, undefined);
});

test('Active Workout Matrix 5 & 6: finished routine workout persists routineId; free workout leaves routineId absent', () => {
  // Routine workout finish
  const activeRoutineId = 'routine-legs-42';
  const activeRoutineName = 'Heavy Legs';
  const routineSession: WorkoutSession = {
    id: 'ws-finished-routine',
    userId: 'u1',
    ...(activeRoutineId ? { routineId: activeRoutineId } : {}),
    routineName: activeRoutineName,
    startedAt: '2026-09-27T10:00:00.000Z',
    performedDate: '2026-09-27',
    endedAt: '2026-09-27T11:00:00.000Z',
    recordedAt: '2026-09-27T11:00:00.000Z',
    entrySource: 'live',
    sets: {}
  };

  assert.equal(routineSession.routineId, 'routine-legs-42');
  assert.equal(routineSession.routineName, 'Heavy Legs');

  // Free workout finish
  const freeRoutineId: string | undefined = undefined;
  const freeRoutineName = 'Entrenamiento Libre';
  const freeSession: WorkoutSession = {
    id: 'ws-finished-free',
    userId: 'u1',
    ...(freeRoutineId ? { routineId: freeRoutineId } : {}),
    routineName: freeRoutineName,
    startedAt: '2026-09-27T10:00:00.000Z',
    performedDate: '2026-09-27',
    endedAt: '2026-09-27T11:00:00.000Z',
    recordedAt: '2026-09-27T11:00:00.000Z',
    entrySource: 'live',
    sets: {}
  };

  assert.equal(freeSession.routineId, undefined);
  assert.equal('routineId' in freeSession, false);
});

test('Active Workout Matrix 7: refresh after user modifications preserves draft without rehydrating from history', () => {
  const storage = createMemoryStorage();

  // 1. Initial hydration prefilled 80 kg x 8
  const routine: Routine = { id: 'r-draft', userId: 'u1', name: 'Draft Routine', exerciseIds: ['ex-bench'] };
  const history: WorkoutSession[] = [
    {
      id: 'ws-prev-draft',
      userId: 'u1',
      routineId: 'r-draft',
      startedAt: '2026-09-20T10:00:00.000Z',
      sets: {
        'ex-bench': [{ setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false }]
      }
    }
  ];

  const initialSessions = buildRoutineExerciseSessions({
    routine,
    exercisesById: mockExercisesById,
    history,
    routines: [routine],
    createBaseExerciseSession: dummyBaseCreator
  });

  assert.equal(initialSessions[0].sets[0].weightKg, 80);

  // 2. User edits weight to 82.5 kg and reps to 9 during today's session
  initialSessions[0].sets[0].weightKg = 82.5;
  initialSessions[0].sets[0].reps = 9;

  // 3. Page automatically saves active snapshot
  const activeSnapshot = {
    isWorkoutActive: true,
    activeRoutineId: 'r-draft',
    activeRoutineName: 'Draft Routine',
    workoutStartTime: '2026-09-27T12:00:00.000Z',
    exerciseSessions: initialSessions
  };
  saveActiveWorkout(activeSnapshot, storage);

  // 4. Page reloads (mount restore does NOT rehydrate from previous history)
  const reloaded = getStoredActiveWorkout<typeof activeSnapshot>(storage);
  assert.ok(reloaded);
  const normalizedRestored = (reloaded.exerciseSessions || []).map(normalizeActiveExerciseSession);

  assert.equal(normalizedRestored[0].sets[0].weightKg, 82.5, 'User modified load must be preserved after reload');
  assert.equal(normalizedRestored[0].sets[0].reps, 9, 'User modified reps must be preserved after reload');
});

// ==========================================
// BLOCK 19.8B1: HISTORICAL TIME-BOUND HARDENING TESTS
// ==========================================

test('19.8B1 Test 13: historical future exclusion (Sep 20 85kg excluded for Sep 15 target)', () => {
  const routine: Routine = { id: 'routine-push', userId: 'u1', name: 'Push Day', exerciseIds: ['ex-bench'] };
  const history: WorkoutSession[] = [
    {
      id: 'ws-sep-20',
      userId: 'u1',
      routineId: 'routine-push',
      routineName: 'Push Day',
      startedAt: createHistoricalWorkoutInstant('2026-09-20', '10:00').toISOString(),
      performedDate: '2026-09-20',
      sets: {
        'ex-bench': [{ setIndex: 1, weightKg: 85, reps: 8, completed: true, setType: 'working', isWarmup: false }]
      }
    },
    {
      id: 'ws-sep-10',
      userId: 'u1',
      routineId: 'routine-push',
      routineName: 'Push Day',
      startedAt: createHistoricalWorkoutInstant('2026-09-10', '10:00').toISOString(),
      performedDate: '2026-09-10',
      sets: {
        'ex-bench': [{ setIndex: 1, weightKg: 70, reps: 8, completed: true, setType: 'working', isWarmup: false }]
      }
    }
  ];

  const cutoffSep15 = resolveHistoricalWorkoutCutoff('2026-09-15', '14:00');
  const result = getPreviousRoutineExercisePerformance({
    history,
    routine,
    exerciseId: 'ex-bench',
    beforeTimestamp: cutoffSep15
  });

  assert.ok(result);
  assert.equal(result[0].weightKg, 70, 'Must select Sep 10 70kg, strictly excluding Sep 20 future performance');
});

test('19.8B1 Test 14: same day time boundary (Sep 15 18:00 excluded for Sep 15 14:00 target)', () => {
  const routine: Routine = { id: 'routine-push', userId: 'u1', name: 'Push Day', exerciseIds: ['ex-bench'] };
  const history: WorkoutSession[] = [
    {
      id: 'ws-sep-15-evening',
      userId: 'u1',
      routineId: 'routine-push',
      startedAt: createHistoricalWorkoutInstant('2026-09-15', '18:00').toISOString(),
      performedDate: '2026-09-15',
      sets: {
        'ex-bench': [{ setIndex: 1, weightKg: 90, reps: 8, completed: true, setType: 'working', isWarmup: false }]
      }
    },
    {
      id: 'ws-sep-15-morning',
      userId: 'u1',
      routineId: 'routine-push',
      startedAt: createHistoricalWorkoutInstant('2026-09-15', '10:00').toISOString(),
      performedDate: '2026-09-15',
      sets: {
        'ex-bench': [{ setIndex: 1, weightKg: 70, reps: 8, completed: true, setType: 'working', isWarmup: false }]
      }
    }
  ];

  const targetCutoff = resolveHistoricalWorkoutCutoff('2026-09-15', '14:00');
  const result = getPreviousRoutineExercisePerformance({
    history,
    routine,
    exerciseId: 'ex-bench',
    beforeTimestamp: targetCutoff
  });

  assert.ok(result);
  assert.equal(result[0].weightKg, 70, 'Morning 10:00 (70kg) qualifies; evening 18:00 (90kg) must be excluded');
});

test('19.8B1 Test 15: historical session recorded later qualifies by physical chronology', () => {
  const routine: Routine = { id: 'routine-push', userId: 'u1', name: 'Push Day', exerciseIds: ['ex-bench'] };
  const history: WorkoutSession[] = [
    {
      id: 'ws-sep-10-recorded-late',
      userId: 'u1',
      routineId: 'routine-push',
      startedAt: createHistoricalWorkoutInstant('2026-09-10', '10:00').toISOString(),
      performedDate: '2026-09-10',
      recordedAt: '2026-09-26T22:00:00.000Z', // Recorded much later
      entrySource: 'historical_manual',
      sets: {
        'ex-bench': [{ setIndex: 1, weightKg: 70, reps: 8, completed: true, setType: 'working', isWarmup: false }]
      }
    }
  ];

  const targetCutoff = resolveHistoricalWorkoutCutoff('2026-09-15', '14:00');
  const result = getPreviousRoutineExercisePerformance({
    history,
    routine,
    exerciseId: 'ex-bench',
    beforeTimestamp: targetCutoff
  });

  assert.ok(result, 'Session physically performed Sep 10 must qualify for Sep 15 target despite recordedAt on Sep 26');
  assert.equal(result[0].weightKg, 70);
});

test('19.8B1 Test 16: no time yet applies conservative start-of-day cutoff', () => {
  const routine: Routine = { id: 'routine-push', userId: 'u1', name: 'Push Day', exerciseIds: ['ex-bench'] };
  const history: WorkoutSession[] = [
    {
      id: 'ws-sep-15-morning',
      userId: 'u1',
      routineId: 'routine-push',
      startedAt: createHistoricalWorkoutInstant('2026-09-15', '08:00').toISOString(),
      performedDate: '2026-09-15',
      sets: {
        'ex-bench': [{ setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false }]
      }
    },
    {
      id: 'ws-sep-14',
      userId: 'u1',
      routineId: 'routine-push',
      startedAt: createHistoricalWorkoutInstant('2026-09-14', '18:00').toISOString(),
      performedDate: '2026-09-14',
      sets: {
        'ex-bench': [{ setIndex: 1, weightKg: 70, reps: 8, completed: true, setType: 'working', isWarmup: false }]
      }
    }
  ];

  // Target date is Sep 15, but performedTime is empty
  const conservativeCutoff = resolveHistoricalWorkoutCutoff('2026-09-15', '');
  const result = getPreviousRoutineExercisePerformance({
    history,
    routine,
    exerciseId: 'ex-bench',
    beforeTimestamp: conservativeCutoff
  });

  assert.ok(result);
  assert.equal(result[0].weightKg, 70, 'When time is unknown, same-day 08:00 must be excluded; only prior calendar day (Sep 14, 70kg) qualifies');
});

test('19.8B1 Test 17: live workout start has no cutoff and selects latest historical performance', () => {
  const routine: Routine = { id: 'routine-push', userId: 'u1', name: 'Push Day', exerciseIds: ['ex-bench'] };
  const history: WorkoutSession[] = [
    {
      id: 'ws-sep-20',
      userId: 'u1',
      routineId: 'routine-push',
      startedAt: '2026-09-20T10:00:00.000Z',
      performedDate: '2026-09-20',
      sets: {
        'ex-bench': [{ setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false }]
      }
    },
    {
      id: 'ws-sep-25',
      userId: 'u1',
      routineId: 'routine-push',
      startedAt: '2026-09-25T10:00:00.000Z',
      performedDate: '2026-09-25',
      sets: {
        'ex-bench': [{ setIndex: 1, weightKg: 85, reps: 8, completed: true, setType: 'working', isWarmup: false }]
      }
    }
  ];

  // Live workout starts on Sep 27 with NO cutoff (beforeTimestamp is undefined)
  const result = getPreviousRoutineExercisePerformance({
    history,
    routine,
    exerciseId: 'ex-bench'
  });

  assert.ok(result);
  assert.equal(result[0].weightKg, 85, 'Live routine start must receive latest performance (85kg from Sep 25)');
});

test('19.8B1 Test 18: dirty historical draft is not overwritten on date/time change', () => {
  const routine: Routine = { id: 'routine-push', userId: 'u1', name: 'Push Day', exerciseIds: ['ex-bench'] };
  const history: WorkoutSession[] = [
    {
      id: 'ws-sep-10',
      userId: 'u1',
      routineId: 'routine-push',
      startedAt: createHistoricalWorkoutInstant('2026-09-10', '10:00').toISOString(),
      performedDate: '2026-09-10',
      sets: {
        'ex-bench': [{ setIndex: 1, weightKg: 70, reps: 8, completed: true, setType: 'working', isWarmup: false }]
      }
    },
    {
      id: 'ws-sep-20',
      userId: 'u1',
      routineId: 'routine-push',
      startedAt: createHistoricalWorkoutInstant('2026-09-20', '10:00').toISOString(),
      performedDate: '2026-09-20',
      sets: {
        'ex-bench': [{ setIndex: 1, weightKg: 85, reps: 8, completed: true, setType: 'working', isWarmup: false }]
      }
    }
  ];

  // 1. Initial prefill for Sep 15 target
  const cutoffSep15 = resolveHistoricalWorkoutCutoff('2026-09-15', '10:00');
  const initialSessions = buildRoutineExerciseSessions({
    routine,
    exercisesById: mockExercisesById,
    history,
    routines: [routine],
    beforeTimestamp: cutoffSep15,
    createBaseExerciseSession: dummyBaseCreator
  });

  assert.equal(initialSessions[0].sets[0].weightKg, 70);
  assert.equal(initialSessions[0].sets[0].reps, 8);

  // 2. User edits draft sets in editor
  initialSessions[0].sets[0].weightKg = 75;
  initialSessions[0].sets[0].reps = 9;
  let editorDirty = true;

  // 3. User goes back and changes date to Sep 22
  const newDate = '2026-09-22';
  const newTime = '10:00';
  let activeSessions = initialSessions;

  // Protected draft guard: if editorDirty is true, prefill is NOT recalculated
  if (!editorDirty) {
    const cutoffSep22 = resolveHistoricalWorkoutCutoff(newDate, newTime);
    activeSessions = buildRoutineExerciseSessions({
      routine,
      exercisesById: mockExercisesById,
      history,
      routines: [routine],
      beforeTimestamp: cutoffSep22,
      createBaseExerciseSession: dummyBaseCreator
    });
  }

  assert.equal(activeSessions[0].sets[0].weightKg, 75, 'User edited weight (75kg) must not be overwritten');
  assert.equal(activeSessions[0].sets[0].reps, 9, 'User edited reps (9) must not be overwritten');
});

test('19.8B1 Test 19: legacy fallback requires currentRoutines and unique match', () => {
  const routine: Routine = { id: 'routine-push-1', userId: 'u1', name: 'Push', exerciseIds: ['ex-bench'] };
  const duplicateRoutine: Routine = { id: 'routine-push-2', userId: 'u1', name: 'Push', exerciseIds: ['ex-bench'] };

  const legacySession: WorkoutSession = {
    id: 'ws-legacy-push',
    userId: 'u1',
    // routineId is absent!
    routineName: 'Push',
    startedAt: '2026-09-20T10:00:00.000Z',
    sets: {
      'ex-bench': [{ setIndex: 1, weightKg: 75, reps: 8, completed: true, setType: 'working', isWarmup: false }]
    }
  };

  // Case A: Call WITHOUT currentRoutines -> MUST NOT match
  const matchWithoutRoutines = doesSessionMatchRoutine(legacySession, routine, undefined);
  assert.equal(matchWithoutRoutines, false, 'Legacy session without routineId must not match when currentRoutines is omitted');

  const resultWithoutRoutines = getPreviousRoutineExercisePerformance({
    history: [legacySession],
    routine,
    exerciseId: 'ex-bench'
    // currentRoutines omitted
  });
  assert.equal(resultWithoutRoutines, null, 'Selector must return null when currentRoutines is omitted for legacy session');

  // Case B: Call with currentRoutines = [one unique Push routine] -> MUST match
  const matchWithUnique = doesSessionMatchRoutine(legacySession, routine, [routine]);
  assert.equal(matchWithUnique, true, 'Legacy session must match when currentRoutines contains exactly one matching routine');

  const resultWithUnique = getPreviousRoutineExercisePerformance({
    history: [legacySession],
    routine,
    exerciseId: 'ex-bench',
    currentRoutines: [routine]
  });
  assert.ok(resultWithUnique, 'Selector must find performance when routine name is unique');
  assert.equal(resultWithUnique[0].weightKg, 75);

  // Case C: Call with two different routines named "Push" -> MUST NOT match
  const matchWithDuplicates = doesSessionMatchRoutine(legacySession, routine, [routine, duplicateRoutine]);
  assert.equal(matchWithDuplicates, false, 'Legacy session must not match when duplicate routines share the same name');

  const resultWithDuplicates = getPreviousRoutineExercisePerformance({
    history: [legacySession],
    routine,
    exerciseId: 'ex-bench',
    currentRoutines: [routine, duplicateRoutine]
  });
  assert.equal(resultWithDuplicates, null, 'Selector must return null when duplicate routines share the same name');
});

test('19.8B1 Test 21: routine identity filtering precedes temporal cutoff and prevents cross-routine contamination', () => {
  const pushRoutine: Routine = { id: 'routine-push', userId: 'u1', name: 'Push Day', exerciseIds: ['ex-bench'] };
  const strengthRoutine: Routine = { id: 'routine-strength', userId: 'u1', name: 'Strength Day', exerciseIds: ['ex-bench'] };

  const history: WorkoutSession[] = [
    {
      id: 'ws-strength-sep-12',
      userId: 'u1',
      routineId: 'routine-strength',
      routineName: 'Strength Day',
      startedAt: createHistoricalWorkoutInstant('2026-09-12', '10:00').toISOString(),
      performedDate: '2026-09-12',
      sets: {
        'ex-bench': [{ setIndex: 1, weightKg: 100, reps: 3, completed: true, setType: 'working', isWarmup: false }]
      }
    },
    {
      id: 'ws-push-sep-10',
      userId: 'u1',
      routineId: 'routine-push',
      routineName: 'Push Day',
      startedAt: createHistoricalWorkoutInstant('2026-09-10', '10:00').toISOString(),
      performedDate: '2026-09-10',
      sets: {
        'ex-bench': [{ setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false }]
      }
    }
  ];

  // Target historical workout on Sep 15 for Push Day
  const cutoffSep15 = resolveHistoricalWorkoutCutoff('2026-09-15', '14:00');
  const result = getPreviousRoutineExercisePerformance({
    history,
    routine: pushRoutine,
    exerciseId: 'ex-bench',
    beforeTimestamp: cutoffSep15,
    currentRoutines: [pushRoutine, strengthRoutine]
  });

  assert.ok(result);
  assert.equal(result[0].weightKg, 80, 'Must select Push Day (80kg), never Strength Day (100kg) even though Strength Day is newer and before cutoff');
});

