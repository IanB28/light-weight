import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDefaultRoutineExerciseTemplate,
  createDefaultRoutineSetTemplate,
  createDefaultRoutineTemplate,
  getRoutineExerciseIds,
  normalizeRoutine,
  normalizeRoutineSetTemplate,
  normalizeRoutineTemplate,
  reconcileLegacyRoutineTemplate,
  validateRoutineTemplateV2
} from './routineTemplate.js';
import type { Routine, RoutineTemplateV2 } from './types.js';

test('1. Legacy routine → V2 normalization generates canonical version 2 template', () => {
  const legacy: Routine = {
    id: 'rt-1',
    userId: 'user-1',
    name: 'Push Day',
    exerciseIds: ['bench', 'incline_db', 'triceps_pushdown']
  };

  const normalized = normalizeRoutine(legacy);
  assert.ok(normalized);
  assert.equal(normalized.id, 'rt-1');
  assert.equal(normalized.name, 'Push Day');
  assert.equal(normalized.template?.version, 2);
  assert.equal(normalized.template?.exercises.length, 3);
  assert.deepEqual(normalized.exerciseIds, ['bench', 'incline_db', 'triceps_pushdown']);
  assert.deepEqual(normalized.template?.exercises[0], {
    exerciseId: 'bench',
    sets: [{ setType: 'warmup', targetWeightKg: 0 }]
  });
});

test('2. Exact exercise order is preserved during legacy and V2 normalization', () => {
  const orderedIds = ['squat', 'bench', 'deadlift', 'overhead_press', 'barbell_row'];
  const template = createDefaultRoutineTemplate(orderedIds);
  assert.deepEqual(template.exercises.map((e) => e.exerciseId), orderedIds);

  const routine = normalizeRoutine({
    id: 'rt-ordered',
    userId: 'u1',
    name: 'Full Body',
    exerciseIds: orderedIds
  });
  assert.ok(routine);
  assert.deepEqual(routine.exerciseIds, orderedIds);
  assert.deepEqual(routine.template?.exercises.map((e) => e.exerciseId), orderedIds);
  assert.deepEqual(getRoutineExerciseIds(routine), orderedIds);
});

test('3. New exercise default: exactly 1 warmup set at 0 kg', () => {
  const set = createDefaultRoutineSetTemplate();
  assert.equal(set.setType, 'warmup');
  assert.equal(set.targetWeightKg, 0);

  const exercise = createDefaultRoutineExerciseTemplate('lat_pulldown');
  assert.equal(exercise.exerciseId, 'lat_pulldown');
  assert.equal(exercise.sets.length, 1);
  assert.deepEqual(exercise.sets[0], { setType: 'warmup', targetWeightKg: 0 });
});

test('4. Multiple sets preserve exact ordering', () => {
  const multiSetTemplate: RoutineTemplateV2 = {
    version: 2,
    exercises: [
      {
        exerciseId: 'bench',
        sets: [
          { setType: 'warmup', targetWeightKg: 40 },
          { setType: 'warmup', targetWeightKg: 60 },
          { setType: 'working', targetWeightKg: 80 },
          { setType: 'working', targetWeightKg: 85 },
          { setType: 'backoff', targetWeightKg: 70 },
          { setType: 'drop', targetWeightKg: 50 }
        ]
      }
    ]
  };

  const normalized = normalizeRoutineTemplate(multiSetTemplate);
  assert.ok(normalized);
  assert.equal(normalized.exercises[0].sets.length, 6);
  assert.deepEqual(normalized.exercises[0].sets.map((s) => s.setType), [
    'warmup',
    'warmup',
    'working',
    'working',
    'backoff',
    'drop'
  ]);
  assert.deepEqual(normalized.exercises[0].sets.map((s) => s.targetWeightKg), [
    40, 60, 80, 85, 70, 50
  ]);
});

test('5. Set types survive normalization: warmup, working, backoff, drop', () => {
  const setTypes = ['warmup', 'working', 'backoff', 'drop'] as const;
  for (const st of setTypes) {
    const normalized = normalizeRoutineSetTemplate({ setType: st, targetWeightKg: 50 });
    assert.ok(normalized);
    assert.equal(normalized.setType, st);
    assert.equal(normalized.targetWeightKg, 50);
  }

  // Invalid set type is rejected
  assert.equal(normalizeRoutineSetTemplate({ setType: 'invalid_type', targetWeightKg: 50 }), null);
});

test('6. Planned weights survive normalization', () => {
  const weights = [0, 2.5, 20, 67.5, 142.5, 250];
  for (const w of weights) {
    const res = normalizeRoutineSetTemplate({ setType: 'working', targetWeightKg: w });
    assert.ok(res);
    assert.equal(res.targetWeightKg, w);
  }
});

test('7. 0 kg external load is valid (bodyweight & initial defaults)', () => {
  const res = normalizeRoutineSetTemplate({ setType: 'warmup', targetWeightKg: 0 });
  assert.ok(res);
  assert.equal(res.targetWeightKg, 0);

  const resWorking = normalizeRoutineSetTemplate({ setType: 'working', targetWeightKg: 0 });
  assert.ok(resWorking);
  assert.equal(resWorking.targetWeightKg, 0);
});

test('8. Negative weight rejected', () => {
  assert.equal(normalizeRoutineSetTemplate({ setType: 'working', targetWeightKg: -1 }), null);
  assert.equal(normalizeRoutineSetTemplate({ setType: 'working', targetWeightKg: -0.001 }), null);
  assert.equal(normalizeRoutineSetTemplate({ setType: 'working', targetWeightKg: -50 }), null);

  assert.throws(() => validateRoutineTemplateV2({
    version: 2,
    exercises: [{ exerciseId: 'bench', sets: [{ setType: 'working', targetWeightKg: -5 }] }]
  }), /Invalid targetWeightKg/);
});

test('9. NaN weight rejected', () => {
  assert.equal(normalizeRoutineSetTemplate({ setType: 'working', targetWeightKg: Number.NaN }), null);
  assert.throws(() => validateRoutineTemplateV2({
    version: 2,
    exercises: [{ exerciseId: 'bench', sets: [{ setType: 'working', targetWeightKg: Number.NaN }] }]
  }), /Invalid targetWeightKg/);
});

test('10. Infinity weight rejected', () => {
  assert.equal(normalizeRoutineSetTemplate({ setType: 'working', targetWeightKg: Number.POSITIVE_INFINITY }), null);
  assert.equal(normalizeRoutineSetTemplate({ setType: 'working', targetWeightKg: Number.NEGATIVE_INFINITY }), null);
  assert.throws(() => validateRoutineTemplateV2({
    version: 2,
    exercises: [{ exerciseId: 'bench', sets: [{ setType: 'working', targetWeightKg: Number.POSITIVE_INFINITY }] }]
  }), /Invalid targetWeightKg/);
});

test('11. Malformed template safely rejected/repaired without crashing', () => {
  // Corrupt non-object input
  assert.equal(normalizeRoutine(null), null);
  assert.equal(normalizeRoutine('string'), null);
  assert.equal(normalizeRoutine([]), null);
  assert.equal(normalizeRoutine({}), null);

  // Template with invalid version falls back safely to legacy exerciseIds
  const fallbackRoutine = normalizeRoutine({
    id: 'rt-bad-ver',
    userId: 'u1',
    name: 'Fallback',
    exerciseIds: ['squat', 'bench'],
    template: { version: 1, exercises: 'corrupted' }
  });
  assert.ok(fallbackRoutine);
  assert.equal(fallbackRoutine.template?.version, 2);
  assert.deepEqual(fallbackRoutine.exerciseIds, ['squat', 'bench']);

  // Exercise with no sets gets repaired with default set
  const repaired = normalizeRoutineTemplate({
    version: 2,
    exercises: [
      { exerciseId: 'curl', sets: [] },
      { exerciseId: 'triceps', sets: [{ setType: 'invalid', targetWeightKg: -10 }] }
    ]
  });
  assert.ok(repaired);
  assert.equal(repaired.exercises.length, 2);
  assert.deepEqual(repaired.exercises[0].sets, [{ setType: 'warmup', targetWeightKg: 0 }]);
  assert.deepEqual(repaired.exercises[1].sets, [{ setType: 'warmup', targetWeightKg: 0 }]);
});

test('12. exerciseIds/template mismatch resolves deterministically from V2 canonical order', () => {
  // The template says bench -> row -> squat, but exerciseIds claims squat -> bench
  const mismatched: Routine = {
    id: 'rt-mismatch',
    userId: 'u1',
    name: 'Conflict Routine',
    exerciseIds: ['squat', 'bench'],
    template: {
      version: 2,
      exercises: [
        { exerciseId: 'bench', sets: [{ setType: 'working', targetWeightKg: 80 }] },
        { exerciseId: 'row', sets: [{ setType: 'working', targetWeightKg: 70 }] },
        { exerciseId: 'squat', sets: [{ setType: 'working', targetWeightKg: 100 }] }
      ]
    }
  };

  const normalized = normalizeRoutine(mismatched);
  assert.ok(normalized);
  // Canonical order is strictly template.exercises order
  assert.deepEqual(normalized.exerciseIds, ['bench', 'row', 'squat']);
  assert.deepEqual(getRoutineExerciseIds(normalized), ['bench', 'row', 'squat']);
  assert.deepEqual(normalized.template?.exercises.map((e) => e.exerciseId), ['bench', 'row', 'squat']);
});

test('13. Distinct routine IDs with same display name remain valid', () => {
  const routineA = normalizeRoutine({
    id: 'rt-push-1',
    userId: 'u1',
    name: 'Push Day',
    exerciseIds: ['bench']
  });
  const routineB = normalizeRoutine({
    id: 'rt-push-2',
    userId: 'u1',
    name: 'Push Day',
    exerciseIds: ['incline_db']
  });

  assert.ok(routineA);
  assert.ok(routineB);
  assert.notEqual(routineA.id, routineB.id);
  assert.equal(routineA.name, routineB.name);
  assert.deepEqual(routineA.exerciseIds, ['bench']);
  assert.deepEqual(routineB.exerciseIds, ['incline_db']);
});

test('14. Existing origin/shared attribution preserved during normalization', () => {
  const sharedRoutine: Routine = {
    id: 'rt-shared-1',
    userId: 'u2',
    name: 'Bro Split - Chest',
    exerciseIds: ['bench', 'cable_fly'],
    origin: {
      type: 'shared',
      sharedBy: {
        id: 'u1',
        username: 'coach_john',
        displayName: 'Coach John',
        avatarUrl: 'https://example.com/avatar.jpg'
      },
      shareId: 'share-999'
    }
  };

  const normalized = normalizeRoutine(sharedRoutine);
  assert.ok(normalized);
  assert.deepEqual(normalized.origin, sharedRoutine.origin);
  assert.equal(normalized.template?.version, 2);
  assert.equal(normalized.template?.exercises.length, 2);
});

test('15. reconcileLegacyRoutineTemplate preserves existing sets, adopts incoming order, defaults new, removes missing', () => {
  const existingTemplate: RoutineTemplateV2 = {
    version: 2,
    exercises: [
      {
        exerciseId: 'bench',
        sets: [
          { setType: 'warmup', targetWeightKg: 40 },
          { setType: 'working', targetWeightKg: 80 }
        ]
      },
      {
        exerciseId: 'row',
        sets: [
          { setType: 'working', targetWeightKg: 60 }
        ]
      }
    ]
  };

  const incomingIds = ['row', 'bench', 'curl'];
  const reconciled = reconcileLegacyRoutineTemplate(existingTemplate, incomingIds);

  assert.equal(reconciled.version, 2);
  assert.equal(reconciled.exercises.length, 3);

  // 1. row preserved with existing working 60kg, placed first
  assert.equal(reconciled.exercises[0].exerciseId, 'row');
  assert.deepEqual(reconciled.exercises[0].sets, [{ setType: 'working', targetWeightKg: 60 }]);

  // 2. bench preserved with existing warmup 40kg and working 80kg, placed second
  assert.equal(reconciled.exercises[1].exerciseId, 'bench');
  assert.deepEqual(reconciled.exercises[1].sets, [
    { setType: 'warmup', targetWeightKg: 40 },
    { setType: 'working', targetWeightKg: 80 }
  ]);

  // 3. curl is new: defaulted to 1 warmup set @ 0 kg, placed third
  assert.equal(reconciled.exercises[2].exerciseId, 'curl');
  assert.deepEqual(reconciled.exercises[2].sets, [{ setType: 'warmup', targetWeightKg: 0 }]);
});

test('16. reconcileLegacyRoutineTemplate removes exercises omitted by incoming legacy client', () => {
  const existingTemplate: RoutineTemplateV2 = {
    version: 2,
    exercises: [
      { exerciseId: 'bench', sets: [{ setType: 'working', targetWeightKg: 100 }] },
      { exerciseId: 'row', sets: [{ setType: 'working', targetWeightKg: 80 }] }
    ]
  };

  // Client omitted 'row'
  const reconciled = reconcileLegacyRoutineTemplate(existingTemplate, ['bench']);
  assert.equal(reconciled.exercises.length, 1);
  assert.equal(reconciled.exercises[0].exerciseId, 'bench');
  assert.deepEqual(reconciled.exercises[0].sets, [{ setType: 'working', targetWeightKg: 100 }]);
});

test('17. reconcileLegacyRoutineTemplate with null/undefined existingTemplate creates default V2 template', () => {
  const fromNull = reconcileLegacyRoutineTemplate(null, ['bench', 'squat']);
  assert.equal(fromNull.version, 2);
  assert.equal(fromNull.exercises.length, 2);
  assert.equal(fromNull.exercises[0].exerciseId, 'bench');
  assert.deepEqual(fromNull.exercises[0].sets, [{ setType: 'warmup', targetWeightKg: 0 }]);
  assert.equal(fromNull.exercises[1].exerciseId, 'squat');
  assert.deepEqual(fromNull.exercises[1].sets, [{ setType: 'warmup', targetWeightKg: 0 }]);

  const fromUndefined = reconcileLegacyRoutineTemplate(undefined, ['deadlift']);
  assert.equal(fromUndefined.exercises.length, 1);
  assert.equal(fromUndefined.exercises[0].exerciseId, 'deadlift');
});

test('18. reconcileLegacyRoutineTemplate is strictly immutable', () => {
  const originalSets = [{ setType: 'working' as const, targetWeightKg: 100 }];
  const existing: RoutineTemplateV2 = {
    version: 2,
    exercises: [{ exerciseId: 'bench', sets: originalSets }]
  };

  const reconciled = reconcileLegacyRoutineTemplate(existing, ['bench']);
  reconciled.exercises[0].sets[0].targetWeightKg = 999;
  assert.equal(originalSets[0].targetWeightKg, 100);
});

test('19. Local corruption must not delete exercises: recovers from exerciseIds projection', () => {
  // Scenario from prompt:
  // exerciseIds: ["bench", "row"]
  // template has valid bench, but malformed row
  const corruptInput = {
    id: 'rt-corrupt-1',
    userId: 'u1',
    name: 'Push & Pull',
    exerciseIds: ['bench', 'row'],
    template: {
      version: 2,
      exercises: [
        {
          exerciseId: 'bench',
          sets: [{ setType: 'working', targetWeightKg: 90 }]
        },
        // Malformed row: invalid non-object entry or invalid exerciseId
        null
      ]
    }
  };

  const normalized = normalizeRoutine(corruptInput);
  assert.ok(normalized);
  // Row must NOT be silently dropped!
  assert.deepEqual(normalized.exerciseIds, ['bench', 'row']);
  assert.ok(normalized.template);
  assert.equal(normalized.template.exercises.length, 2);
  assert.equal(normalized.template.exercises[0].exerciseId, 'bench');
  assert.deepEqual(normalized.template.exercises[0].sets, [{ setType: 'working', targetWeightKg: 90 }]);
  assert.equal(normalized.template.exercises[1].exerciseId, 'row');
  assert.deepEqual(normalized.template.exercises[1].sets, [{ setType: 'warmup', targetWeightKg: 0 }]);
});

test('20. Valid V2 wins over stale extra exerciseIds: omitted exercises are NOT resurrected', () => {
  const input = {
    id: 'rt-valid-v2-1',
    userId: 'u1',
    name: 'Bench Only',
    exerciseIds: ['bench', 'row'],
    template: {
      version: 2,
      exercises: [
        {
          exerciseId: 'bench',
          sets: [{ setType: 'working', targetWeightKg: 100 }]
        }
      ]
    }
  };

  const normalized = normalizeRoutine(input);
  assert.ok(normalized);
  // Valid V2 is authoritative; row is NOT resurrected from stale exerciseIds
  assert.deepEqual(normalized.exerciseIds, ['bench']);
  assert.equal(normalized.template?.exercises.length, 1);
  assert.equal(normalized.template?.exercises[0].exerciseId, 'bench');
});

test('21. Valid V2 order wins over different legacy order', () => {
  const input = {
    id: 'rt-valid-v2-order',
    userId: 'u1',
    name: 'Order Authority',
    exerciseIds: ['row', 'bench'],
    template: {
      version: 2,
      exercises: [
        { exerciseId: 'bench', sets: [{ setType: 'warmup', targetWeightKg: 40 }] },
        { exerciseId: 'row', sets: [{ setType: 'working', targetWeightKg: 60 }] }
      ]
    }
  };

  const normalized = normalizeRoutine(input);
  assert.ok(normalized);
  assert.deepEqual(normalized.exerciseIds, ['bench', 'row']);
  assert.equal(normalized.template?.exercises[0].exerciseId, 'bench');
  assert.equal(normalized.template?.exercises[1].exerciseId, 'row');
});

test('22. Invalid V2 version falls back to legacy projection', () => {
  const input = {
    id: 'rt-invalid-version',
    userId: 'u1',
    name: 'Bad Version',
    exerciseIds: ['bench', 'row'],
    template: {
      version: 1, // Invalid version
      exercises: [
        { exerciseId: 'bench', sets: [{ setType: 'working', targetWeightKg: 100 }] }
      ]
    }
  };

  const normalized = normalizeRoutine(input);
  assert.ok(normalized);
  assert.deepEqual(normalized.exerciseIds, ['bench', 'row']);
  assert.equal(normalized.template?.version, 2);
  assert.equal(normalized.template?.exercises.length, 2);
  assert.equal(normalized.template?.exercises[0].exerciseId, 'bench');
  assert.deepEqual(normalized.template?.exercises[0].sets, [{ setType: 'warmup', targetWeightKg: 0 }]);
  assert.equal(normalized.template?.exercises[1].exerciseId, 'row');
  assert.deepEqual(normalized.template?.exercises[1].sets, [{ setType: 'warmup', targetWeightKg: 0 }]);
});

test('23. Removing exercise from valid V2 cannot be undone by stale exerciseIds', () => {
  // Scenario: Routine previously had bench, row, squat. User deleted row and squat in V2 editor.
  // Stale client/cache still passes full 3-exercise exerciseIds array.
  const input = {
    id: 'rt-editor-removal',
    userId: 'u1',
    name: 'Push Day',
    exerciseIds: ['bench', 'row', 'squat'],
    template: {
      version: 2,
      exercises: [
        {
          exerciseId: 'bench',
          sets: [
            { setType: 'warmup', targetWeightKg: 40 },
            { setType: 'working', targetWeightKg: 80 }
          ]
        }
      ]
    }
  };

  const normalized = normalizeRoutine(input);
  assert.ok(normalized);
  // Stale exerciseIds must not undo the deletion
  assert.deepEqual(normalized.exerciseIds, ['bench']);
  assert.equal(normalized.template?.exercises.length, 1);
  assert.equal(normalized.template?.exercises[0].exerciseId, 'bench');
});
