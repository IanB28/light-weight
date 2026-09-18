import test from 'node:test';
import assert from 'node:assert/strict';
import type { Exercise, Routine } from '@light-weight/domain';
import { buildRoutineExerciseSessions } from './useWorkoutSession.js';
import type { ActiveExerciseSession } from './types.js';

const mockCatalog: Exercise[] = [
  {
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
  },
  {
    id: 'ex-incline',
    name: 'Incline Dumbbell Press',
    category: 'dumbbell',
    primaryMuscle: 'chest',
    loading: {
      mechanism: 'dumbbell',
      loadMode: 'total',
      supportsKeyboard: true,
      supportsPlates: false,
      supportsExternalLoad: true,
      includeBarWeight: false
    }
  },
  {
    id: 'ex-cable-fly',
    name: 'Cable Fly',
    category: 'cable',
    primaryMuscle: 'chest',
    loading: {
      mechanism: 'cable',
      loadMode: 'total',
      supportsKeyboard: true,
      supportsPlates: false,
      supportsExternalLoad: true,
      includeBarWeight: false
    }
  }
];

const mockCatalogById: Record<string, Exercise> = Object.fromEntries(
  mockCatalog.map((ex) => [ex.id, ex])
);

const dummyCreator = (exercise: Exercise): ActiveExerciseSession => ({
  exercise,
  targetRepRange: [6, 12],
  skipped: false,
  sets: [
    { setIndex: 1, weightKg: 80, reps: 8, completed: false, setType: 'working', isWarmup: false, rir: 2 }
  ]
});

// ==================================================
// ROUTINE STARTUP ORDER REGRESSION TESTS
// ==================================================

test('1. Routine startup preserves exact Routine.exerciseIds ordering rather than global catalog order', () => {
  // Global catalog order is: ex-bench, ex-incline, ex-cable-fly
  // User's custom routine order is: ex-incline, ex-bench, ex-cable-fly
  const routine: Routine = {
    id: 'routine-custom-order',
    userId: 'user-1',
    name: 'Incline Priority Chest',
    exerciseIds: ['ex-incline', 'ex-bench', 'ex-cable-fly']
  };

  const sessions = buildRoutineExerciseSessions(routine, mockCatalogById, dummyCreator);

  // Active workout MUST start Incline Press, Bench Press, Cable Fly
  assert.equal(sessions.length, 3);
  assert.deepEqual(
    sessions.map((s) => s.exercise.id),
    ['ex-incline', 'ex-bench', 'ex-cable-fly'],
    'Active workout sessions must match Routine.exerciseIds order, not catalog order'
  );
});

test('2. Routine startup preserves reversed order relative to global catalog', () => {
  // User's custom routine has reverse catalog order
  const routine: Routine = {
    id: 'routine-reverse',
    userId: 'user-1',
    name: 'Reverse Chest',
    exerciseIds: ['ex-cable-fly', 'ex-incline', 'ex-bench']
  };

  const sessions = buildRoutineExerciseSessions(routine, mockCatalogById, dummyCreator);

  assert.equal(sessions.length, 3);
  assert.deepEqual(
    sessions.map((s) => s.exercise.id),
    ['ex-cable-fly', 'ex-incline', 'ex-bench'],
    'Active workout sessions must preserve reversed routine order'
  );
});

test('3. Routine startup gracefully skips nonexistent exercise IDs while preserving valid order', () => {
  const routine: Routine = {
    id: 'routine-missing-ids',
    userId: 'user-1',
    name: 'Partial Routine',
    exerciseIds: ['ex-cable-fly', 'ex-deleted-404', 'ex-bench']
  };

  const sessions = buildRoutineExerciseSessions(routine, mockCatalogById, dummyCreator);

  assert.equal(sessions.length, 2);
  assert.deepEqual(
    sessions.map((s) => s.exercise.id),
    ['ex-cable-fly', 'ex-bench'],
    'Missing exercise IDs must be filtered out while preserving order of remaining exercises'
  );
});
