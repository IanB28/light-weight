import test from 'node:test';
import assert from 'node:assert/strict';
import { Routine, RoutineTemplateV2 } from '@light-weight/domain';
import {
  normalizeStoredRoutines,
  getStoredRoutines,
  saveStoredRoutines
} from '../../lib/storage.js';
import { buildRoutinePayload } from '../../components/CreateRoutineModal.js';

// Setup mock localStorage in Node.js test environment if needed
const mockStore: Record<string, string> = {};
if (typeof globalThis.localStorage === 'undefined') {
  (globalThis as unknown as { localStorage: Storage }).localStorage = {
    getItem: (key: string) => mockStore[key] ?? null,
    setItem: (key: string, val: string) => { mockStore[key] = String(val); },
    removeItem: (key: string) => { delete mockStore[key]; },
    clear: () => { Object.keys(mockStore).forEach((k) => delete mockStore[k]); },
    length: 0,
    key: () => null
  };
}

test('1. normalizeStoredRoutines upgrades legacy routines to valid V2 template', () => {
  const legacyRoutine: Routine = {
    id: 'rot-legacy-1',
    userId: 'u1',
    name: 'Push Day A',
    description: 'Chest and shoulders',
    exerciseIds: ['bench-press', 'overhead-press']
  };

  const [normalized] = normalizeStoredRoutines([legacyRoutine]);
  assert.ok(normalized);
  assert.equal(normalized.id, 'rot-legacy-1');
  assert.equal(normalized.name, 'Push Day A');
  assert.equal(normalized.description, 'Chest and shoulders');
  assert.deepEqual(normalized.exerciseIds, ['bench-press', 'overhead-press']);
  
  assert.ok(normalized.template);
  assert.equal(normalized.template.version, 2);
  assert.equal(normalized.template.exercises.length, 2);
  assert.equal(normalized.template.exercises[0].exerciseId, 'bench-press');
  assert.deepEqual(normalized.template.exercises[0].sets, [{ setType: 'warmup', targetWeightKg: 0 }]);
  assert.equal(normalized.template.exercises[1].exerciseId, 'overhead-press');
  assert.deepEqual(normalized.template.exercises[1].sets, [{ setType: 'warmup', targetWeightKg: 0 }]);
});

test('2. normalizeStoredRoutines preserves existing V2 template without overwriting custom sets or target weights', () => {
  const v2Template: RoutineTemplateV2 = {
    version: 2,
    exercises: [
      {
        exerciseId: 'squat',
        sets: [
          { setType: 'warmup', targetWeightKg: 20 },
          { setType: 'working', targetWeightKg: 100 },
          { setType: 'drop', targetWeightKg: 80 }
        ]
      },
      {
        exerciseId: 'leg-extension',
        sets: [
          { setType: 'backoff', targetWeightKg: 50 }
        ]
      }
    ]
  };

  const v2Routine: Routine = {
    id: 'rot-v2-1',
    userId: 'u1',
    name: 'Leg Day Heavy',
    exerciseIds: ['squat', 'leg-extension'],
    template: v2Template
  };

  const [normalized] = normalizeStoredRoutines([v2Routine]);
  assert.ok(normalized);
  assert.equal(normalized.id, 'rot-v2-1');
  assert.deepEqual(normalized.exerciseIds, ['squat', 'leg-extension']);
  assert.deepEqual(normalized.template, v2Template);
});

test('3. normalizeStoredRoutines discards corrupted or malformed entries safely', () => {
  const dirtyInput = [
    null,
    undefined,
    123,
    'string-entry',
    {},
    { id: '', name: 'Empty ID', exerciseIds: [] },
    { id: 'rot-no-name', name: '', exerciseIds: ['bench'] },
    {
      id: 'rot-valid',
      name: 'Valid Routine',
      exerciseIds: ['bench-press']
    }
  ];

  const normalized = normalizeStoredRoutines(dirtyInput);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].id, 'rot-valid');
  assert.equal(normalized[0].name, 'Valid Routine');
  assert.ok(normalized[0].template);
});

test('4. normalizeStoredRoutines deduplicates by ID preserving the latest entry', () => {
  const duplicates = [
    { id: 'rot-dup', name: 'Original', exerciseIds: ['bench-press'] },
    { id: 'rot-other', name: 'Other', exerciseIds: ['squat'] },
    { id: 'rot-dup', name: 'Updated Version', exerciseIds: ['bench-press', 'incline-press'] }
  ];

  const normalized = normalizeStoredRoutines(duplicates);
  assert.equal(normalized.length, 2);
  assert.equal(normalized[0].id, 'rot-dup');
  assert.equal(normalized[0].name, 'Updated Version');
  assert.deepEqual(normalized[0].exerciseIds, ['bench-press', 'incline-press']);
  assert.equal(normalized[1].id, 'rot-other');
});

test('5. normalizeStoredRoutines preserves shared routine origin attribution', () => {
  const sharedRoutine: Routine = {
    id: 'rot-shared',
    userId: 'u1',
    name: 'Shared PPL',
    exerciseIds: ['bench-press'],
    origin: {
      type: 'shared',
      sharedBy: {
        id: 'u-coach',
        username: 'coach_john',
        displayName: 'Coach John'
      },
      shareId: 'share-999'
    }
  };

  const [normalized] = normalizeStoredRoutines([sharedRoutine]);
  assert.ok(normalized);
  assert.ok(normalized.origin);
  assert.equal(normalized.origin?.type, 'shared');
  assert.equal(normalized.origin?.sharedBy.username, 'coach_john');
  assert.equal(normalized.origin?.shareId, 'share-999');
});

test('6. buildRoutinePayload creates a routine with valid normalized V2 template', () => {
  const created = buildRoutinePayload(
    '  New Push Routine  ',
    '  Some notes  ',
    ['bench-press', 'overhead-press'],
    'u-current'
  );

  assert.equal(created.name, 'New Push Routine');
  assert.equal(created.description, 'Some notes');
  assert.equal(created.userId, 'u-current');
  assert.deepEqual(created.exerciseIds, ['bench-press', 'overhead-press']);
  assert.ok(created.template);
  assert.equal(created.template.version, 2);
  assert.equal(created.template.exercises.length, 2);
  assert.equal(created.template.exercises[0].exerciseId, 'bench-press');
  assert.equal(created.template.exercises[1].exerciseId, 'overhead-press');
});

test('7. saveStoredRoutines and getStoredRoutines roundtrip V2 templates cleanly', () => {
  const v2Routine: Routine = {
    id: 'rot-storage-test',
    userId: 'u1',
    name: 'Storage Test',
    exerciseIds: ['deadlift'],
    template: {
      version: 2,
      exercises: [
        {
          exerciseId: 'deadlift',
          sets: [
            { setType: 'warmup', targetWeightKg: 60 },
            { setType: 'working', targetWeightKg: 140 }
          ]
        }
      ]
    }
  };

  saveStoredRoutines([v2Routine]);
  const loaded = getStoredRoutines();
  const matched = loaded.find((r) => r.id === 'rot-storage-test');
  assert.ok(matched);
  assert.deepEqual(matched?.template, v2Routine.template);
});
