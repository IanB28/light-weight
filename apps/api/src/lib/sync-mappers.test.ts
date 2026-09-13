import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hydrateSyncedSet,
  normalizeIncomingSyncSet,
  normalizeIncomingSyncSessions,
  SyncValidationError
} from './sync-mappers.js';

const base = { setIndex: 1, weightKg: 100, reps: 5, completed: true };

test('sync input preserves canonical drop and backoff types', () => {
  assert.deepEqual(normalizeIncomingSyncSet({ ...base, setType: 'drop' }), {
    ...base,
    setType: 'drop',
    isWarmup: false
  });
  assert.equal(normalizeIncomingSyncSet({ ...base, setType: 'backoff' }).setType, 'backoff');
});

test('sync input normalizes legacy warmup mirror and rejects unknown explicit types', () => {
  assert.equal(normalizeIncomingSyncSet({ ...base, isWarmup: true }).setType, 'warmup');
  assert.equal(normalizeIncomingSyncSet({ ...base, isWarmup: false }).setType, 'working');
  assert.throws(
    () => normalizeIncomingSyncSet({ ...base, setType: 'cluster' }),
    SyncValidationError
  );
});

test('sync hydration always returns canonical and coherent set fields', () => {
  assert.deepEqual(hydrateSyncedSet({ ...base, setType: 'warmup', isWarmup: false }), {
    ...base,
    setType: 'warmup',
    isWarmup: true
  });
  assert.equal(hydrateSyncedSet({ ...base, isWarmup: true }).setType, 'warmup');
  assert.equal(hydrateSyncedSet({ ...base, setType: 'drop' }).setType, 'drop');
  assert.equal(hydrateSyncedSet({ ...base, setType: 'backoff' }).setType, 'backoff');
});

test('sync session serialization preserves canonical types across exercise groups', () => {
  const [session] = normalizeIncomingSyncSessions([{
    id: 'session',
    startedAt: '2026-09-13T00:00:00.000Z',
    sets: {
      bench: [{ ...base, setType: 'drop' }],
      squat: [{ ...base, setType: 'backoff' }]
    }
  }]);
  assert.equal(session.sets.bench[0].setType, 'drop');
  assert.equal(session.sets.squat[0].setType, 'backoff');
});
