import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveExercisePreviousPerformance } from './exercisePerformance.js';
import { canonicalizeRoutineId, isDatabaseUuidLiteral, toDatabaseUuid } from './routineIdentity.js';
import type { WorkoutSession } from './types.js';

const set = (setIndex: number, weightKg: number, reps: number, setType: 'warmup' | 'working' | 'drop' | 'backoff' = 'working', completed = true) =>
  ({ setIndex, weightKg, reps, setType, completed });
const session = (id: string, startedAt: string, sets: WorkoutSession['sets'], routineId?: string): WorkoutSession =>
  ({ id, userId: 'user', startedAt, routineId, sets });

test('latest physical performance is exercise-centric and retains complete ordered set bundle', () => {
  const history = [
    session('older', '2026-09-01T10:00:00Z', { bench: [set(1, 90, 5)] }, 'routine-a'),
    session('newer', '2026-09-02T10:00:00Z', { bench: [
      set(3, 80, 8, 'working'), set(1, 40, 12, 'warmup'), set(4, 65, 10, 'drop'), set(2, 75, 8, 'backoff')
    ] }, 'routine-b')
  ];
  const head = resolveExercisePreviousPerformance({ exerciseId: 'bench', history });
  assert.equal(head?.sessionId, 'newer');
  assert.deepEqual(head?.sets.map((item) => [item.setType, item.weightKg, item.reps]), [
    ['warmup', 40, 12], ['backoff', 75, 8], ['working', 80, 8], ['drop', 65, 10]
  ]);
});

test('skipped and uncompleted newer sessions do not hide last performed bundle', () => {
  const history = [
    session('performed', '2026-09-01T10:00:00Z', { bench: [set(1, 80, 8)] }),
    session('skipped', '2026-09-03T10:00:00Z', {}),
    session('uncompleted', '2026-09-04T10:00:00Z', { bench: [set(1, 95, 5, 'working', false)] })
  ];
  assert.equal(resolveExercisePreviousPerformance({ exerciseId: 'bench', history })?.sessionId, 'performed');
});

test('historical cutoff is exclusive and chronology wins over recording time', () => {
  const history = [
    { ...session('historic', '2026-09-01T10:00:00Z', { bench: [set(1, 60, 8)] }), recordedAt: '2026-09-28T10:00:00Z', entrySource: 'historical_manual' as const },
    session('future', '2026-09-20T10:00:00Z', { bench: [set(1, 90, 8)] })
  ];
  assert.equal(resolveExercisePreviousPerformance({ exerciseId: 'bench', history, beforeTimestamp: Date.parse('2026-09-20T10:00:00Z') })?.sessionId, 'historic');
});

test('remote head outside recent history competes with local unsynced head by physical time', () => {
  const remoteHead = { exerciseId: 'bench', sessionId: 'remote', startedAt: '2026-09-15T10:00:00Z', sets: [set(1, 80, 8)] };
  assert.equal(resolveExercisePreviousPerformance({ exerciseId: 'bench', history: [], remoteHead })?.sessionId, 'remote');
  assert.equal(resolveExercisePreviousPerformance({ exerciseId: 'bench', history: [session('local', '2026-09-16T10:00:00Z', { bench: [set(1, 85, 8)] })], remoteHead })?.sessionId, 'local');
});

test('legacy client ID mapping matches persisted API UUID and leaves real UUID unchanged', () => {
  assert.equal(toDatabaseUuid('rt-123'), '00000000-0000-4000-8000-000036ffafd9');
  assert.equal(toDatabaseUuid('00000000-0000-4000-8000-000036ffafd9'), '00000000-0000-4000-8000-000036ffafd9');
});

test('routine canonicalization preserves PostgreSQL UUIDs outside RFC variant/version rules', () => {
  const postgresId = '00000000-0000-0000-0000-000000000010';
  const v4 = 'a013d78e-89fa-46e3-8d6d-2640ca025468';
  assert.equal(isDatabaseUuidLiteral(postgresId), true);
  assert.notEqual(toDatabaseUuid(postgresId), postgresId); // Historical mapper remains byte-for-byte unchanged.
  assert.equal(canonicalizeRoutineId(postgresId), postgresId);
  assert.equal(canonicalizeRoutineId(v4), v4);
  assert.equal(canonicalizeRoutineId('rt-123'), '00000000-0000-4000-8000-000036ffafd9');
});
