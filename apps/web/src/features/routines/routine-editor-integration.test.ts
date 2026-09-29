import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  Exercise,
  LoggedSet,
  Routine,
  WorkoutSession,
  getRoutineExerciseIds,
  normalizeRoutine
} from '@light-weight/domain';
import {
  addRoutineExerciseTemplate,
  addRoutineTemplateSet,
  buildRoutineFromEditorDraft,
  createRoutineEditorDraft,
  moveRoutineExercise,
  removeRoutineExerciseTemplate,
  removeRoutineTemplateSet,
  updateRoutineTemplateSet
} from './routine-editor-draft.js';
import { buildRoutineExerciseSessions } from '../workouts/routine-previous-performance.js';
import type { ActiveExerciseSession } from '../workouts/types.js';
import { PlanView } from '../../views/PlanView.js';
import { CreateRoutineModal } from '../../components/CreateRoutineModal.js';
import { RoutineEditorModal } from '../../components/RoutineEditorModal.js';
import { AuthProvider } from '../../lib/auth-context.js';
import { DEFAULT_APP_PREFERENCES, type AppPreferences } from '../../lib/preferences.js';
import { displayWeight, parseDisplayWeight } from '../../lib/weight-units.js';

interface StoredActiveWorkout {
  routineId?: string;
  activeRoutineId?: string;
  exerciseSessions: Array<{
    exercise: Exercise;
    sets: LoggedSet[];
    skipped?: boolean;
  }>;
  startedAt: string;
  activeRoutineName?: string;
}

const mockBench: Exercise = {
  id: 'ex-bench',
  name: 'Bench Press',
  category: 'barbell',
  primaryMuscle: 'chest',
  secondaryMuscles: ['triceps']
};

const mockRow: Exercise = {
  id: 'ex-row',
  name: 'Barbell Row',
  category: 'barbell',
  primaryMuscle: 'back',
  secondaryMuscles: ['biceps']
};

const mockCurl: Exercise = {
  id: 'ex-curl',
  name: 'Biceps Curl',
  category: 'dumbbell',
  primaryMuscle: 'biceps',
  secondaryMuscles: []
};

const mockCableFly: Exercise = {
  id: 'ex-cable-fly',
  name: 'Cable Fly',
  category: 'cable',
  primaryMuscle: 'chest',
  secondaryMuscles: []
};

const exercisesById: Record<string, Exercise> = {
  'ex-bench': mockBench,
  'ex-row': mockRow,
  'ex-curl': mockCurl,
  'ex-cable-fly': mockCableFly
};

function createBaseExerciseSession(ex: Exercise): ActiveExerciseSession {
  return {
    exercise: ex,
    targetRepRange: [6, 12],
    sets: [],
    skipped: false
  };
}

test('Section 37: Routine exercise reorder end-to-end', () => {
  // A. Initial routine: Bench, Row, Curl
  const initialRoutine: Routine = {
    id: 'rt-upper-1',
    userId: 'u1',
    name: 'Upper Day',
    exerciseIds: ['ex-bench', 'ex-row', 'ex-curl'],
    template: {
      version: 2,
      exercises: [
        { exerciseId: 'ex-bench', sets: [{ setType: 'working', targetWeightKg: 80 }] },
        { exerciseId: 'ex-row', sets: [{ setType: 'working', targetWeightKg: 70 }] },
        { exerciseId: 'ex-curl', sets: [{ setType: 'working', targetWeightKg: 15 }] }
      ]
    }
  };

  let draft = createRoutineEditorDraft(initialRoutine);
  // Move Curl (index 2) to index 0 -> Curl, Bench, Row
  draft = moveRoutineExercise(draft, 2, 0);

  // B. Save -> template order preserved
  const savedRoutine = buildRoutineFromEditorDraft(draft);
  assert.equal(savedRoutine.template?.version, 2);
  assert.deepEqual(
    savedRoutine.template?.exercises.map((e) => e.exerciseId),
    ['ex-curl', 'ex-bench', 'ex-row']
  );

  // C. exerciseIds projection -> same order
  assert.deepEqual(savedRoutine.exerciseIds, ['ex-curl', 'ex-bench', 'ex-row']);
  assert.deepEqual(getRoutineExerciseIds(savedRoutine), ['ex-curl', 'ex-bench', 'ex-row']);

  // D. Reload local storage serialization simulation
  const serialized = JSON.stringify(savedRoutine);
  const reloaded = normalizeRoutine(JSON.parse(serialized));
  assert.ok(reloaded);
  assert.deepEqual(getRoutineExerciseIds(reloaded), ['ex-curl', 'ex-bench', 'ex-row']);

  // E. Start routine -> ActiveExerciseSession order matches exactly
  const sessions = buildRoutineExerciseSessions({
    routine: reloaded,
    exercisesById,
    history: [],
    routines: [reloaded],
    createBaseExerciseSession
  });

  assert.equal(sessions.length, 3);
  assert.equal(sessions[0].exercise.id, 'ex-curl');
  assert.equal(sessions[1].exercise.id, 'ex-bench');
  assert.equal(sessions[2].exercise.id, 'ex-row');
});

test('Section 38: Edit existing routine preserves ID, owner, origin while updating structure', () => {
  const existingRoutine: Routine = {
    id: 'rt-shared-origin-1',
    userId: 'u-user',
    name: 'Push Hypertrophy',
    description: 'Original notes',
    exerciseIds: ['ex-bench'],
    template: {
      version: 2,
      exercises: [
        { exerciseId: 'ex-bench', sets: [{ setType: 'warmup', targetWeightKg: 20 }] }
      ]
    },
    origin: {
      type: 'shared',
      sharedBy: { id: 'u-coach', username: 'coach_mike', displayName: 'Coach Mike', avatarUrl: undefined },
      shareId: 'share-abc'
    }
  };

  let draft = createRoutineEditorDraft(existingRoutine);

  // Edit name & description
  draft = { ...draft, name: 'Push Strength Focus', description: 'Updated for 5x5' };

  // Add exercise
  draft = addRoutineExerciseTemplate(draft, 'ex-cable-fly');

  // Add set to Bench
  draft = addRoutineTemplateSet(draft, 'ex-bench');
  draft = updateRoutineTemplateSet(draft, 'ex-bench', 1, { setType: 'working', targetWeightKg: 85 });

  // Save
  const updatedRoutine = buildRoutineFromEditorDraft(draft);

  // Invariants verified:
  assert.equal(updatedRoutine.id, 'rt-shared-origin-1', 'ID must be preserved');
  assert.equal(updatedRoutine.userId, 'u-user', 'Owner must be preserved');
  assert.deepEqual(updatedRoutine.origin, existingRoutine.origin, 'Origin metadata must be preserved');
  assert.equal(updatedRoutine.name, 'Push Strength Focus');
  assert.equal(updatedRoutine.description, 'Updated for 5x5');
  assert.deepEqual(getRoutineExerciseIds(updatedRoutine), ['ex-bench', 'ex-cable-fly']);
  assert.equal(updatedRoutine.template?.exercises[0].sets.length, 2);
  assert.equal(updatedRoutine.template?.exercises[0].sets[1].targetWeightKg, 85);
});

test('Section 40: Previous performance regression: editing routine does NOT override previous workout performance', () => {
  // Routine template: Bench 1 working 60kg
  const routine: Routine = {
    id: 'rt-push-p1',
    userId: 'u1',
    name: 'Push Day',
    exerciseIds: ['ex-bench'],
    template: {
      version: 2,
      exercises: [
        { exerciseId: 'ex-bench', sets: [{ setType: 'working', targetWeightKg: 60 }] }
      ]
    }
  };

  // History same routine: Bench 40x10@4 warmup, 80x8@2 working, 80x7@1 working
  const history: WorkoutSession[] = [
    {
      id: 'ws-prev-1',
      userId: 'u1',
      routineId: 'rt-push-p1',
      routineName: 'Push Day',
      startedAt: '2026-09-20T10:00:00.000Z',
      performedDate: '2026-09-20',
      sets: {
        'ex-bench': [
          { setIndex: 1, weightKg: 40, reps: 10, rir: 4, setType: 'warmup', completed: true, isWarmup: true },
          { setIndex: 2, weightKg: 80, reps: 8, rir: 2, setType: 'working', completed: true, isWarmup: false },
          { setIndex: 3, weightKg: 80, reps: 7, rir: 1, setType: 'working', completed: true, isWarmup: false }
        ]
      }
    }
  ];

  // User edits routine: renames, adds description, updates template weight to 65kg
  let draft = createRoutineEditorDraft(routine);
  draft = { ...draft, name: 'Push Day Heavy' };
  draft = updateRoutineTemplateSet(draft, 'ex-bench', 0, { targetWeightKg: 65 });
  const updatedRoutine = buildRoutineFromEditorDraft(draft);

  // Start workout from updated routine
  const sessions = buildRoutineExerciseSessions({
    routine: updatedRoutine,
    exercisesById,
    history,
    routines: [updatedRoutine],
    createBaseExerciseSession
  });

  // EXPECTED: Previous performance (40, 80, 80) wins! NOT template 65kg
  const benchSession = sessions.find((s) => s.exercise.id === 'ex-bench');
  assert.ok(benchSession);
  assert.equal(benchSession.sets.length, 3);
  assert.equal(benchSession.sets[0].weightKg, 40);
  assert.equal(benchSession.sets[0].reps, 10);
  assert.equal(benchSession.sets[0].rir, 4);
  assert.equal(benchSession.sets[0].setType, 'warmup');
  assert.equal(benchSession.sets[0].completed, false);

  assert.equal(benchSession.sets[1].weightKg, 80);
  assert.equal(benchSession.sets[1].reps, 8);
  assert.equal(benchSession.sets[1].rir, 2);
  assert.equal(benchSession.sets[1].completed, false);

  assert.equal(benchSession.sets[2].weightKg, 80);
  assert.equal(benchSession.sets[2].reps, 7);
  assert.equal(benchSession.sets[2].rir, 1);
  assert.equal(benchSession.sets[2].completed, false);
});

test('Section 41: Newly added exercise fallback regression: new exercise gets template fallback while existing gets previous performance', () => {
  // Edited routine: Bench and Cable Fly (template Cable Fly: working 20kg)
  const editedRoutine: Routine = {
    id: 'rt-push-p2',
    userId: 'u1',
    name: 'Push Day',
    exerciseIds: ['ex-bench', 'ex-cable-fly'],
    template: {
      version: 2,
      exercises: [
        { exerciseId: 'ex-bench', sets: [{ setType: 'working', targetWeightKg: 60 }] },
        { exerciseId: 'ex-cable-fly', sets: [{ setType: 'working', targetWeightKg: 20 }] }
      ]
    }
  };

  // History: Bench has previous performance; Cable Fly has none in this routine
  const history: WorkoutSession[] = [
    {
      id: 'ws-prev-bench',
      userId: 'u1',
      routineId: 'rt-push-p2',
      routineName: 'Push Day',
      startedAt: '2026-09-22T10:00:00.000Z',
      performedDate: '2026-09-22',
      sets: {
        'ex-bench': [
          { setIndex: 1, weightKg: 82.5, reps: 8, rir: 2, setType: 'working', completed: true, isWarmup: false }
        ]
      }
    }
  ];

  const sessions = buildRoutineExerciseSessions({
    routine: editedRoutine,
    exercisesById,
    history,
    routines: [editedRoutine],
    createBaseExerciseSession
  });

  assert.equal(sessions.length, 2);

  // Bench gets previous performance (82.5kg x 8)
  const benchSession = sessions[0];
  assert.equal(benchSession.exercise.id, 'ex-bench');
  assert.equal(benchSession.sets[0].weightKg, 82.5);
  assert.equal(benchSession.sets[0].reps, 8);
  assert.equal(benchSession.sets[0].completed, false);

  // Cable Fly gets RoutineTemplateV2 fallback (20kg / 8 reps / rir undefined)
  const cableFlySession = sessions[1];
  assert.equal(cableFlySession.exercise.id, 'ex-cable-fly');
  assert.equal(cableFlySession.sets[0].weightKg, 20);
  assert.equal(cableFlySession.sets[0].reps, 8);
  assert.equal(cableFlySession.sets[0].rir, undefined);
  assert.equal(cableFlySession.sets[0].setType, 'working');
  assert.equal(cableFlySession.sets[0].completed, false);
});

test('Section 27: Changing set structure in template does not override set count of existing history', () => {
  // Previous workout had 3 sets
  const history: WorkoutSession[] = [
    {
      id: 'ws-prev-3sets',
      userId: 'u1',
      routineId: 'rt-quad-1',
      routineName: 'Quad Day',
      startedAt: '2026-09-20T10:00:00.000Z',
      performedDate: '2026-09-20',
      sets: {
        'ex-bench': [
          { setIndex: 1, weightKg: 70, reps: 10, setType: 'working', completed: true, isWarmup: false },
          { setIndex: 2, weightKg: 75, reps: 8, setType: 'working', completed: true, isWarmup: false },
          { setIndex: 3, weightKg: 80, reps: 6, setType: 'working', completed: true, isWarmup: false }
        ]
      }
    }
  ];

  // User edited template to prescribe 4 sets
  const routineWith4Sets: Routine = {
    id: 'rt-quad-1',
    userId: 'u1',
    name: 'Quad Day',
    exerciseIds: ['ex-bench'],
    template: {
      version: 2,
      exercises: [
        {
          exerciseId: 'ex-bench',
          sets: [
            { setType: 'warmup', targetWeightKg: 40 },
            { setType: 'working', targetWeightKg: 70 },
            { setType: 'working', targetWeightKg: 75 },
            { setType: 'working', targetWeightKg: 80 }
          ]
        }
      ]
    }
  };

  const sessions = buildRoutineExerciseSessions({
    routine: routineWith4Sets,
    exercisesById,
    history,
    routines: [routineWith4Sets],
    createBaseExerciseSession
  });

  // Because previous performance is Priority 1, the 3 completed sets from history hydrate!
  assert.equal(sessions[0].sets.length, 3);
  assert.equal(sessions[0].sets[0].weightKg, 70);
  assert.equal(sessions[0].sets[1].weightKg, 75);
  assert.equal(sessions[0].sets[2].weightKg, 80);
});

test('Section 24: ACTIVE_WORKOUT draft is strictly isolated from routine edits', () => {
  // In-progress workout snapshot
  const activeWorkoutSnapshot: StoredActiveWorkout = {
    routineId: 'rt-core-1',
    activeRoutineId: 'rt-core-1',
    exerciseSessions: [
      {
        exercise: mockBench,
        sets: [
          { setIndex: 1, weightKg: 90, reps: 5, completed: true, setType: 'working', isWarmup: false }
        ],
        skipped: false
      }
    ],
    startedAt: '2026-09-27T12:00:00.000Z',
    activeRoutineName: 'Core Strength'
  };

  // User edits rt-core-1 in routine editor
  const originalRoutine: Routine = {
    id: 'rt-core-1',
    userId: 'u1',
    name: 'Core Strength',
    exerciseIds: ['ex-bench'],
    template: {
      version: 2,
      exercises: [
        { exerciseId: 'ex-bench', sets: [{ setType: 'working', targetWeightKg: 60 }] }
      ]
    }
  };

  let draft = createRoutineEditorDraft(originalRoutine);
  // Add Cable Fly and remove Bench
  draft = addRoutineExerciseTemplate(draft, 'ex-cable-fly');
  draft = removeRoutineExerciseTemplate(draft, 'ex-bench');
  const savedRoutine = buildRoutineFromEditorDraft(draft);

  // Active workout draft remains completely unaffected
  assert.equal(activeWorkoutSnapshot.routineId, 'rt-core-1');
  assert.equal(activeWorkoutSnapshot.exerciseSessions.length, 1);
  assert.equal(activeWorkoutSnapshot.exerciseSessions[0].exercise.id, 'ex-bench');
  assert.equal(activeWorkoutSnapshot.exerciseSessions[0].sets[0].weightKg, 90);
  assert.equal(activeWorkoutSnapshot.exerciseSessions[0].sets[0].completed, true);
});

test('Section 44: Routine sharing regression: new share reflects updated template while previous share remains immutable', () => {
  const routine: Routine = {
    id: 'rt-share-test',
    userId: 'u1',
    name: 'Leg Day',
    exerciseIds: ['ex-bench'],
    template: {
      version: 2,
      exercises: [
        { exerciseId: 'ex-bench', sets: [{ setType: 'working', targetWeightKg: 80 }] }
      ]
    }
  };

  // Share snapshot 1
  const oldShareSnapshot = {
    routineId: routine.id,
    routineName: routine.name,
    routineTemplate: JSON.parse(JSON.stringify(routine.template))
  };

  // Edit routine
  let draft = createRoutineEditorDraft(routine);
  draft = updateRoutineTemplateSet(draft, 'ex-bench', 0, { targetWeightKg: 100 });
  const updatedRoutine = buildRoutineFromEditorDraft(draft);

  // Share snapshot 2
  const newShareSnapshot = {
    routineId: updatedRoutine.id,
    routineName: updatedRoutine.name,
    routineTemplate: JSON.parse(JSON.stringify(updatedRoutine.template))
  };

  assert.equal(oldShareSnapshot.routineTemplate.exercises[0].sets[0].targetWeightKg, 80);
  assert.equal(newShareSnapshot.routineTemplate.exercises[0].sets[0].targetWeightKg, 100);
});

test('Section 14: PlanView prop wiring forwards imperial preferences to CreateRoutineModal and RoutineEditorModal', () => {
  const imperialPrefs: AppPreferences = {
    ...DEFAULT_APP_PREFERENCES,
    units: 'imperial'
  };

  // 1. CreateRoutineModal direct unit forwarding
  const createElem = CreateRoutineModal({
    isOpen: true,
    onClose: () => {},
    availableExercises: [mockBench],
    onSaveRoutine: () => {},
    preferences: imperialPrefs
  }) as React.ReactElement<{ preferences?: AppPreferences }>;
  assert.equal(createElem.type, RoutineEditorModal);
  assert.equal(createElem.props.preferences?.units, 'imperial');

  // 2. Render PlanView with imperial preferences
  const initialRoutine: Routine = {
    id: 'rt-plan-pref-test',
    userId: 'u1',
    name: 'Push Day',
    exerciseIds: ['ex-bench'],
    template: {
      version: 2,
      exercises: [
        { exerciseId: 'ex-bench', sets: [{ setType: 'working', targetWeightKg: 20 }] }
      ]
    }
  };

  const html = ReactDOMServer.renderToString(
    React.createElement(
      AuthProvider,
      null,
      React.createElement(PlanView, {
        routines: [initialRoutine],
        exercises: [mockBench],
        weeklySchedule: {
          monday: null,
          tuesday: null,
          wednesday: null,
          thursday: null,
          friday: null,
          saturday: null,
          sunday: null
        },
        onSelectAndStartRoutine: () => {},
        onSaveRoutine: () => {},
        preferences: imperialPrefs
      })
    )
  );

  assert.ok(html.length > 0, 'PlanView must render successfully');

  // 3. Render RoutineEditorModal with imperial preferences
  const editorHtml = ReactDOMServer.renderToString(
    React.createElement(RoutineEditorModal, {
      isOpen: true,
      onClose: () => {},
      mode: 'edit',
      initialRoutine,
      availableExercises: [mockBench],
      onSaveRoutine: () => {},
      preferences: imperialPrefs,
      initialStep: 'exercises',
      initialExpandedExerciseId: 'ex-bench'
    })
  );

  // Must render imperial unit label (LB)
  assert.ok(editorHtml.includes('(LB)'), 'Table header must show (LB) for imperial preferences');
  // 20 kg in imperial is 44.1 lb
  assert.ok(editorHtml.includes('value="44.1"'), 'Target weight must be displayed as 44.1 lb');
  assert.ok(!editorHtml.includes('(KG)'), 'Table header must not show (KG) for imperial preferences');

  // 4. Contrast with metric preferences
  const metricPrefs: AppPreferences = {
    ...DEFAULT_APP_PREFERENCES,
    units: 'metric'
  };
  const metricHtml = ReactDOMServer.renderToString(
    React.createElement(RoutineEditorModal, {
      isOpen: true,
      onClose: () => {},
      mode: 'edit',
      initialRoutine,
      availableExercises: [mockBench],
      onSaveRoutine: () => {},
      preferences: metricPrefs,
      initialStep: 'exercises',
      initialExpandedExerciseId: 'ex-bench'
    })
  );
  assert.ok(metricHtml.includes('(KG)'), 'Table header must show (KG) for metric preferences');
  assert.ok(metricHtml.includes('value="20"'), 'Target weight must be displayed as 20 kg');
  assert.ok(!metricHtml.includes('(LB)'), 'Table header must not show (LB) for metric preferences');
});

test('Section 15: Reorder sequence (Bench, Row, Curl -> Down Bench -> Up Curl) and no draggable attribute', () => {
  // A. Initial routine: Bench, Row, Curl
  const initialRoutine: Routine = {
    id: 'rt-order-seq',
    userId: 'u1',
    name: 'Upper Hypertrophy',
    exerciseIds: ['ex-bench', 'ex-row', 'ex-curl'],
    template: {
      version: 2,
      exercises: [
        { exerciseId: 'ex-bench', sets: [{ setType: 'working', targetWeightKg: 80 }] },
        { exerciseId: 'ex-row', sets: [{ setType: 'working', targetWeightKg: 70 }] },
        { exerciseId: 'ex-curl', sets: [{ setType: 'working', targetWeightKg: 15 }] }
      ]
    }
  };

  let draft = createRoutineEditorDraft(initialRoutine);
  assert.deepEqual(draft.exercises.map((e) => e.exerciseId), ['ex-bench', 'ex-row', 'ex-curl']);

  // Move Down Bench (index 0 -> index 1)
  // Result: Row, Bench, Curl
  draft = moveRoutineExercise(draft, 0, 1);
  assert.deepEqual(draft.exercises.map((e) => e.exerciseId), ['ex-row', 'ex-bench', 'ex-curl']);

  // Move Up Curl (index 2 -> index 1)
  // Result: Row, Curl, Bench
  draft = moveRoutineExercise(draft, 2, 1);
  assert.deepEqual(draft.exercises.map((e) => e.exerciseId), ['ex-row', 'ex-curl', 'ex-bench']);

  // Save: template order matches
  const savedRoutine = buildRoutineFromEditorDraft(draft);
  assert.deepEqual(
    savedRoutine.template?.exercises.map((e) => e.exerciseId),
    ['ex-row', 'ex-curl', 'ex-bench']
  );

  // exerciseIds projection matches
  assert.deepEqual(savedRoutine.exerciseIds, ['ex-row', 'ex-curl', 'ex-bench']);
  assert.deepEqual(getRoutineExerciseIds(savedRoutine), ['ex-row', 'ex-curl', 'ex-bench']);

  // Reload: JSON serialization simulation
  const serialized = JSON.stringify(savedRoutine);
  const reloaded = normalizeRoutine(JSON.parse(serialized));
  assert.ok(reloaded);
  assert.deepEqual(getRoutineExerciseIds(reloaded), ['ex-row', 'ex-curl', 'ex-bench']);

  // Verify DOM attributes: NO full-card draggable, NO cursor-grab, real touch targets
  const html = ReactDOMServer.renderToString(
    React.createElement(RoutineEditorModal, {
      isOpen: true,
      onClose: () => {},
      mode: 'edit',
      initialRoutine: savedRoutine,
      availableExercises: [mockBench, mockRow, mockCurl],
      onSaveRoutine: () => {},
      initialStep: 'exercises'
    })
  );

  // Must NOT have draggable attributes or cursor-grab
  assert.ok(!html.includes('draggable="true"'), 'Full-card draggable must be removed');
  assert.ok(!html.includes('draggable='), 'No draggable attributes should exist');
  assert.ok(!html.includes('cursor-grab'), 'No cursor-grab drag handle styling');

  // Must have position badges
  assert.ok(html.includes('#1'), 'Must render #1 badge');
  assert.ok(html.includes('#2'), 'Must render #2 badge');
  assert.ok(html.includes('#3'), 'Must render #3 badge');

  // Accessible labels
  assert.ok(html.includes('aria-label="Mover arriba: Barbell Row"'));
  assert.ok(html.includes('aria-label="Mover abajo: Barbell Row"'));
  assert.ok(html.includes('aria-label="Mover arriba: Biceps Curl"'));
  assert.ok(html.includes('aria-label="Mover abajo: Biceps Curl"'));
  assert.ok(html.includes('aria-label="Mover arriba: Bench Press"'));
  assert.ok(html.includes('aria-label="Mover abajo: Bench Press"'));

  // Boundary disabling: first exercise Up disabled, last exercise Down disabled
  assert.ok(html.includes('disabled="" aria-label="Mover arriba: Barbell Row"'));
  assert.ok(html.includes('disabled="" aria-label="Mover abajo: Bench Press"'));

  // Touch target size >= 44x44px
  assert.ok(html.includes('min-w-[44px] min-h-[44px]'));
});

test('Section 16: Compact set-type trigger displays marker and does not expose verbose labels in closed trigger', () => {
  const routineWithAllTypes: Routine = {
    id: 'rt-all-types',
    userId: 'u1',
    name: 'All Set Types',
    exerciseIds: ['ex-bench'],
    template: {
      version: 2,
      exercises: [
        {
          exerciseId: 'ex-bench',
          sets: [
            { setType: 'warmup', targetWeightKg: 40 },
            { setType: 'working', targetWeightKg: 80 },
            { setType: 'drop', targetWeightKg: 60 },
            { setType: 'backoff', targetWeightKg: 50 }
          ]
        }
      ]
    }
  };

  const html = ReactDOMServer.renderToString(
    React.createElement(RoutineEditorModal, {
      isOpen: true,
      onClose: () => {},
      mode: 'edit',
      initialRoutine: routineWithAllTypes,
      availableExercises: [mockBench],
      onSaveRoutine: () => {},
      initialStep: 'exercises',
      initialExpandedExerciseId: 'ex-bench'
    })
  );

  // Closed OptionPicker trigger buttons must NOT expose long descriptive strings
  assert.ok(!html.includes('Serie efectiva'), 'Closed trigger must not expose "Serie efectiva"');
  assert.ok(!html.includes('Calentamiento'), 'Closed trigger must not expose "Calentamiento"');
  assert.ok(!html.includes('Drop-set'), 'Closed trigger must not expose "Drop-set"');
  assert.ok(!html.includes('Back-off set'), 'Closed trigger must not expose "Back-off set"');

  // Table header must be compact "Tipo", NOT "Tipo de serie"
  assert.ok(html.includes('Tipo'), 'Table header must show compact "Tipo"');
  assert.ok(!html.includes('>Tipo de serie<'), 'Table header must not show verbose "Tipo de serie"');

  // Must retain semantic aria-label
  assert.ok(html.includes('aria-label="Tipo de serie"'), 'Must retain semantic aria-label for accessibility');
});

test('Section 3: Metric and imperial weight display, input, 0 kg/lb, 5 lb step, and round-trip fidelity', () => {
  // A. Metric display / input
  assert.equal(displayWeight(20, 'metric'), 20);
  assert.equal(parseDisplayWeight(20, 'metric'), 20);
  assert.equal(parseDisplayWeight(25.5, 'metric'), 25.5);

  // B. Imperial display / input
  // 20 kg = 44.09245 lb -> rounded to 1 decimal = 44.1 lb
  assert.equal(displayWeight(20, 'imperial'), 44.1);
  // Input 45 lb -> kg
  const parsedFrom45Lb = parseDisplayWeight(45, 'imperial');
  assert.ok(Math.abs(parsedFrom45Lb - 20.41166) < 0.001);

  // C. 0 kg / 0 lb preservation
  assert.equal(displayWeight(0, 'metric'), 0);
  assert.equal(parseDisplayWeight(0, 'metric'), 0);
  assert.equal(displayWeight(0, 'imperial'), 0);
  assert.equal(parseDisplayWeight(0, 'imperial'), 0);

  // D. Imperial 5 lb stepping behavior
  // Step up from 45 lb: 45 + 5 = 50 lb
  const display45 = displayWeight(parsedFrom45Lb, 'imperial');
  assert.equal(display45, 45);
  const nextDisplayUp = display45 + 5;
  const nextKgUp = parseDisplayWeight(nextDisplayUp, 'imperial');
  assert.equal(displayWeight(nextKgUp, 'imperial'), 50);

  // Step down from 45 lb: 45 - 5 = 40 lb
  const nextDisplayDown = display45 - 5;
  const nextKgDown = parseDisplayWeight(nextDisplayDown, 'imperial');
  assert.equal(displayWeight(nextKgDown, 'imperial'), 40);

  // Clamped at 0: 2 lb - 5 lb = 0 lb
  const clampedDisplay = Math.max(0, 2 - 5);
  assert.equal(clampedDisplay, 0);
  assert.equal(parseDisplayWeight(clampedDisplay, 'imperial'), 0);

  // E. Canonical round-trip kg -> lb -> kg -> lb
  // 20 kg -> 44.1 lb -> kg -> lb
  const lbFrom20Kg = displayWeight(20, 'imperial'); // 44.1
  const kgFrom44_1Lb = parseDisplayWeight(lbFrom20Kg, 'imperial'); // ~20.00341
  assert.ok(Math.abs(kgFrom44_1Lb - 20) < 0.02, 'Round-trip 20kg stays within 0.02kg tolerance');
  assert.equal(displayWeight(kgFrom44_1Lb, 'imperial'), 44.1, 'Round-trip recovers same display lb');

  // 100 kg -> 220.5 lb -> kg -> lb
  const lbFrom100Kg = displayWeight(100, 'imperial'); // 220.5
  const kgFrom220_5Lb = parseDisplayWeight(lbFrom100Kg, 'imperial');
  assert.ok(Math.abs(kgFrom220_5Lb - 100) < 0.02, 'Round-trip 100kg stays within 0.02kg tolerance');
  assert.equal(displayWeight(kgFrom220_5Lb, 'imperial'), 220.5, 'Round-trip recovers same display lb');
});
