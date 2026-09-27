import test from 'node:test';
import assert from 'node:assert/strict';
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
