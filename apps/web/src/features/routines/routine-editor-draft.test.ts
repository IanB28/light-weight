import test from 'node:test';
import assert from 'node:assert/strict';
import { Routine, RoutineTemplateV2 } from '@light-weight/domain';
import {
  addRoutineExerciseTemplate,
  addRoutineTemplateSet,
  buildRoutineFromEditorDraft,
  canSaveRoutineEditorDraft,
  createRoutineEditorDraft,
  isRoutineEditorDraftDirty,
  moveRoutineExercise,
  removeRoutineExerciseTemplate,
  removeRoutineTemplateSet,
  updateRoutineTemplateSet
} from './routine-editor-draft.js';

test('1. createRoutineEditorDraft: initializes empty draft in create mode', () => {
  const draft = createRoutineEditorDraft(null, 'user-123');

  assert.equal(draft.id, undefined);
  assert.equal(draft.name, '');
  assert.equal(draft.description, '');
  assert.equal(draft.ownerId, 'user-123');
  assert.equal(draft.origin, undefined);
  assert.deepEqual(draft.exercises, []);
  assert.equal(canSaveRoutineEditorDraft(draft), false);
});

test('2. createRoutineEditorDraft: preloads existing routine in edit mode preserving ID, origin, and canonical structure', () => {
  const existingRoutine: Routine = {
    id: 'rt-push-1',
    userId: 'user-456',
    name: 'Push Day A',
    description: 'Heavy chest focus',
    exerciseIds: ['ex-bench', 'ex-incline'],
    template: {
      version: 2,
      exercises: [
        {
          exerciseId: 'ex-bench',
          sets: [
            { setType: 'warmup', targetWeightKg: 40 },
            { setType: 'working', targetWeightKg: 80 }
          ]
        },
        {
          exerciseId: 'ex-incline',
          sets: [
            { setType: 'working', targetWeightKg: 60 }
          ]
        }
      ]
    },
    origin: {
      type: 'shared',
      sharedBy: { id: 'u-friend', username: 'trainer_bob', displayName: 'Bob' },
      shareId: 'sh-999'
    }
  };

  const draft = createRoutineEditorDraft(existingRoutine);

  assert.equal(draft.id, 'rt-push-1');
  assert.equal(draft.name, 'Push Day A');
  assert.equal(draft.description, 'Heavy chest focus');
  assert.equal(draft.ownerId, 'user-456');
  assert.deepEqual(draft.origin, existingRoutine.origin);
  assert.equal(draft.exercises.length, 2);
  assert.equal(draft.exercises[0].exerciseId, 'ex-bench');
  assert.equal(draft.exercises[0].sets.length, 2);
  assert.equal(draft.exercises[0].sets[0].setType, 'warmup');
  assert.equal(draft.exercises[0].sets[0].targetWeightKg, 40);
  assert.equal(draft.exercises[0].sets[1].setType, 'working');
  assert.equal(draft.exercises[0].sets[1].targetWeightKg, 80);
  assert.equal(draft.exercises[1].exerciseId, 'ex-incline');
  assert.equal(draft.exercises[1].sets.length, 1);
  assert.equal(draft.exercises[1].sets[0].targetWeightKg, 60);

  // Initial draft is not dirty
  assert.equal(isRoutineEditorDraftDirty(draft, draft), false);
  assert.equal(canSaveRoutineEditorDraft(draft), true);
});

test('3. addRoutineExerciseTemplate: appends new exercise with 1 warmup set @ 0 kg and rejects duplicates', () => {
  const initial = createRoutineEditorDraft(null, 'u1');
  const withBench = addRoutineExerciseTemplate(initial, 'ex-bench');

  assert.equal(withBench.exercises.length, 1);
  assert.equal(withBench.exercises[0].exerciseId, 'ex-bench');
  assert.equal(withBench.exercises[0].sets.length, 1);
  assert.equal(withBench.exercises[0].sets[0].setType, 'warmup');
  assert.equal(withBench.exercises[0].sets[0].targetWeightKg, 0);

  // Duplicate add is a no-op
  const duplicate = addRoutineExerciseTemplate(withBench, 'ex-bench');
  assert.equal(duplicate.exercises.length, 1);

  // Appending another exercise
  const withRow = addRoutineExerciseTemplate(withBench, 'ex-row');
  assert.equal(withRow.exercises.length, 2);
  assert.equal(withRow.exercises[1].exerciseId, 'ex-row');
});

test('4. removeRoutineExerciseTemplate: removes exercise immutably', () => {
  let draft = createRoutineEditorDraft(null, 'u1');
  draft = addRoutineExerciseTemplate(draft, 'ex-bench');
  draft = addRoutineExerciseTemplate(draft, 'ex-row');
  draft = addRoutineExerciseTemplate(draft, 'ex-curl');

  assert.equal(draft.exercises.length, 3);

  const afterRemove = removeRoutineExerciseTemplate(draft, 'ex-row');
  assert.equal(afterRemove.exercises.length, 2);
  assert.deepEqual(
    afterRemove.exercises.map((e) => e.exerciseId),
    ['ex-bench', 'ex-curl']
  );
  // Original is unchanged
  assert.equal(draft.exercises.length, 3);
});

test('5. moveRoutineExercise: explicitly reorders exercises in canonical sequence', () => {
  let draft = createRoutineEditorDraft(null, 'u1');
  draft = addRoutineExerciseTemplate(draft, 'ex-bench');
  draft = addRoutineExerciseTemplate(draft, 'ex-row');
  draft = addRoutineExerciseTemplate(draft, 'ex-curl');

  // Move Curl (index 2) to top (index 0)
  const moved = moveRoutineExercise(draft, 2, 0);
  assert.deepEqual(
    moved.exercises.map((e) => e.exerciseId),
    ['ex-curl', 'ex-bench', 'ex-row']
  );

  // Move Curl from 0 to 1
  const movedMiddle = moveRoutineExercise(moved, 0, 1);
  assert.deepEqual(
    movedMiddle.exercises.map((e) => e.exerciseId),
    ['ex-bench', 'ex-curl', 'ex-row']
  );

  // Out of bounds or same index returns unchanged draft
  assert.equal(moveRoutineExercise(draft, -1, 0), draft);
  assert.equal(moveRoutineExercise(draft, 0, 10), draft);
  assert.equal(moveRoutineExercise(draft, 1, 1), draft);
});

test('6. addRoutineTemplateSet: clones previous set structure', () => {
  let draft = createRoutineEditorDraft(null, 'u1');
  draft = addRoutineExerciseTemplate(draft, 'ex-bench');
  // Update first set to working 80kg
  draft = updateRoutineTemplateSet(draft, 'ex-bench', 0, { setType: 'working', targetWeightKg: 80 });

  // Add another set
  const withSecond = addRoutineTemplateSet(draft, 'ex-bench');
  assert.equal(withSecond.exercises[0].sets.length, 2);
  assert.equal(withSecond.exercises[0].sets[1].setType, 'working');
  assert.equal(withSecond.exercises[0].sets[1].targetWeightKg, 80);

  // Add third set after updating second to drop 60kg
  const updatedSecond = updateRoutineTemplateSet(withSecond, 'ex-bench', 1, { setType: 'drop', targetWeightKg: 60 });
  const withThird = addRoutineTemplateSet(updatedSecond, 'ex-bench');
  assert.equal(withThird.exercises[0].sets.length, 3);
  assert.equal(withThird.exercises[0].sets[2].setType, 'drop');
  assert.equal(withThird.exercises[0].sets[2].targetWeightKg, 60);
});

test('7. removeRoutineTemplateSet: removes set but enforces minimum 1 set invariant', () => {
  let draft = createRoutineEditorDraft(null, 'u1');
  draft = addRoutineExerciseTemplate(draft, 'ex-bench');
  draft = addRoutineTemplateSet(draft, 'ex-bench');
  draft = addRoutineTemplateSet(draft, 'ex-bench');

  assert.equal(draft.exercises[0].sets.length, 3);

  // Remove set at index 1
  const afterRemove = removeRoutineTemplateSet(draft, 'ex-bench', 1);
  assert.equal(afterRemove.exercises[0].sets.length, 2);

  // Remove another set
  const afterSecondRemove = removeRoutineTemplateSet(afterRemove, 'ex-bench', 0);
  assert.equal(afterSecondRemove.exercises[0].sets.length, 1);

  // Attempting to remove the last remaining set must be a no-op!
  const preventZeroSets = removeRoutineTemplateSet(afterSecondRemove, 'ex-bench', 0);
  assert.equal(preventZeroSets.exercises[0].sets.length, 1);
});

test('8. updateRoutineTemplateSet: validates weight and setType and allows 0kg', () => {
  let draft = createRoutineEditorDraft(null, 'u1');
  draft = addRoutineExerciseTemplate(draft, 'ex-pullup');

  // 0 kg is completely valid (bodyweight)
  const updatedZero = updateRoutineTemplateSet(draft, 'ex-pullup', 0, { targetWeightKg: 0 });
  assert.equal(updatedZero.exercises[0].sets[0].targetWeightKg, 0);

  // Valid positive weight
  const updatedWeight = updateRoutineTemplateSet(updatedZero, 'ex-pullup', 0, { targetWeightKg: 12.5 });
  assert.equal(updatedWeight.exercises[0].sets[0].targetWeightKg, 12.5);

  // Negative weight rejected (retains previous value)
  const rejectedNegative = updateRoutineTemplateSet(updatedWeight, 'ex-pullup', 0, { targetWeightKg: -10 });
  assert.equal(rejectedNegative.exercises[0].sets[0].targetWeightKg, 12.5);

  // NaN / Infinity rejected
  const rejectedNaN = updateRoutineTemplateSet(updatedWeight, 'ex-pullup', 0, { targetWeightKg: NaN });
  assert.equal(rejectedNaN.exercises[0].sets[0].targetWeightKg, 12.5);

  // Set type update
  const updatedType = updateRoutineTemplateSet(updatedWeight, 'ex-pullup', 0, { setType: 'backoff' });
  assert.equal(updatedType.exercises[0].sets[0].setType, 'backoff');
});

test('9. isRoutineEditorDraftDirty: accurately identifies edits across all dimensions', () => {
  const baseRoutine: Routine = {
    id: 'rt-1',
    userId: 'u1',
    name: 'Leg Day',
    exerciseIds: ['ex-squat'],
    template: {
      version: 2,
      exercises: [
        {
          exerciseId: 'ex-squat',
          sets: [{ setType: 'working', targetWeightKg: 100 }]
        }
      ]
    }
  };

  const initial = createRoutineEditorDraft(baseRoutine);
  assert.equal(isRoutineEditorDraftDirty(initial, initial), false);

  // Name change
  assert.equal(isRoutineEditorDraftDirty(initial, { ...initial, name: 'Leg Day Hard' }), true);

  // Description change
  assert.equal(isRoutineEditorDraftDirty(initial, { ...initial, description: 'New note' }), true);

  // Exercise added
  const withAdded = addRoutineExerciseTemplate(initial, 'ex-calf');
  assert.equal(isRoutineEditorDraftDirty(initial, withAdded), true);

  // Set added
  const withSetAdded = addRoutineTemplateSet(initial, 'ex-squat');
  assert.equal(isRoutineEditorDraftDirty(initial, withSetAdded), true);

  // Weight modified
  const withWeight = updateRoutineTemplateSet(initial, 'ex-squat', 0, { targetWeightKg: 105 });
  assert.equal(isRoutineEditorDraftDirty(initial, withWeight), true);

  // Set type modified
  const withType = updateRoutineTemplateSet(initial, 'ex-squat', 0, { setType: 'warmup' });
  assert.equal(isRoutineEditorDraftDirty(initial, withType), true);
});

test('10. buildRoutineFromEditorDraft: outputs canonical Routine with regenerated exerciseIds and normalized V2 template', () => {
  let draft = createRoutineEditorDraft(null, 'owner-99');
  draft = { ...draft, name: 'Upper Body B', description: 'Tempo focus' };
  draft = addRoutineExerciseTemplate(draft, 'ex-bench');
  draft = addRoutineExerciseTemplate(draft, 'ex-row');
  // Reorder
  draft = moveRoutineExercise(draft, 1, 0); // Row first, Bench second
  // Set weights
  draft = updateRoutineTemplateSet(draft, 'ex-row', 0, { setType: 'working', targetWeightKg: 70 });
  draft = updateRoutineTemplateSet(draft, 'ex-bench', 0, { setType: 'working', targetWeightKg: 85 });

  const built = buildRoutineFromEditorDraft(draft, { generatedId: 'rt-new-123' });

  assert.equal(built.id, 'rt-new-123');
  assert.equal(built.name, 'Upper Body B');
  assert.equal(built.description, 'Tempo focus');
  assert.equal(built.userId, 'owner-99');
  // Canonical order: Row first, Bench second
  assert.deepEqual(built.exerciseIds, ['ex-row', 'ex-bench']);
  assert.ok(built.template);
  assert.equal(built.template.version, 2);
  assert.equal(built.template.exercises[0].exerciseId, 'ex-row');
  assert.equal(built.template.exercises[0].sets[0].targetWeightKg, 70);
  assert.equal(built.template.exercises[1].exerciseId, 'ex-bench');
  assert.equal(built.template.exercises[1].sets[0].targetWeightKg, 85);
});
