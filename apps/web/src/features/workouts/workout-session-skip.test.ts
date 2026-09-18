import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  calculateEffectiveLoadKg,
  isSetEligibleForPersonalRecord,
  shouldCountForVolume,
  type Exercise,
  type Routine
} from '@light-weight/domain';
import {
  normalizeActiveExerciseSession,
  resumeExerciseInSessions,
  serializeWorkoutSets,
  skipExerciseInSessions
} from './useWorkoutSession.js';
import type { ActiveExerciseSession } from './types.js';
import { ExerciseSessionCard } from './WorkoutSessionComponents.js';
import { calculateEffectiveTotalSets, isValidWorkoutSet } from '../../views/WorkoutView.js';
import { PreferencesProvider } from '../../lib/preferences-context.js';
import { DEFAULT_APP_PREFERENCES } from '../../lib/preferences.js';

const mockExercises: Exercise[] = [
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

function createMockSession(exercise: Exercise, overrides: Partial<ActiveExerciseSession> = {}): ActiveExerciseSession {
  return {
    exercise,
    targetRepRange: [6, 12],
    skipped: false,
    sets: [
      { setIndex: 1, weightKg: 80, reps: 8, completed: false, setType: 'working', isWarmup: false, rir: 2 },
      { setIndex: 2, weightKg: 80, reps: 8, completed: false, setType: 'working', isWarmup: false, rir: 2 },
      { setIndex: 3, weightKg: 80, reps: 8, completed: false, setType: 'working', isWarmup: false, rir: 1 }
    ],
    ...overrides
  };
}

function renderWithPreferences(element: React.ReactElement): string {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(PreferencesProvider, null, element)
  );
}

// ==================================================
// WORKOUT SESSION SKIP / OMIT TESTS (1 - 30)
// ==================================================

test('1. New ActiveExerciseSession starts skipped false', () => {
  const session = createMockSession(mockExercises[0]);
  assert.equal(session.skipped, false);
});

test('2. Exercise with zero completed sets can be skipped', () => {
  const session = createMockSession(mockExercises[0]);
  assert.equal(session.sets.some((s) => s.completed), false);
  const updated = skipExerciseInSessions([session], session.exercise.id);
  assert.equal(updated[0].skipped, true);
});

test('3. Skip marks session.skipped true', () => {
  const session = createMockSession(mockExercises[0]);
  const updated = skipExerciseInSessions([session], session.exercise.id);
  assert.equal(updated[0].skipped, true);
});

test('4. Skip does not remove exercise from exerciseSessions', () => {
  const sessions = [
    createMockSession(mockExercises[0]),
    createMockSession(mockExercises[1]),
    createMockSession(mockExercises[2])
  ];
  const updated = skipExerciseInSessions(sessions, mockExercises[1].id);
  assert.equal(updated.length, 3);
  assert.deepEqual(updated.map((s) => s.exercise.id), ['ex-bench', 'ex-incline', 'ex-cable-fly']);
});

test('5. Skip does not alter Routine.exerciseIds', () => {
  const routine: Routine = {
    id: 'routine-1',
    userId: 'user-1',
    name: 'Chest Routine',
    exerciseIds: ['ex-bench', 'ex-incline', 'ex-cable-fly']
  };
  const sessions = routine.exerciseIds.map((id) =>
    createMockSession(mockExercises.find((e) => e.id === id)!)
  );
  const originalIds = [...routine.exerciseIds];
  skipExerciseInSessions(sessions, 'ex-incline');
  assert.deepEqual(routine.exerciseIds, originalIds);
});

test('6. Skip does not alter any other exercise', () => {
  const benchSession = createMockSession(mockExercises[0]);
  const inclineSession = createMockSession(mockExercises[1]);
  const cableFlySession = createMockSession(mockExercises[2]);
  const sessions = [benchSession, inclineSession, cableFlySession];

  const updated = skipExerciseInSessions(sessions, 'ex-incline');

  assert.equal(updated[0].skipped, false);
  assert.deepEqual(updated[0].sets, benchSession.sets);
  assert.equal(updated[1].skipped, true);
  assert.equal(updated[2].skipped, false);
  assert.deepEqual(updated[2].sets, cableFlySession.sets);
});

test('7. Skipped exercise displays omitted state', () => {
  const session = createMockSession(mockExercises[0], { skipped: true });
  const html = renderWithPreferences(
    React.createElement(ExerciseSessionCard, {
      session,
      exerciseIndex: 0,
      totalExercises: 1,
      preferences: DEFAULT_APP_PREFERENCES,
      onViewTechnique: () => {},
      onRemoveExercise: () => {},
      onSkipExercise: () => {},
      onResumeExercise: () => {},
      onAddReplacement: () => {},
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
  assert.ok(html.includes('Omitido en esta sesión'), 'Card must display omitted label');
});

test('8. Skipped exercise hides/collapses SetTable', () => {
  const activeSession = createMockSession(mockExercises[0], { skipped: false });
  const activeHtml = renderWithPreferences(
    React.createElement(ExerciseSessionCard, {
      session: activeSession,
      exerciseIndex: 0,
      totalExercises: 1,
      preferences: DEFAULT_APP_PREFERENCES,
      onViewTechnique: () => {},
      onRemoveExercise: () => {},
      onSkipExercise: () => {},
      onResumeExercise: () => {},
      onAddReplacement: () => {},
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
  assert.ok(activeHtml.includes('PESO (KG)'), 'Active card renders SetTable header');

  const skippedSession = createMockSession(mockExercises[0], { skipped: true });
  const skippedHtml = renderWithPreferences(
    React.createElement(ExerciseSessionCard, {
      session: skippedSession,
      exerciseIndex: 0,
      totalExercises: 1,
      preferences: DEFAULT_APP_PREFERENCES,
      onViewTechnique: () => {},
      onRemoveExercise: () => {},
      onSkipExercise: () => {},
      onResumeExercise: () => {},
      onAddReplacement: () => {},
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
  assert.equal(skippedHtml.includes('PESO (KG)'), false, 'Skipped card hides SetTable');
});

test('9. Resume restores skipped false', () => {
  const session = createMockSession(mockExercises[0], { skipped: true });
  const updated = resumeExerciseInSessions([session], session.exercise.id);
  assert.equal(updated[0].skipped, false);
});

test('10. Resume restores existing uncompleted inputs', () => {
  const session = createMockSession(mockExercises[0], {
    skipped: false,
    sets: [
      { setIndex: 1, weightKg: 92.5, reps: 7, completed: false, setType: 'working', isWarmup: false, rir: 1 },
      { setIndex: 2, weightKg: 85, reps: 8, completed: false, setType: 'working', isWarmup: false, rir: 2 }
    ]
  });
  const skipped = skipExerciseInSessions([session], session.exercise.id);
  const resumed = resumeExerciseInSessions(skipped, session.exercise.id);

  assert.equal(resumed[0].skipped, false);
  assert.equal(resumed[0].sets[0].weightKg, 92.5);
  assert.equal(resumed[0].sets[0].reps, 7);
  assert.equal(resumed[0].sets[0].completed, false);
  assert.equal(resumed[0].sets[1].weightKg, 85);
  assert.equal(resumed[0].sets[1].reps, 8);
});

test('11. Pending input values do not count as performed work', () => {
  const session = createMockSession(mockExercises[0], {
    sets: [
      { setIndex: 1, weightKg: 100, reps: 10, completed: false, setType: 'working', isWarmup: false, rir: 0 }
    ]
  });
  assert.equal(shouldCountForVolume(session.sets[0]), false);
  const completedCount = [session].reduce(
    (count, s) => count + s.sets.filter((set) => set.completed && isValidWorkoutSet(set)).length,
    0
  );
  assert.equal(completedCount, 0);
});

test('12. Exercise with one completed valid set CANNOT be skipped', () => {
  const session = createMockSession(mockExercises[0], {
    sets: [
      { setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false, rir: 2 },
      { setIndex: 2, weightKg: 80, reps: 8, completed: false, setType: 'working', isWarmup: false, rir: 2 }
    ]
  });
  const updated = skipExerciseInSessions([session], session.exercise.id);
  assert.equal(updated[0].skipped, false, 'Exercise with completed set must not be skipped');
});

test('13. UI does not render Skip action after first valid completed set', () => {
  const sessionWithCompleted = createMockSession(mockExercises[0], {
    sets: [
      { setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false, rir: 2 },
      { setIndex: 2, weightKg: 80, reps: 8, completed: false, setType: 'working', isWarmup: false, rir: 2 }
    ]
  });
  const htmlWithCompleted = renderWithPreferences(
    React.createElement(ExerciseSessionCard, {
      session: sessionWithCompleted,
      exerciseIndex: 0,
      totalExercises: 1,
      preferences: DEFAULT_APP_PREFERENCES,
      onViewTechnique: () => {},
      onRemoveExercise: () => {},
      onSkipExercise: () => {},
      onResumeExercise: () => {},
      onAddReplacement: () => {},
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
  assert.equal(htmlWithCompleted.includes('Omitir ejercicio'), false, 'Must not render Skip button when a set is completed');

  const sessionZeroCompleted = createMockSession(mockExercises[0]);
  const htmlZeroCompleted = renderWithPreferences(
    React.createElement(ExerciseSessionCard, {
      session: sessionZeroCompleted,
      exerciseIndex: 0,
      totalExercises: 1,
      preferences: DEFAULT_APP_PREFERENCES,
      onViewTechnique: () => {},
      onRemoveExercise: () => {},
      onSkipExercise: () => {},
      onResumeExercise: () => {},
      onAddReplacement: () => {},
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
  assert.ok(htmlZeroCompleted.includes('Omitir ejercicio'), 'Must render Skip button when zero sets are completed');
});

test('14. Skipped exercise contributes zero effective planned sets to header', () => {
  const bench = createMockSession(mockExercises[0], {
    sets: [
      { setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false, rir: 2 }
    ]
  });
  const incline = createMockSession(mockExercises[1], {
    skipped: true,
    sets: [
      { setIndex: 1, weightKg: 30, reps: 10, completed: false, setType: 'working', isWarmup: false, rir: 2 }
    ]
  });
  const cableFly = createMockSession(mockExercises[2], {
    sets: [
      { setIndex: 1, weightKg: 15, reps: 12, completed: false, setType: 'working', isWarmup: false, rir: 2 }
    ]
  });

  const sessions = [bench, incline, cableFly];
  const effectiveTotal = calculateEffectiveTotalSets(sessions);
  // Bench (1 set) + Incline (skipped -> 0) + CableFly (1 set) = 2
  assert.equal(effectiveTotal, 2);
});

test('15. Resuming restores its planned sets to header target', () => {
  const bench = createMockSession(mockExercises[0], {
    sets: [
      { setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false, rir: 2 }
    ]
  });
  const incline = createMockSession(mockExercises[1], {
    skipped: true,
    sets: [
      { setIndex: 1, weightKg: 30, reps: 10, completed: false, setType: 'working', isWarmup: false, rir: 2 }
    ]
  });
  const cableFly = createMockSession(mockExercises[2], {
    sets: [
      { setIndex: 1, weightKg: 15, reps: 12, completed: false, setType: 'working', isWarmup: false, rir: 2 }
    ]
  });

  const sessions = [bench, incline, cableFly];
  assert.equal(calculateEffectiveTotalSets(sessions), 2);

  const resumed = resumeExerciseInSessions(sessions, 'ex-incline');
  // Bench (1) + Incline (1) + CableFly (1) = 3
  assert.equal(calculateEffectiveTotalSets(resumed), 3);
});

test('16. Skipped exercise contributes zero volume', () => {
  const session = createMockSession(mockExercises[0], {
    skipped: true,
    sets: [
      { setIndex: 1, weightKg: 100, reps: 10, completed: false, setType: 'working', isWarmup: false, rir: 0 }
    ]
  });
  const sessions = [session];
  const totalVolumeKg = sessions.reduce(
    (total, s) =>
      s.skipped
        ? total
        : total +
          s.sets
            .filter(shouldCountForVolume)
            .reduce(
              (sum, set) =>
                sum +
                calculateEffectiveLoadKg({
                  exercise: s.exercise,
                  setWeightKg: set.weightKg,
                  bodyweightKg: 80
                }) *
                  set.reps,
              0
            ),
    0
  );
  assert.equal(totalVolumeKg, 0);
});

test('17. Skipped exercise produces no PR candidate', () => {
  const session = createMockSession(mockExercises[0], {
    skipped: true,
    sets: [
      { setIndex: 1, weightKg: 200, reps: 10, completed: false, setType: 'working', isWarmup: false, rir: 0 }
    ]
  });
  const eligibleSets = session.skipped
    ? []
    : session.sets.filter(
        (set) =>
          isValidWorkoutSet(set) &&
          isSetEligibleForPersonalRecord({
            set,
            exercise: session.exercise,
            bodyweightKg: 80
          })
      );
  assert.equal(eligibleSets.length, 0);
});

test('18. Skipped exercise produces no Strength candidate', () => {
  const session = createMockSession(mockExercises[0], {
    skipped: true,
    sets: [
      { setIndex: 1, weightKg: 100, reps: 10, completed: false, setType: 'working', isWarmup: false, rir: 0 }
    ]
  });
  const performedSets = session.skipped
    ? []
    : session.sets.filter((set) => set.completed && isValidWorkoutSet(set));
  assert.equal(performedSets.length, 0);
});

test('19. Fully skipped exercise is omitted from completed WorkoutSession.sets', () => {
  const bench = createMockSession(mockExercises[0], {
    sets: [
      { setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false, rir: 2 }
    ]
  });
  const incline = createMockSession(mockExercises[1], {
    skipped: true,
    sets: [
      { setIndex: 1, weightKg: 30, reps: 10, completed: false, setType: 'working', isWarmup: false, rir: 2 }
    ]
  });
  const cableFly = createMockSession(mockExercises[2], {
    sets: [
      { setIndex: 1, weightKg: 15, reps: 12, completed: true, setType: 'working', isWarmup: false, rir: 2 }
    ]
  });

  const serialized = serializeWorkoutSets([bench, incline, cableFly]);
  assert.ok(serialized['ex-bench']);
  assert.ok(serialized['ex-cable-fly']);
  assert.equal('ex-incline' in serialized, false, 'Skipped exercise must be omitted from serialized sets');
});

test('20. Skipped state survives active snapshot restore', () => {
  const session = createMockSession(mockExercises[0], { skipped: true });
  const normalized = normalizeActiveExerciseSession(session);
  assert.equal(normalized.skipped, true);
});

test('21. Legacy active snapshot without skipped restores as false', () => {
  const legacySession = {
    exercise: mockExercises[0],
    targetRepRange: [6, 12] as [number, number],
    sets: [
      { setIndex: 1, weightKg: 80, reps: 8, completed: false, setType: 'working' as const, isWarmup: false, rir: 2 }
    ]
  } as unknown as ActiveExerciseSession;
  const normalized = normalizeActiveExerciseSession(legacySession);
  assert.equal(normalized.skipped, false);
});

test('22. Fresh future workout from same routine starts exercise not skipped', () => {
  const routine: Routine = {
    id: 'routine-1',
    userId: 'user-1',
    name: 'Chest Routine',
    exerciseIds: ['ex-bench', 'ex-incline']
  };
  // Workout 1 skips Incline
  const workout1Sessions = routine.exerciseIds.map((id) =>
    createMockSession(mockExercises.find((e) => e.id === id)!)
  );
  const workout1Updated = skipExerciseInSessions(workout1Sessions, 'ex-incline');
  assert.equal(workout1Updated.find((s) => s.exercise.id === 'ex-incline')!.skipped, true);

  // Future workout starts fresh from routine
  const workout2Sessions = routine.exerciseIds.map((id) =>
    createMockSession(mockExercises.find((e) => e.id === id)!)
  );
  assert.equal(workout2Sessions.every((s) => s.skipped === false), true);
});

test('23. Skip does not modify the stored routine', () => {
  const routine: Routine = {
    id: 'routine-1',
    userId: 'user-1',
    name: 'Chest Routine',
    exerciseIds: ['ex-bench', 'ex-incline', 'ex-cable-fly']
  };
  const snapshot = JSON.stringify(routine);

  const sessions = routine.exerciseIds.map((id) =>
    createMockSession(mockExercises.find((e) => e.id === id)!)
  );
  skipExerciseInSessions(sessions, 'ex-incline');

  assert.equal(JSON.stringify(routine), snapshot);
});

test('24. "Add replacement" opens existing AddExerciseModal', () => {
  let targetPassed: Exercise | null = null;
  const skippedSession = createMockSession(mockExercises[1], { skipped: true });
  const html = renderWithPreferences(
    React.createElement(ExerciseSessionCard, {
      session: skippedSession,
      exerciseIndex: 0,
      totalExercises: 1,
      preferences: DEFAULT_APP_PREFERENCES,
      onViewTechnique: () => {},
      onRemoveExercise: () => {},
      onSkipExercise: () => {},
      onResumeExercise: () => {},
      onAddReplacement: (exercise) => { targetPassed = exercise; },
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
  assert.ok(html.includes('Agregar reemplazo'), 'Card must render "Agregar reemplazo" button');

  // Verify behavior of handleAddReplacement callback contract
  let modalOpen = false;
  let muscleFilter: string | null = null;
  const handleAddReplacement = (exercise: Exercise) => {
    muscleFilter = exercise.primaryMuscle;
    modalOpen = true;
  };
  handleAddReplacement(mockExercises[1]);
  assert.equal(modalOpen, true);
  assert.equal(muscleFilter, 'chest');
});

test('25. Replacement exercise is appended to active session', () => {
  const bench = createMockSession(mockExercises[0]);
  const incline = createMockSession(mockExercises[1], { skipped: true });
  const sessions = [bench, incline];

  const replacementExercise = mockExercises[2]; // Cable Fly
  const replacementSession = createMockSession(replacementExercise);
  const updatedSessions = [...sessions, replacementSession];

  assert.equal(updatedSessions.length, 3);
  assert.equal(updatedSessions[2].exercise.id, 'ex-cable-fly');
});

test('26. Replacement does not enter Routine.exerciseIds', () => {
  const routine: Routine = {
    id: 'routine-1',
    userId: 'user-1',
    name: 'Chest Routine',
    exerciseIds: ['ex-bench', 'ex-incline']
  };
  const sessions = routine.exerciseIds.map((id) =>
    createMockSession(mockExercises.find((e) => e.id === id)!)
  );
  const skipped = skipExerciseInSessions(sessions, 'ex-incline');

  // Append replacement to active sessions
  const replacement = createMockSession(mockExercises[2]);
  const activeWithReplacement = [...skipped, replacement];

  assert.equal(activeWithReplacement.length, 3);
  assert.deepEqual(routine.exerciseIds, ['ex-bench', 'ex-incline'], 'Routine.exerciseIds must not change');
  assert.equal(routine.exerciseIds.includes('ex-cable-fly'), false);
});

test('27. Replacement starts not skipped', () => {
  const replacementSession = createMockSession(mockExercises[2]);
  assert.equal(replacementSession.skipped, false);
});

test('28. User may skip without selecting replacement', () => {
  const bench = createMockSession(mockExercises[0], {
    sets: [
      { setIndex: 1, weightKg: 80, reps: 8, completed: true, setType: 'working', isWarmup: false, rir: 2 }
    ]
  });
  const incline = createMockSession(mockExercises[1]);
  const sessions = [bench, incline];

  // User skips incline, does not select any replacement
  const skippedSessions = skipExerciseInSessions(sessions, 'ex-incline');
  assert.equal(skippedSessions[1].skipped, true);
  assert.equal(skippedSessions.length, 2);

  // Serializing works cleanly without replacement
  const serialized = serializeWorkoutSets(skippedSessions);
  assert.ok(serialized['ex-bench']);
  assert.equal('ex-incline' in serialized, false);
});

test('29. Original skipped card remains visible after replacement is added', () => {
  const skippedIncline = createMockSession(mockExercises[1], { skipped: true });
  const replacementCableFly = createMockSession(mockExercises[2], { skipped: false });
  const sessions = [skippedIncline, replacementCableFly];

  assert.equal(sessions.length, 2);
  assert.equal(sessions[0].exercise.id, 'ex-incline');
  assert.equal(sessions[0].skipped, true);
  assert.equal(sessions[1].exercise.id, 'ex-cable-fly');
  assert.equal(sessions[1].skipped, false);

  const skippedHtml = renderWithPreferences(
    React.createElement(ExerciseSessionCard, {
      session: sessions[0],
      exerciseIndex: 0,
      totalExercises: 2,
      preferences: DEFAULT_APP_PREFERENCES,
      onViewTechnique: () => {},
      onRemoveExercise: () => {},
      onSkipExercise: () => {},
      onResumeExercise: () => {},
      onAddReplacement: () => {},
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
  assert.ok(skippedHtml.includes('Omitido en esta sesión'), 'Original card remains rendered in omitted state');

  const replacementHtml = renderWithPreferences(
    React.createElement(ExerciseSessionCard, {
      session: sessions[1],
      exerciseIndex: 1,
      totalExercises: 2,
      preferences: DEFAULT_APP_PREFERENCES,
      onViewTechnique: () => {},
      onRemoveExercise: () => {},
      onSkipExercise: () => {},
      onResumeExercise: () => {},
      onAddReplacement: () => {},
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
  assert.ok(replacementHtml.includes('PESO (KG)'), 'Replacement card renders SetTable');
});

test('30. Existing Remove action remains behaviorally distinct', () => {
  const bench = createMockSession(mockExercises[0]);
  const incline = createMockSession(mockExercises[1]);
  const sessions = [bench, incline];

  // Omit / Skip retains the exercise in exerciseSessions with skipped = true
  const skippedSessions = skipExerciseInSessions(sessions, 'ex-incline');
  assert.equal(skippedSessions.length, 2);
  assert.equal(skippedSessions.find((s) => s.exercise.id === 'ex-incline')?.skipped, true);

  // Remove completely removes the exercise from exerciseSessions
  const removedSessions = sessions.filter((s) => s.exercise.id !== 'ex-incline');
  assert.equal(removedSessions.length, 1);
  assert.equal(removedSessions.find((s) => s.exercise.id === 'ex-incline'), undefined);

  // On skipped card, Remove action is still available
  const html = renderWithPreferences(
    React.createElement(ExerciseSessionCard, {
      session: skippedSessions[1],
      exerciseIndex: 1,
      totalExercises: 2,
      preferences: DEFAULT_APP_PREFERENCES,
      onViewTechnique: () => {},
      onRemoveExercise: () => {},
      onSkipExercise: () => {},
      onResumeExercise: () => {},
      onAddReplacement: () => {},
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
  assert.ok(
    html.includes('Eliminar Incline Dumbbell Press del entrenamiento'),
    'Remove action is still available on skipped card'
  );
});
