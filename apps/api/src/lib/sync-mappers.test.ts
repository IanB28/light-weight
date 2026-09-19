import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hydrateSyncedSet,
  normalizeIncomingSyncSet,
  normalizeIncomingSyncSessions,
  SyncValidationError,
  type SyncSetInput
} from './sync-mappers.js';

const base: SyncSetInput = { setIndex: 1, weightKg: 100, reps: 5, completed: true };

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

test('sync input accepts missing and valid effort, and rejects malformed values', () => {
  // Missing effort is completely valid
  const missing = normalizeIncomingSyncSet({ ...base });
  assert.equal(missing.rir, undefined);
  assert.equal(missing.rpe, undefined);

  // Valid RIR
  assert.equal(normalizeIncomingSyncSet({ ...base, rir: 0 }).rir, 0);
  assert.equal(normalizeIncomingSyncSet({ ...base, rir: 2 }).rir, 2);
  assert.equal(normalizeIncomingSyncSet({ ...base, rir: 6 }).rir, 6);
  assert.equal(normalizeIncomingSyncSet({ ...base, rir: 8 }).rir, 8);

  // Valid RPE
  assert.equal(normalizeIncomingSyncSet({ ...base, rpe: 8.5 }).rpe, 8.5);
  assert.equal(normalizeIncomingSyncSet({ ...base, rpe: 10 }).rpe, 10);

  // Reject negative RIR
  assert.throws(
    () => normalizeIncomingSyncSet({ ...base, rir: -1 }),
    (err: unknown) => err instanceof SyncValidationError && err.code === 'INVALID_RIR'
  );
  assert.throws(
    () => normalizeIncomingSyncSet({ ...base, rir: -2 }),
    (err: unknown) => err instanceof SyncValidationError && err.code === 'INVALID_RIR'
  );

  // Reject non-integer / malformed RIR
  assert.throws(
    () => normalizeIncomingSyncSet({ ...base, rir: 1.5 }),
    (err: unknown) => err instanceof SyncValidationError && err.code === 'INVALID_RIR'
  );
  assert.throws(
    () => normalizeIncomingSyncSet({ ...base, rir: NaN }),
    (err: unknown) => err instanceof SyncValidationError && err.code === 'INVALID_RIR'
  );

  // Reject out-of-range RPE
  assert.throws(
    () => normalizeIncomingSyncSet({ ...base, rpe: 10.5 }),
    (err: unknown) => err instanceof SyncValidationError && err.code === 'INVALID_RPE'
  );
  assert.throws(
    () => normalizeIncomingSyncSet({ ...base, rpe: -1 }),
    (err: unknown) => err instanceof SyncValidationError && err.code === 'INVALID_RPE'
  );
});

test('sync hydration safely degrades malformed legacy effort to undefined without throwing', () => {
  const malformedRir = hydrateSyncedSet({ ...base, rir: -1 });
  assert.equal(malformedRir.rir, undefined);

  const malformedRpe = hydrateSyncedSet({ ...base, rpe: 15 });
  assert.equal(malformedRpe.rpe, undefined);

  const validEffort = hydrateSyncedSet({ ...base, rir: 2, rpe: 8 });
  assert.equal(validEffort.rir, 2);
  assert.equal(validEffort.rpe, 8);
});
