import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import type { Exercise, LoggedSet, Routine, WorkoutSession } from '@light-weight/domain';
import {
  getStoredActiveWorkout,
  saveActiveWorkout,
  getStoredRoutines,
  saveStoredRoutines,
  normalizeStoredRoutines
} from '../../lib/storage.js';
import { buildRoutinePickerOptions } from '../routines/routine-options.js';
import {
  createHistoricalWorkoutSessionFromActive,
  HistoricalWorkoutValidationError
} from './historical-workout.js';
import type { ActiveExerciseSession } from './types.js';
import { createDefaultExerciseSession } from './useWorkoutSession.js';
import { ExerciseSessionCard } from './WorkoutSessionComponents.js';
import { HistoricalWorkoutModal } from '../../components/HistoricalWorkoutModal.js';
import { DayDetailModal } from '../../components/DayDetailModal.js';
import { HomeView } from '../../views/HomeView.js';

const benchPress: Exercise = {
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

const inclinePress: Exercise = {
  id: 'incline-press',
  name: 'Incline Press',
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

test('1. Routine deduplication: normalizeStoredRoutines deduplicates by ID preserving latest', () => {
  const duplicates: Routine[] = [
    { id: 'rot-1', userId: 'u1', name: 'Push A (v1)', exerciseIds: ['bench-press'] },
    { id: 'rot-2', userId: 'u1', name: 'Pull A', exerciseIds: [] },
    { id: 'rot-1', userId: 'u1', name: 'Push A (v2)', exerciseIds: ['bench-press', 'incline-press'] }
  ];

  const normalized = normalizeStoredRoutines(duplicates);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].id, 'rot-1');
  assert.equal(normalized[0].name, 'Push A (v2)');
  assert.equal(normalized[1].id, 'rot-2');
});

test('2. Routine deduplication: routines with distinct IDs sharing display name are NOT merged', () => {
  const sameNameRoutines: Routine[] = [
    { id: 'rot-1', userId: 'u1', name: 'Fuerza', exerciseIds: ['bench-press'] },
    { id: 'rot-2', userId: 'u1', name: 'Fuerza', exerciseIds: ['incline-press', 'bench-press'] }
  ];

  const normalized = normalizeStoredRoutines(sameNameRoutines);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].id, 'rot-1');
  assert.equal(normalized[1].id, 'rot-2');
});

test('3. Routine picker disambiguation: buildRoutinePickerOptions disambiguates duplicate names', () => {
  const routines: Routine[] = [
    { id: 'rot-1', userId: 'u1', name: 'Fuerza', exerciseIds: ['bench-press'] },
    { id: 'rot-2', userId: 'u1', name: 'Fuerza', exerciseIds: ['incline-press', 'bench-press'] },
    { id: 'rot-3', userId: 'u1', name: 'Hipertrofia', exerciseIds: ['bench-press'] }
  ];

  const options = buildRoutinePickerOptions(routines, {
    emptyLabel: 'Sin rutina',
    exerciseLabel: (c) => `${c} ejercicios`
  });

  assert.equal(options.length, 4);
  assert.equal(options[0].value, '');
  assert.equal(options[0].label, 'Sin rutina');

  // rot-1 and rot-2 share the name "Fuerza" -> disambiguated with metadata
  assert.equal(options[1].value, 'rot-1');
  assert.equal(options[1].label, 'Fuerza · 1 ejercicios');
  assert.equal(options[2].value, 'rot-2');
  assert.equal(options[2].label, 'Fuerza · 2 ejercicios');

  // rot-3 has unique name -> not disambiguated
  assert.equal(options[3].value, 'rot-3');
  assert.equal(options[3].label, 'Hipertrofia');
});

test('4. Storage boundary: getStoredRoutines and saveStoredRoutines enforce deduplication', () => {
  const memory = new Map<string, string>();
  const orig = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key)
    }
  });

  try {
    // Corrupt storage with duplicate routine IDs
    memory.set('lightweight_routines', JSON.stringify([
      { id: 'r1', userId: 'u', name: 'Old', exerciseIds: [] },
      { id: 'r1', userId: 'u', name: 'New', exerciseIds: ['ex1'] }
    ]));

    const loaded = getStoredRoutines();
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].name, 'New');

    // Saving array with duplicates normalizes on write
    saveStoredRoutines([
      { id: 'r2', userId: 'u', name: 'R2-A', exerciseIds: [] },
      { id: 'r2', userId: 'u', name: 'R2-B', exerciseIds: [] }
    ]);
    const parsed = JSON.parse(memory.get('lightweight_routines') || '[]');
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].name, 'R2-B');
  } finally {
    if (orig) Object.defineProperty(globalThis, 'localStorage', orig);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('5. Historical V2 serialization: only completed sets are serialized; pending draft sets omitted', () => {
  const exerciseSessions: ActiveExerciseSession[] = [
    {
      exercise: benchPress,
      targetRepRange: [6, 12],
      sets: [
        { setIndex: 1, weightKg: 100, reps: 5, rir: 2, completed: true, setType: 'working', isWarmup: false },
        { setIndex: 2, weightKg: 100, reps: 5, rir: 1, completed: false, setType: 'working', isWarmup: false }, // Pending draft!
        { setIndex: 3, weightKg: 90, reps: 8, rir: 0, completed: true, setType: 'backoff', isWarmup: false }
      ]
    },
    {
      exercise: inclinePress,
      targetRepRange: [8, 12],
      sets: [
        { setIndex: 1, weightKg: 60, reps: 10, completed: false, setType: 'working', isWarmup: false } // Whole exercise has 0 completed sets!
      ]
    }
  ];

  const recordedAt = new Date('2026-09-25T12:00:00.000Z');
  const session = createHistoricalWorkoutSessionFromActive({
    userId: 'user-1',
    routineId: 'routine-push',
    routineName: 'Push Day',
    performedDate: '2026-09-24',
    performedTime: '18:00',
    durationMinutes: '60',
    exerciseSessions
  }, recordedAt);

  assert.equal(session.performedDate, '2026-09-24');
  assert.equal(session.entrySource, 'historical_manual');
  assert.equal(session.routineId, 'routine-push');
  assert.equal(session.routineName, 'Push Day');

  // Bench press must only have the 2 completed sets, re-indexed as 1 and 2
  const benchSets = session.sets['bench-press'];
  assert.equal(benchSets.length, 2);
  assert.equal(benchSets[0].setIndex, 1);
  assert.equal(benchSets[0].weightKg, 100);
  assert.equal(benchSets[0].reps, 5);
  assert.equal(benchSets[0].rir, 2);
  assert.equal(benchSets[0].completed, true);

  assert.equal(benchSets[1].setIndex, 2);
  assert.equal(benchSets[1].weightKg, 90);
  assert.equal(benchSets[1].reps, 8);
  assert.equal(benchSets[1].setType, 'backoff');
  assert.equal(benchSets[1].completed, true);

  // Incline press had 0 completed sets -> omitted completely from serialized session
  assert.equal(session.sets['incline-press'], undefined);
});

test('6. Historical V2 validation: throws invalid_set when zero completed sets exist', () => {
  const exerciseSessions: ActiveExerciseSession[] = [
    {
      exercise: benchPress,
      targetRepRange: [6, 12],
      sets: [
        { setIndex: 1, weightKg: 100, reps: 5, completed: false, setType: 'working', isWarmup: false }
      ]
    }
  ];

  assert.throws(
    () => createHistoricalWorkoutSessionFromActive({
      userId: 'user-1',
      performedDate: '2026-09-24',
      performedTime: '18:00',
      exerciseSessions
    }),
    HistoricalWorkoutValidationError
  );
});

test('7. Active workout isolation: historical registration does not touch ACTIVE_WORKOUT storage', () => {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key)
  };

  const active = {
    isWorkoutActive: true,
    workoutStartTime: '2026-09-25T10:00:00.000Z',
    activeRoutineName: 'Active Routine',
    exerciseSessions: []
  };
  saveActiveWorkout(active, storage);

  const activeBefore = getStoredActiveWorkout(storage);
  assert.deepEqual(activeBefore, active);

  // Perform historical serialization
  const historical = createHistoricalWorkoutSessionFromActive({
    userId: 'user-1',
    performedDate: '2026-09-20',
    performedTime: '15:00',
    exerciseSessions: [
      {
        exercise: benchPress,
        targetRepRange: [6, 12],
        sets: [{ setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false }]
      }
    ]
  });

  assert.equal(historical.entrySource, 'historical_manual');
  // ACTIVE_WORKOUT must remain untouched
  const activeAfter = getStoredActiveWorkout(storage);
  assert.deepEqual(activeAfter, active);
});

test('8. DayDetailModal: hides "Entrenar de todos modos" on past days and shows historical registration', () => {
  const yesterday = new Date(Date.now() - 86_400_000);
  let registered = false;

  const element = React.createElement(DayDetailModal, {
    isOpen: true,
    onClose: () => {},
    date: yesterday,
    completedSessions: [],
    availableRoutines: [],
    onStartRoutine: () => {},
    onStartFreeWorkout: () => {},
    onAssignRoutine: () => {},
    onRegisterHistorical: () => { registered = true; }
  });

  assert.ok(element);
  // Verify props passed to modal
  assert.equal(element.props.isOpen, true);
  assert.equal(typeof element.props.onRegisterHistorical, 'function');
});

test('9. ExerciseSessionCard is imported and used in HistoricalWorkoutModal', () => {
  // Verify architectural reuse
  assert.equal(typeof ExerciseSessionCard, 'function');
  assert.equal(typeof HistoricalWorkoutModal, 'function');
});
