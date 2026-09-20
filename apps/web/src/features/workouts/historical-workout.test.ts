import test from 'node:test';
import assert from 'node:assert/strict';
import type { Exercise, MachineProfile, WorkoutSession } from '@light-weight/domain';
import { getStoredActiveWorkout, saveActiveWorkout, upsertHistoryByStartedAt, upsertStoredHistory } from '../../lib/storage.js';
import { buildWorkoutHistoryIndex } from '../../lib/workout-history-index.js';
import { createHistoricalWorkoutSession, HistoricalWorkoutValidationError } from './historical-workout.js';

const bench: Exercise = {
  id: 'bench',
  name: 'Bench press',
  category: 'barbell',
  primaryMuscle: 'chest'
};

const draft = (overrides: Partial<Parameters<typeof createHistoricalWorkoutSession>[0]> = {}) => ({
  userId: 'user',
  performedDate: '2026-08-10',
  performedTime: '19:30',
  exercises: [{ exercise: bench, sets: [{ weight: '100', reps: '5', rir: '', setType: 'working' as const }] }],
  ...overrides
});

test('historical editor creates only explicit physical values and retains provenance', () => {
  const recordedAt = new Date('2026-09-20T10:00:00.000Z');
  const session = createHistoricalWorkoutSession(draft({ durationMinutes: '75' }), recordedAt);
  assert.equal(session.performedDate, '2026-08-10');
  assert.equal(session.entrySource, 'historical_manual');
  assert.equal(session.recordedAt, recordedAt.toISOString());
  // The ISO day can cross a UTC boundary; the local physical wall-clock fact
  // must remain the selected date/time while performedDate carries its key.
  const started = new Date(session.startedAt);
  assert.equal(started.getFullYear(), 2026);
  assert.equal(started.getMonth(), 7);
  assert.equal(started.getDate(), 10);
  assert.equal(started.getHours(), 19);
  assert.equal(started.getMinutes(), 30);
  assert.ok(session.endedAt);
  assert.equal(session.sets.bench[0].weightKg, 100);
  assert.equal(session.sets.bench[0].reps, 5);
  assert.equal(session.sets.bench[0].rir, undefined);
});

test('historical editor rejects missing physical values, future facts, and impossible chronology', () => {
  assert.throws(
    () => createHistoricalWorkoutSession(draft({ exercises: [{ exercise: bench, sets: [{ weight: '', reps: '', rir: '', setType: 'working' }] }] }), new Date('2026-09-20T10:00:00.000Z')),
    HistoricalWorkoutValidationError
  );
  assert.throws(
    () => createHistoricalWorkoutSession(draft({ performedDate: '2099-01-01' }), new Date('2026-09-20T10:00:00.000Z')),
    HistoricalWorkoutValidationError
  );
  assert.throws(
    () => createHistoricalWorkoutSession(draft({ performedDate: '2026-09-21' }), new Date('2026-09-20T10:00:00.000Z')),
    HistoricalWorkoutValidationError
  );
});

test('historical physical facts parse display units, preserve explicit zero, and reject blanks', () => {
  const now = new Date('2026-09-20T10:00:00.000Z');
  assert.equal(createHistoricalWorkoutSession(draft({ units: 'metric' }), now).sets.bench[0].weightKg, 100);
  assert.ok(Math.abs(createHistoricalWorkoutSession(draft({ units: 'imperial', exercises: [{ exercise: bench, sets: [{ weight: '225', reps: '5', rir: '', setType: 'working' }] }] }), now).sets.bench[0].weightKg - 102.058) < 0.01);
  assert.equal(createHistoricalWorkoutSession(draft({ exercises: [{ exercise: bench, sets: [{ weight: '0', reps: '10', rir: '', setType: 'working' }] }] }), now).sets.bench[0].weightKg, 0);
  assert.throws(() => createHistoricalWorkoutSession(draft({ exercises: [{ exercise: bench, sets: [{ weight: '', reps: '10', rir: '', setType: 'working' }] }] }), now), HistoricalWorkoutValidationError);
  assert.throws(() => createHistoricalWorkoutSession(draft({ units: 'metric', exercises: [{ exercise: bench, sets: [{ weight: '-10', reps: '10', rir: '', setType: 'working' }] }] }), now), HistoricalWorkoutValidationError);
  assert.throws(() => createHistoricalWorkoutSession(draft({ units: 'imperial', exercises: [{ exercise: bench, sets: [{ weight: '-10', reps: '10', rir: '', setType: 'working' }] }] }), now), HistoricalWorkoutValidationError);
});

test('historical machine semantics follow the loading profile, not the legacy category', () => {
  const now = new Date('2026-09-20T10:00:00.000Z');
  const selectorized: Exercise = { id: 'selectorized', name: 'Selectorized press', category: 'machine', primaryMuscle: 'chest', loading: { mechanism: 'selectorized', loadMode: 'total', supportsKeyboard: true, supportsPlates: false, supportsExternalLoad: true, includeBarWeight: false } };
  const plateLoaded: Exercise = { id: 'plate-loaded', name: 'Plate loaded press', category: 'other', primaryMuscle: 'chest', loading: { mechanism: 'plate_loaded', loadMode: 'total', supportsKeyboard: true, supportsPlates: true, supportsExternalLoad: true, includeBarWeight: false, hasMachineBase: true } };
  const selectorizedSet = createHistoricalWorkoutSession(draft({ exercises: [{ exercise: selectorized, sets: [{ weight: '100', reps: '8', rir: '', setType: 'working' }] }] }), now).sets.selectorized[0];
  const plateSet = createHistoricalWorkoutSession(draft({ exercises: [{ exercise: plateLoaded, sets: [{ weight: '100', reps: '8', rir: '', setType: 'working' }] }] }), now).sets['plate-loaded'][0];
  assert.equal(selectorizedSet.machineBaseResistanceStatus, undefined);
  assert.equal(plateSet.machineBaseResistanceStatus, 'unknown');
});

test('historical sessions immediately group by performed date and derive a PR at its physical timestamp', () => {
  const historical = createHistoricalWorkoutSession(draft(), new Date('2026-09-20T10:00:00.000Z'));
  const recent: WorkoutSession = {
    id: 'recent', userId: 'user', startedAt: '2026-09-18T18:00:00.000Z',
    sets: { bench: [{ setIndex: 1, weightKg: 90, reps: 5, completed: true, setType: 'working' }] }
  };
  const index = buildWorkoutHistoryIndex([recent, historical]);
  assert.equal(index.sessionsByDate['2026-08-10'][0].id, historical.id);
  assert.equal(index.personalRecordsByExercise.bench.weightKg, 100);
  assert.equal(index.personalRecordsByExercise.bench.date, historical.startedAt);
  assert.equal(index.latestPerformanceByExercise.bench.lastDate, recent.startedAt);
});

test('historical insertion is deduplicated and ordered by performed instant, never recordedAt', () => {
  const historical = createHistoricalWorkoutSession(draft(), new Date('2026-09-20T10:00:00.000Z'));
  const current: WorkoutSession = {
    id: 'current', userId: 'user', startedAt: '2026-09-18T18:00:00.000Z',
    sets: { bench: [{ setIndex: 1, weightKg: 90, reps: 5, completed: true, setType: 'working' }] }
  };
  const updated = upsertHistoryByStartedAt([current], historical);
  assert.deepEqual(updated.map((session) => session.id), ['current', historical.id]);
  assert.equal(upsertHistoryByStartedAt(updated, historical).filter((session) => session.id === historical.id).length, 1);
});

test('multiple sessions retain the same performed day and historical machines snapshot selected or unknown bases', () => {
  const first = createHistoricalWorkoutSession(draft(), new Date('2026-09-20T10:00:00.000Z'));
  const second = createHistoricalWorkoutSession(draft({ performedTime: '20:30' }), new Date('2026-09-20T10:00:00.000Z'));
  const grouped = buildWorkoutHistoryIndex([first, second]);
  assert.equal(grouped.sessionsByDate['2026-08-10'].length, 2);

  const machine: Exercise = { id: 'leg-press', name: 'Leg press', category: 'machine', primaryMuscle: 'quadriceps', loading: { mechanism: 'plate_loaded', loadMode: 'total', supportsKeyboard: true, supportsPlates: true, supportsExternalLoad: true, includeBarWeight: false, hasMachineBase: true } };
  const unknownMachine = createHistoricalWorkoutSession(draft({ exercises: [{ exercise: machine, sets: [{ weight: '100', reps: '8', rir: '', setType: 'working' }] }] }), new Date('2026-09-20T10:00:00.000Z'));
  assert.equal(unknownMachine.sets['leg-press'][0].weightKg, 100);
  assert.equal(unknownMachine.sets['leg-press'][0].machineBaseResistanceStatus, 'unknown');
  assert.equal(unknownMachine.sets['leg-press'][0].machineBaseResistanceKg, undefined);

  const profile: MachineProfile = {
    id: 'old-machine', exerciseId: 'leg-press', label: 'Machine Old', baseResistanceStatus: 'user_defined', baseResistanceKg: 20,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
  };
  const profiled = createHistoricalWorkoutSession(draft({ exercises: [{ exercise: machine, machineProfile: profile, sets: [{ weight: '100', reps: '8', rir: '', setType: 'working' }] }] }), new Date('2026-09-20T10:00:00.000Z'));
  assert.equal(profiled.sets['leg-press'][0].machineProfileId, 'old-machine');
  assert.equal(profiled.sets['leg-press'][0].machineBaseResistanceKg, 20);
});

test('historical routine snapshots its identity and remains independent from later routine edits', () => {
  const session = createHistoricalWorkoutSession(draft({ routineId: 'routine-push', routineName: 'Push A' }), new Date('2026-09-20T10:00:00.000Z'));
  assert.equal(session.routineId, 'routine-push');
  assert.equal(session.routineName, 'Push A');
  // Session data is a physical snapshot; routine mutation cannot mutate it.
  const renamedRoutine = { id: 'routine-push', name: 'Renamed push' };
  assert.notEqual(session.routineName, renamedRoutine.name);
  assert.equal(session.sets.bench[0].weightKg, 100);
});

test('historical save upserts history without clearing the persisted active workout', () => {
  const memory = new Map<string, string>();
  const storage = { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) };
  const active = { isWorkoutActive: true, workoutStartedAt: '2026-09-19T23:55:00.000Z', performedDate: '2026-09-19', exerciseSessions: [{ exercise: bench, sets: [{ setIndex: 1, weightKg: 90, reps: 5, completed: false, setType: 'working' as const }] }] };
  saveActiveWorkout(active, storage);
  const activeBeforeSave = getStoredActiveWorkout<typeof active>(storage);
  const historical = createHistoricalWorkoutSession(draft(), new Date('2026-09-20T10:00:00.000Z'));
  // The generic history write has no active-workout side effect.
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) } });
  try {
    upsertStoredHistory(historical);
    assert.ok(getStoredActiveWorkout<typeof active>(storage));
    assert.deepEqual(getStoredActiveWorkout<typeof active>(storage), activeBeforeSave);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
});
