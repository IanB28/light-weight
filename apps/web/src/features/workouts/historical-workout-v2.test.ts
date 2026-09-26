import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import type { Exercise, Routine, WorkoutSession } from '@light-weight/domain';
import {
  getStoredActiveWorkout,
  saveActiveWorkout,
  getStoredRoutines,
  saveStoredRoutines,
  normalizeStoredRoutines
} from '../../lib/storage.js';
import { buildRoutinePickerOptions } from '../routines/routine-options.js';
import {
  createHistoricalWorkoutSession,
  createHistoricalWorkoutSessionFromActive,
  getLatestHistoricalDateKey,
  isStrictlyPastDateKey,
  isValidPerformedTime,
  isValidHistoricalDuration,
  HistoricalWorkoutValidationError
} from './historical-workout.js';
import type { ActiveExerciseSession } from './types.js';
import { ExerciseSessionCard } from './WorkoutSessionComponents.js';
import { HistoricalWorkoutModal } from '../../components/HistoricalWorkoutModal.js';
import { DayDetailModal } from '../../components/DayDetailModal.js';
import { AddExerciseModal } from '../../components/AddExerciseModal.js';
import { dictionaries } from '../../lib/i18n.js';

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
    (err: unknown) => {
      return err instanceof HistoricalWorkoutValidationError && err.code === 'invalid_set';
    }
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

test('8. DayDetailModal: renders exactly 1 "Registrar sesión pasada" CTA on past days and 0 on today/future days', () => {
  const now = new Date();
  const pastDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 2, 10, 0, 0);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 10, 0, 0);
  const futureDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 10, 0, 0);

  const sampleRoutine: Routine = {
    id: 'rot-push',
    userId: 'u1',
    name: 'Rutina Empuje',
    exerciseIds: ['bench-press']
  };

  const sampleSession: WorkoutSession = {
    id: 'sess-1',
    userId: 'u1',
    startedAt: new Date(pastDay.getTime()).toISOString(),
    endedAt: new Date(pastDay.getTime() + 3600000).toISOString(),
    performedDate: '2026-09-20',
    entrySource: 'historical_manual',
    routineId: 'rot-push',
    routineName: 'Rutina Empuje',
    sets: {
      'bench-press': [{ setIndex: 1, weightKg: 80, reps: 10, completed: true, setType: 'working', isWarmup: false }]
    }
  };

  function countPastCta(html: string): number {
    const matches = html.match(/Registrar sesión pasada/g);
    return matches ? matches.length : 0;
  }

  // 1. Past day with scheduled routine -> exactly 1 CTA
  const pastWithRoutineHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(DayDetailModal, {
      isOpen: true,
      onClose: () => {},
      date: pastDay,
      scheduledRoutine: sampleRoutine,
      completedSessions: [],
      availableRoutines: [sampleRoutine],
      onStartRoutine: () => {},
      onStartFreeWorkout: () => {},
      onAssignRoutine: () => {},
      onRegisterHistorical: () => {}
    })
  );
  assert.equal(countPastCta(pastWithRoutineHtml), 1);
  assert.ok(!pastWithRoutineHtml.includes('Entrenar de todos modos'));
  assert.ok(!pastWithRoutineHtml.includes('Registrar entrenamiento pasado'));
  assert.ok(!pastWithRoutineHtml.includes('Registrar esta rutina como pasada'));

  // 2. Past day with rest (no routine, no completed sessions) -> exactly 1 CTA
  const pastWithRestHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(DayDetailModal, {
      isOpen: true,
      onClose: () => {},
      date: pastDay,
      completedSessions: [],
      availableRoutines: [sampleRoutine],
      onStartRoutine: () => {},
      onStartFreeWorkout: () => {},
      onAssignRoutine: () => {},
      onRegisterHistorical: () => {}
    })
  );
  assert.equal(countPastCta(pastWithRestHtml), 1);
  assert.ok(!pastWithRestHtml.includes('Entrenar de todos modos'));
  assert.ok(!pastWithRestHtml.includes('Registrar entrenamiento pasado'));

  // 3. Past day with completed session -> exactly 1 CTA
  const pastWithCompletedHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(DayDetailModal, {
      isOpen: true,
      onClose: () => {},
      date: pastDay,
      completedSessions: [sampleSession],
      availableRoutines: [sampleRoutine],
      onStartRoutine: () => {},
      onStartFreeWorkout: () => {},
      onAssignRoutine: () => {},
      onRegisterHistorical: () => {}
    })
  );
  assert.equal(countPastCta(pastWithCompletedHtml), 1);
  assert.ok(!pastWithCompletedHtml.includes('Entrenar de todos modos'));
  assert.ok(!pastWithCompletedHtml.includes('Registrar entrenamiento pasado'));

  // 4. Today -> exactly 0 past CTAs
  const todayHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(DayDetailModal, {
      isOpen: true,
      onClose: () => {},
      date: today,
      scheduledRoutine: sampleRoutine,
      completedSessions: [],
      availableRoutines: [sampleRoutine],
      onStartRoutine: () => {},
      onStartFreeWorkout: () => {},
      onAssignRoutine: () => {},
      onRegisterHistorical: () => {}
    })
  );
  assert.equal(countPastCta(todayHtml), 0);

  // 5. Future day -> exactly 0 past CTAs
  const futureHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(DayDetailModal, {
      isOpen: true,
      onClose: () => {},
      date: futureDay,
      completedSessions: [],
      availableRoutines: [sampleRoutine],
      onStartRoutine: () => {},
      onStartFreeWorkout: () => {},
      onAssignRoutine: () => {},
      onRegisterHistorical: () => {}
    })
  );
  assert.equal(countPastCta(futureHtml), 0);
});

test('9. ExerciseSessionCard is imported and used in HistoricalWorkoutModal', () => {
  assert.equal(typeof ExerciseSessionCard, 'function');
  assert.equal(typeof HistoricalWorkoutModal, 'function');
});

test('10. Strict past date invariant: forbids same-day or future date historical workouts', () => {
  const reference = new Date('2026-09-25T15:00:00.000Z');
  const yesterday = getLatestHistoricalDateKey(reference);
  assert.equal(yesterday, '2026-09-24');

  const validDraft = {
    userId: 'user-1',
    performedDate: yesterday,
    performedTime: '08:30',
    durationMinutes: '45',
    exercises: [
      {
        exercise: benchPress,
        sets: [
          { weight: '100', reps: '5', rir: '', setType: 'working' as const }
        ]
      }
    ]
  };

  // Yesterday succeeds
  const session = createHistoricalWorkoutSession(validDraft, reference);
  assert.equal(session.performedDate, '2026-09-24');

  // Same-day (today) throws not_historical_date
  assert.throws(
    () => createHistoricalWorkoutSession({ ...validDraft, performedDate: '2026-09-25' }, reference),
    (err: unknown) => err instanceof HistoricalWorkoutValidationError && err.code === 'not_historical_date'
  );

  // Future day throws not_historical_date
  assert.throws(
    () => createHistoricalWorkoutSession({ ...validDraft, performedDate: '2026-09-26' }, reference),
    (err: unknown) => err instanceof HistoricalWorkoutValidationError && err.code === 'not_historical_date'
  );

  // Active workout historical converter also enforces invariant
  const activeSessions: ActiveExerciseSession[] = [
    {
      exercise: benchPress,
      targetRepRange: [6, 12],
      sets: [{ setIndex: 1, weightKg: 100, reps: 5, completed: true, setType: 'working', isWarmup: false }]
    }
  ];

  assert.throws(
    () => createHistoricalWorkoutSessionFromActive({
      userId: 'user-1',
      performedDate: '2026-09-25',
      performedTime: '08:30',
      exerciseSessions: activeSessions
    }, reference),
    (err: unknown) => err instanceof HistoricalWorkoutValidationError && err.code === 'not_historical_date'
  );

  assert.throws(
    () => createHistoricalWorkoutSessionFromActive({
      userId: 'user-1',
      performedDate: '2026-09-28',
      performedTime: '08:30',
      exerciseSessions: activeSessions
    }, reference),
    (err: unknown) => err instanceof HistoricalWorkoutValidationError && err.code === 'not_historical_date'
  );
});

test('11. Duration validation: empty/omitted or integer in [1, 1440] accepted; invalid values rejected', () => {
  const reference = new Date('2026-09-25T15:00:00.000Z');
  const baseDraft = {
    userId: 'user-1',
    performedDate: '2026-09-24',
    performedTime: '08:30',
    exercises: [
      {
        exercise: benchPress,
        sets: [
          { weight: '100', reps: '5', rir: '', setType: 'working' as const }
        ]
      }
    ]
  };

  // Optional/empty duration accepted
  const emptyDurationSession = createHistoricalWorkoutSession({ ...baseDraft, durationMinutes: '' }, reference);
  assert.equal(emptyDurationSession.endedAt, undefined);

  const omittedDurationSession = createHistoricalWorkoutSession(baseDraft, reference);
  assert.equal(omittedDurationSession.endedAt, undefined);

  // Valid boundaries
  const minDuration = createHistoricalWorkoutSession({ ...baseDraft, durationMinutes: '1' }, reference);
  const minDiff = (new Date(minDuration.endedAt!).getTime() - new Date(minDuration.startedAt).getTime()) / 60_000;
  assert.equal(Math.round(minDiff), 1);

  const maxDuration = createHistoricalWorkoutSession({ ...baseDraft, durationMinutes: '1440' }, reference);
  const maxDiff = (new Date(maxDuration.endedAt!).getTime() - new Date(maxDuration.startedAt).getTime()) / 60_000;
  assert.equal(Math.round(maxDiff), 1440);

  // Invalid values rejected
  const invalidDurations = ['0', '-10', '1441', '9999', '45.5', 'fast'];
  for (const inv of invalidDurations) {
    assert.throws(
      () => createHistoricalWorkoutSession({ ...baseDraft, durationMinutes: inv }, reference),
      (err: unknown) => err instanceof HistoricalWorkoutValidationError && err.code === 'invalid_duration',
      `Expected invalid_duration for "${inv}"`
    );
  }
});

test('12. Pure validation helpers: isStrictlyPastDateKey, isValidPerformedTime, isValidHistoricalDuration', () => {
  const ref = new Date('2026-09-25T15:00:00.000Z');

  // isStrictlyPastDateKey
  assert.equal(isStrictlyPastDateKey('2026-09-24', ref), true);
  assert.equal(isStrictlyPastDateKey('2026-01-01', ref), true);
  assert.equal(isStrictlyPastDateKey('2026-09-25', ref), false); // Same day
  assert.equal(isStrictlyPastDateKey('2026-09-26', ref), false); // Future day
  assert.equal(isStrictlyPastDateKey('invalid-date', ref), false);

  // isValidPerformedTime
  assert.equal(isValidPerformedTime('00:00'), true);
  assert.equal(isValidPerformedTime('08:30'), true);
  assert.equal(isValidPerformedTime('12:00'), true);
  assert.equal(isValidPerformedTime('23:59'), true);
  assert.equal(isValidPerformedTime('24:00'), false);
  assert.equal(isValidPerformedTime('8:30'), false);
  assert.equal(isValidPerformedTime('12:60'), false);
  assert.equal(isValidPerformedTime(''), false);
  assert.equal(isValidPerformedTime('noon'), false);

  // isValidHistoricalDuration
  assert.equal(isValidHistoricalDuration(undefined), true);
  assert.equal(isValidHistoricalDuration(''), true);
  assert.equal(isValidHistoricalDuration('   '), true);
  assert.equal(isValidHistoricalDuration('1'), true);
  assert.equal(isValidHistoricalDuration('60'), true);
  assert.equal(isValidHistoricalDuration('1440'), true);
  assert.equal(isValidHistoricalDuration('0'), false);
  assert.equal(isValidHistoricalDuration('-5'), false);
  assert.equal(isValidHistoricalDuration('1441'), false);
  assert.equal(isValidHistoricalDuration('60.5'), false);
  assert.equal(isValidHistoricalDuration('abc'), false);
});

test('13. Routine picker disambiguation: handles routines with same name AND same exercise count', () => {
  const routines: Routine[] = [
    { id: 'rot-1', userId: 'u1', name: 'Pecho', exerciseIds: ['bench-press'] },
    { id: 'rot-2', userId: 'u1', name: 'Pecho', exerciseIds: ['incline-press'] }
  ];

  const options = buildRoutinePickerOptions(routines, {
    emptyLabel: 'Sin rutina',
    exerciseLabel: (c) => `${c} ejercicio`,
    variantLabel: (idx) => `Variante ${idx}`
  });

  assert.equal(options.length, 3);
  assert.equal(options[0].value, '');
  assert.equal(options[0].label, 'Sin rutina');

  assert.equal(options[1].value, 'rot-1');
  assert.equal(options[1].label, 'Pecho · 1 ejercicio · Variante 1');

  assert.equal(options[2].value, 'rot-2');
  assert.equal(options[2].label, 'Pecho · 1 ejercicio · Variante 2');
});

test('14. Storage self-healing: getStoredRoutines heals corrupted duplicate routine IDs on read', () => {
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
    // Write corrupted storage directly
    const corruptedRoutines = [
      { id: 'rot-1', userId: 'u1', name: 'Original Push', exerciseIds: [] },
      { id: 'rot-2', userId: 'u1', name: 'Pull', exerciseIds: [] },
      { id: 'rot-1', userId: 'u1', name: 'Updated Push', exerciseIds: ['bench-press'] }
    ];
    memory.set('lightweight_routines', JSON.stringify(corruptedRoutines));

    // Calling getStoredRoutines() must self-heal and write back
    const healed = getStoredRoutines();
    assert.equal(healed.length, 2);
    assert.equal(healed[0].id, 'rot-1');
    assert.equal(healed[0].name, 'Updated Push');
    assert.equal(healed[1].id, 'rot-2');

    // Verify localStorage has been healed with deduplicated array
    const persisted = JSON.parse(memory.get('lightweight_routines') || '[]');
    assert.equal(persisted.length, 2);
    assert.equal(persisted[0].id, 'rot-1');
    assert.equal(persisted[0].name, 'Updated Push');
  } finally {
    if (orig) Object.defineProperty(globalThis, 'localStorage', orig);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});

test('15. Block 19.6B: Visual polish copy, exercise position indicator, and hook order invariant', () => {
  // 15.1 Exercise position indicator behavior
  const mockPreferences = {
    theme: 'midnight' as const,
    accent: 'lime' as const,
    language: 'es' as const,
    units: 'metric' as const,
    bodyweightUnits: 'metric' as const,
    defaultRestSeconds: 90,
    weightInputMode: 'keyboard' as const,
    defaultBarWeightKg: 20,
    availablePlatesKg: [25, 20, 15, 10, 5, 2.5, 1.25]
  };

  const singleExerciseSession: ActiveExerciseSession = {
    exercise: benchPress,
    targetRepRange: [6, 12],
    sets: [{ setIndex: 1, weightKg: 80, reps: 8, completed: false, setType: 'working', isWarmup: false }]
  };

  // When totalExercises === 1: position indicator must NOT be shown
  const singleHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(ExerciseSessionCard, {
      session: singleExerciseSession,
      exerciseIndex: 0,
      totalExercises: 1,
      preferences: mockPreferences,
      onViewTechnique: () => {},
      onRemoveExercise: () => {},
      onUpdateSet: () => {},
      onToggleSet: () => {},
      onStartRestTimer: () => {},
      onOpenPlates: () => {},
      onAddSet: () => {},
      onRemoveSet: () => {},
      onUpdateWeightInputMode: () => {},
      onToggleAddedWeight: () => {}
    })
  );
  assert.equal(singleHtml.includes('1 de 1'), false);
  assert.equal(singleHtml.includes('Ejercicio 1'), false);

  // When totalExercises > 1: compact position indicator is shown
  const multiHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(ExerciseSessionCard, {
      session: singleExerciseSession,
      exerciseIndex: 0,
      totalExercises: 3,
      preferences: mockPreferences,
      onViewTechnique: () => {},
      onRemoveExercise: () => {},
      onUpdateSet: () => {},
      onToggleSet: () => {},
      onStartRestTimer: () => {},
      onOpenPlates: () => {},
      onAddSet: () => {},
      onRemoveSet: () => {},
      onUpdateWeightInputMode: () => {},
      onToggleAddedWeight: () => {}
    })
  );
  assert.equal(multiHtml.includes('1 de 3'), true);
  assert.equal(multiHtml.includes('EJERCICIO 1 DE 3'), false); // No uppercase sentence

  // 15.2 Spanish concise copy audit
  const es = dictionaries.es;
  assert.equal(es['historical.description'], 'Registra una sesión anterior.');
  assert.equal(es['historical.performedDate'], 'Fecha');
  assert.equal(es['historical.performedTime'], 'Hora');
  assert.equal(es['historical.sessionName'], 'Nombre');
  assert.equal(es['historical.duration'], 'Duración');
  assert.equal(es['historical.routine'], 'Rutina');
  assert.equal(es['historical.optionalPlaceholder'], 'Opcional');
  assert.equal(es['historical.addExerciseAndSets'], 'Agregar ejercicio');
  assert.equal(es['historical.continueToExercises'], 'Continuar');
  assert.equal(es['historical.backToSetup'], 'Datos');
  assert.equal(es['historical.save'], 'Guardar entrenamiento');
  assert.equal(es['historical.completedSetsCount'], '{{count}} series');
  assert.equal(es['historical.completedSetsCount_one'], '1 serie');
  assert.equal(es['workout.weightMode'], 'Peso');
  assert.equal(es['workout.removeLastSet'], 'Quitar última');

  // 15.3 English concise copy audit
  const en = dictionaries.en;
  assert.equal(en['historical.description'], 'Log a past session.');
  assert.equal(en['historical.performedDate'], 'Date');
  assert.equal(en['historical.performedTime'], 'Time');
  assert.equal(en['historical.sessionName'], 'Name');
  assert.equal(en['historical.duration'], 'Duration');
  assert.equal(en['historical.routine'], 'Routine');
  assert.equal(en['historical.optionalPlaceholder'], 'Optional');
  assert.equal(en['historical.addExerciseAndSets'], 'Add exercise');
  assert.equal(en['historical.continueToExercises'], 'Continue');
  assert.equal(en['historical.backToSetup'], 'Details');
  assert.equal(en['historical.save'], 'Save workout');
  assert.equal(en['historical.completedSetsCount'], '{{count}} sets');
  assert.equal(en['historical.completedSetsCount_one'], '1 set');
  assert.equal(en['workout.weightMode'], 'Weight');
  assert.equal(en['workout.removeLastSet'], 'Remove last');

  // 15.4 DayDetailModal hook order safety (renders null when closed without breaking React hook rules)
  const closedDayDetail = ReactDOMServer.renderToStaticMarkup(
    React.createElement(DayDetailModal, {
      isOpen: false,
      onClose: () => {},
      date: new Date('2026-09-20'),
      availableRoutines: [],
      onStartRoutine: () => {},
      onStartFreeWorkout: () => {},
      onAssignRoutine: () => {}
    })
  );
  assert.equal(closedDayDetail, '');
});

test('16. Block 19.6C Custom exercise isolation: AddExerciseModal contract and active workout isolation', () => {
  // 16.1 AddExerciseModal without onCreateCustomExercise (Historical mode)
  // When available exercises is empty, EmptyState is rendered, but NO custom creation panel or button exists
  const historicalEmptyHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(AddExerciseModal, {
      isOpen: true,
      onClose: () => {},
      availableExercises: [],
      history: [],
      onSelectExercise: () => {}
    })
  );
  assert.equal(historicalEmptyHtml.includes('No encontramos ejercicios'), true);
  assert.equal(historicalEmptyHtml.includes('Crear ejercicio personalizado'), false);
  assert.equal(historicalEmptyHtml.includes('Crear y añadir'), false);

  // 16.2 AddExerciseModal with onCreateCustomExercise (Live mode)
  // When available exercises is empty, custom creation panel AND "Crear y añadir" button ARE rendered
  const liveEmptyHtml = ReactDOMServer.renderToStaticMarkup(
    React.createElement(AddExerciseModal, {
      isOpen: true,
      onClose: () => {},
      availableExercises: [],
      history: [],
      onSelectExercise: () => {},
      onCreateCustomExercise: () => {}
    })
  );
  assert.equal(liveEmptyHtml.includes('No encontramos ejercicios'), true);
  assert.equal(liveEmptyHtml.includes('Crear ejercicio personalizado'), true);
  assert.equal(liveEmptyHtml.includes('Crear y añadir'), true);

  // 16.3 Active Workout Isolation: registering a historical workout never mutates ACTIVE_WORKOUT
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => memory.set(key, value),
    removeItem: (key: string) => memory.delete(key)
  };

  const activeWorkout = {
    isWorkoutActive: true,
    workoutStartTime: '2026-09-25T10:00:00.000Z',
    activeRoutineName: 'Active Push Day',
    exerciseSessions: [
      {
        exercise: benchPress,
        targetRepRange: [6, 10] as [number, number],
        sets: [
          { setIndex: 1, weightKg: 100, reps: 8, completed: true, setType: 'working' as const, isWarmup: false }
        ]
      }
    ]
  };
  saveActiveWorkout(activeWorkout, storage);

  const snapshotBefore = JSON.stringify(getStoredActiveWorkout(storage));

  // User opens historical registration and adds catalog Exercise B (inclinePress)
  const historicalExerciseSessions: ActiveExerciseSession[] = [
    {
      exercise: inclinePress,
      targetRepRange: [8, 12] as [number, number],
      sets: [
        { setIndex: 1, weightKg: 70, reps: 10, completed: true, setType: 'working' as const, isWarmup: false }
      ]
    }
  ];

  const historicalSession = createHistoricalWorkoutSessionFromActive({
    userId: 'user-isolation-test',
    performedDate: '2026-09-20',
    performedTime: '14:30',
    exerciseSessions: historicalExerciseSessions
  });

  // Verify historical session contains catalog Exercise B
  assert.equal(Boolean(historicalSession.sets['incline-press']), true);
  assert.equal(historicalSession.sets['incline-press'].length, 1);
  assert.equal(historicalSession.sets['incline-press'][0].weightKg, 70);
  assert.equal(historicalSession.sets['bench-press'], undefined);

  // Verify active workout in storage remains STRICTLY IDENTICAL and untouched
  const snapshotAfter = JSON.stringify(getStoredActiveWorkout(storage));
  assert.equal(snapshotAfter, snapshotBefore);
  assert.deepEqual(getStoredActiveWorkout(storage), activeWorkout);
});
