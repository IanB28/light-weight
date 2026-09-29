import test from 'node:test';
import assert from 'node:assert/strict';
import type { Exercise, WorkoutSession } from '@light-weight/domain';
import { buildWorkoutHistoryIndex } from '../../lib/workout-history-index.js';
import { createDefaultExerciseSession } from './useWorkoutSession.js';
import { buildRoutineExerciseSessions } from './routine-previous-performance.js';

const bench: Exercise = { id: 'bench', name: 'Bench Press', category: 'barbell', primaryMuscle: 'chest' };

test('free exercise starts with the complete latest performed bundle, not three copies of a top set', () => {
  const history: WorkoutSession[] = [{
    id: 'performed', userId: 'athlete', startedAt: '2026-09-20T10:00:00.000Z',
    sets: { bench: [
      { setIndex: 1, weightKg: 40, reps: 12, rir: 4, setType: 'warmup', completed: true },
      { setIndex: 2, weightKg: 80, reps: 8, rir: 2, setType: 'working', completed: true },
      { setIndex: 3, weightKg: 80, reps: 7, rir: 1, setType: 'working', completed: true },
      { setIndex: 4, weightKg: 70, reps: 10, rir: 2, setType: 'backoff', completed: true }
    ] }
  }];
  const active = createDefaultExerciseSession(bench, { historyIndex: buildWorkoutHistoryIndex(history) });
  assert.deepEqual(active.sets.map(({ weightKg, reps, rir, setType, completed }) => ({ weightKg, reps, rir, setType, completed })), [
    { weightKg: 40, reps: 12, rir: 4, setType: 'warmup', completed: false },
    { weightKg: 80, reps: 8, rir: 2, setType: 'working', completed: false },
    { weightKg: 80, reps: 7, rir: 1, setType: 'working', completed: false },
    { weightKg: 70, reps: 10, rir: 2, setType: 'backoff', completed: false }
  ]);
});

test('routine start uses latest exercise performance even when performed in a different routine', () => {
  const history: WorkoutSession[] = [{
    id: 'free', userId: 'athlete', startedAt: '2026-09-22T10:00:00.000Z',
    sets: { bench: [{ setIndex: 1, weightKg: 82, reps: 7, setType: 'working', completed: true }] }
  }];
  const sessions = buildRoutineExerciseSessions({
    routine: { id: 'routine-b', userId: 'athlete', name: 'Push', exerciseIds: ['bench'],
      template: { version: 2, exercises: [{ exerciseId: 'bench', sets: [{ setType: 'warmup', targetWeightKg: 0 }] }] } },
    exercisesById: { bench }, history,
    createBaseExerciseSession: (exercise) => createDefaultExerciseSession(exercise)
  });
  assert.deepEqual(sessions[0].sets.map((set) => [set.weightKg, set.reps, set.setType]), [[82, 7, 'working']]);
});

test('remote complete head outside bounded pull hydrates free entry, but newer unsynced local head wins', () => {
  const remoteHead = { exerciseId: 'bench', sessionId: 'remote-old', startedAt: '2026-01-01T10:00:00Z',
    sets: [
      { setIndex: 1, weightKg: 40, reps: 12, setType: 'warmup' as const, completed: true },
      { setIndex: 2, weightKg: 80, reps: 8, setType: 'working' as const, completed: true }
    ] };
  const recentOtherSessions: WorkoutSession[] = Array.from({ length: 51 }, (_, index) => ({
    id: `other-${index}`, userId: 'athlete', startedAt: `2026-09-${String(index % 28 + 1).padStart(2, '0')}T10:00:00Z`,
    sets: { squat: [{ setIndex: 1, weightKg: 100, reps: 5, setType: 'working', completed: true }] }
  }));
  const remoteIndex = buildWorkoutHistoryIndex(recentOtherSessions, { remoteExercisePerformanceHeads: { bench: remoteHead } });
  assert.deepEqual(createDefaultExerciseSession(bench, { historyIndex: remoteIndex }).sets.map((set) => set.weightKg), [40, 80]);
  const local: WorkoutSession = { id: 'local-new', userId: 'athlete', startedAt: '2026-09-27T10:00:00Z',
    sets: { bench: [{ setIndex: 1, weightKg: 85, reps: 7, setType: 'working', completed: true }] } };
  const localIndex = buildWorkoutHistoryIndex([...recentOtherSessions, local], { remoteExercisePerformanceHeads: { bench: remoteHead } });
  assert.deepEqual(createDefaultExerciseSession(bench, { historyIndex: localIndex }).sets.map((set) => set.weightKg), [85]);
});

test('historical WorkoutSession contributes previous sets, while HistoricalPersonalRecord contributes only PR', () => {
  const history: WorkoutSession[] = [{
    id: 'historic-workout', userId: 'athlete', startedAt: '2026-08-10T10:00:00Z',
    performedDate: '2026-08-10', recordedAt: '2026-09-20T10:00:00Z', entrySource: 'historical_manual',
    sets: { bench: [{ setIndex: 1, weightKg: 60, reps: 10, setType: 'working', completed: true }] }
  }];
  const index = buildWorkoutHistoryIndex(history, { exercisesById: { bench }, historicalPersonalRecords: [{
    id: 'hpr', userId: 'athlete', exerciseId: 'bench', performedDate: '2026-09-01',
    recordedAt: '2026-09-21T10:00:00Z', bodyweightKg: 80, source: 'historical_manual',
    set: { setIndex: 1, weightKg: 120, reps: 1, setType: 'working', completed: true }
  }] });
  const active = createDefaultExerciseSession(bench, { historyIndex: index });
  assert.deepEqual(active.sets.map((set) => set.weightKg), [60]);
  assert.match(active.bestRecord ?? '', /120/);
});

test('higher historical PR never replaces later physical performance, and old machine snapshot is cleared', () => {
  const history: WorkoutSession[] = [
    { id: 'pr', userId: 'athlete', startedAt: '2026-08-01T10:00:00Z',
      sets: { bench: [{ setIndex: 1, weightKg: 110, reps: 1, setType: 'working', completed: true }] } },
    { id: 'latest', userId: 'athlete', startedAt: '2026-09-20T10:00:00Z',
      sets: { bench: [{ setIndex: 1, weightKg: 70, reps: 8, rir: 2, setType: 'drop', completed: true,
        machineProfileId: 'old-machine', machineProfileLabel: 'Old gym', machineBaseResistanceKg: 20,
        machineBaseResistanceStatus: 'user_defined' }] } }
  ];
  const active = createDefaultExerciseSession(bench, { historyIndex: buildWorkoutHistoryIndex(history, { exercisesById: { bench } }) });
  assert.equal(active.sets[0].weightKg, 70);
  assert.equal(active.sets[0].setType, 'drop');
  assert.equal(active.sets[0].rir, 2);
  assert.equal(active.sets[0].machineProfileId, undefined);
  assert.equal(active.sets[0].machineBaseResistanceStatus, undefined);
  assert.match(active.bestRecord ?? '', /110/);
});

test('new free exercise without history begins with one zero-load warmup', () => {
  const active = createDefaultExerciseSession(bench);
  assert.deepEqual(active.sets.map(({ setIndex, weightKg, reps, setType, completed, rir }) =>
    ({ setIndex, weightKg, reps, setType, completed, rir })), [
    { setIndex: 1, weightKg: 0, reps: 8, setType: 'warmup', completed: false, rir: undefined }
  ]);
});

test('historical as-of remote head competes with local before-cutoff work, never future/global head', () => {
  const cutoff = Date.parse('2026-06-01T10:00:00Z');
  const asOf = { exerciseId: 'bench', sessionId: 'remote-january', startedAt: '2026-01-10T10:00:00Z',
    sets: [{ setIndex: 1, weightKg: 70, reps: 8, setType: 'working' as const, completed: true }] };
  const globalFuture = { ...asOf, sessionId: 'remote-september', startedAt: '2026-09-20T10:00:00Z' };
  const local: WorkoutSession[] = [
    { id: 'local-may', userId: 'athlete', startedAt: '2026-05-10T10:00:00Z',
      sets: { bench: [{ setIndex: 1, weightKg: 75, reps: 7, setType: 'working', completed: true }] } },
    { id: 'local-july', userId: 'athlete', startedAt: '2026-07-10T10:00:00Z',
      sets: { bench: [{ setIndex: 1, weightKg: 95, reps: 5, setType: 'working', completed: true }] } }
  ];
  assert.deepEqual(createDefaultExerciseSession(bench, { history: [], beforeTimestamp: cutoff,
    remoteHead: globalFuture }).sets.map((set) => set.weightKg), [0]);
  assert.deepEqual(createDefaultExerciseSession(bench, { history: [], beforeTimestamp: cutoff,
    remoteHead: asOf }).sets.map((set) => set.weightKg), [70]);
  assert.deepEqual(createDefaultExerciseSession(bench, { history: local, beforeTimestamp: cutoff,
    remoteHead: asOf }).sets.map((set) => set.weightKg), [75]);
});
