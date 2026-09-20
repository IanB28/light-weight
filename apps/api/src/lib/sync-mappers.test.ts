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

test('sync accepts legacy sessions and validates historical temporal provenance', () => {
  const [legacy] = normalizeIncomingSyncSessions([{
    id: 'legacy', startedAt: '2026-09-13T00:00:00.000Z', sets: { bench: [base] }
  }]);
  assert.equal(legacy.performedDate, undefined);
  assert.equal(legacy.entrySource, undefined);

  const [historical] = normalizeIncomingSyncSessions([{
    id: 'historical',
    startedAt: '2026-08-10T19:30:00.000Z',
    performedDate: '2026-08-10',
    recordedAt: '2026-09-20T10:00:00.000Z',
    entrySource: 'historical_manual',
    endedAt: '2026-08-10T20:45:00.000Z',
    sets: { bench: [base] }
  }]);
  assert.equal(historical.performedDate, '2026-08-10');
  assert.equal(historical.recordedAt, '2026-09-20T10:00:00.000Z');
  assert.equal(historical.entrySource, 'historical_manual');
});

test('sync rejects invalid temporal metadata before persistence', () => {
  const invalid = (session: Record<string, unknown>, code: string) => assert.throws(
    () => normalizeIncomingSyncSessions([{ id: 'bad', startedAt: '2026-09-13T10:00:00.000Z', sets: { bench: [base] }, ...session }]),
    (err: unknown) => err instanceof SyncValidationError && err.code === code
  );
  invalid({ performedDate: '2026-02-30' }, 'INVALID_PERFORMED_DATE');
  invalid({ entrySource: 'imported' }, 'INVALID_ENTRY_SOURCE');
  invalid({ recordedAt: 'not-a-date' }, 'INVALID_RECORDED_AT');
  invalid({ endedAt: '2026-09-13T09:59:59.000Z' }, 'INVALID_SESSION_END');
  invalid({ entrySource: 'historical_manual', recordedAt: '2026-09-12T10:00:00.000Z' }, 'INVALID_HISTORICAL_PROVENANCE');
  invalid({ entrySource: 'historical_manual', startedAt: '2099-01-01T10:00:00.000Z', recordedAt: '2099-01-01T10:01:00.000Z' }, 'HISTORICAL_SESSION_IN_FUTURE');
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

test('sync input accepts valid machine base resistance snapshots', () => {
  // 1. Suggested status with valid kg and profile metadata
  const suggested = normalizeIncomingSyncSet({
    ...base,
    machineProfileId: 'mp-smith-1',
    machineProfileLabel: 'Cybex Smith',
    machineBaseResistanceKg: 9.07,
    machineBaseResistanceStatus: 'suggested'
  });
  assert.equal(suggested.machineProfileId, 'mp-smith-1');
  assert.equal(suggested.machineProfileLabel, 'Cybex Smith');
  assert.equal(suggested.machineBaseResistanceKg, 9.07);
  assert.equal(suggested.machineBaseResistanceStatus, 'suggested');

  // 2. None status with 0 kg
  const noneStatus = normalizeIncomingSyncSet({
    ...base,
    machineProfileId: 'mp-none',
    machineProfileLabel: 'Counterbalanced to 0',
    machineBaseResistanceKg: 0,
    machineBaseResistanceStatus: 'none'
  });
  assert.equal(noneStatus.machineBaseResistanceKg, 0);
  assert.equal(noneStatus.machineBaseResistanceStatus, 'none');

  // 3. Unknown status with absent kg
  const unknownStatus = normalizeIncomingSyncSet({
    ...base,
    machineProfileId: 'mp-unk',
    machineProfileLabel: 'Uncalibrated Machine',
    machineBaseResistanceStatus: 'unknown'
  });
  assert.equal(unknownStatus.machineBaseResistanceStatus, 'unknown');
  assert.equal(unknownStatus.machineBaseResistanceKg, undefined);

  // 4. User defined status
  const userDefined = normalizeIncomingSyncSet({
    ...base,
    machineBaseResistanceKg: 20,
    machineBaseResistanceStatus: 'user_defined'
  });
  assert.equal(userDefined.machineBaseResistanceKg, 20);
  assert.equal(userDefined.machineBaseResistanceStatus, 'user_defined');
});

test('sync input rejects invalid machine base resistance inputs with 422', () => {
  // Reject invalid status string
  assert.throws(
    () => normalizeIncomingSyncSet({ ...base, machineBaseResistanceStatus: 'invalid_status' }),
    (err: unknown) => err instanceof SyncValidationError && err.code === 'INVALID_MACHINE_BASE_STATUS'
  );

  // Reject negative machineBaseResistanceKg
  assert.throws(
    () => normalizeIncomingSyncSet({
      ...base,
      machineBaseResistanceKg: -5,
      machineBaseResistanceStatus: 'user_defined'
    }),
    (err: unknown) => err instanceof SyncValidationError && err.code === 'INVALID_MACHINE_BASE_KG'
  );

  // Reject NaN / non-finite kg
  assert.throws(
    () => normalizeIncomingSyncSet({
      ...base,
      machineBaseResistanceKg: NaN,
      machineBaseResistanceStatus: 'user_defined'
    }),
    (err: unknown) => err instanceof SyncValidationError && err.code === 'INVALID_MACHINE_BASE_KG'
  );

  // Reject unknown status with non-null/non-undefined kg
  assert.throws(
    () => normalizeIncomingSyncSet({
      ...base,
      machineBaseResistanceKg: 10,
      machineBaseResistanceStatus: 'unknown'
    }),
    (err: unknown) => err instanceof SyncValidationError && err.code === 'INVALID_MACHINE_BASE_UNKNOWN'
  );

  // Reject suggested status without kg
  assert.throws(
    () => normalizeIncomingSyncSet({
      ...base,
      machineBaseResistanceStatus: 'suggested'
    }),
    (err: unknown) => err instanceof SyncValidationError && err.code === 'INVALID_MACHINE_BASE_KG'
  );

  // Reject none status with non-zero kg
  assert.throws(
    () => normalizeIncomingSyncSet({
      ...base,
      machineBaseResistanceKg: 10,
      machineBaseResistanceStatus: 'none'
    }),
    (err: unknown) => err instanceof SyncValidationError && err.code === 'INVALID_MACHINE_BASE_NONE'
  );

  // Canonical zero contract: reject suggested/user_defined/verified with 0 kg
  assert.throws(
    () => normalizeIncomingSyncSet({
      ...base,
      machineBaseResistanceKg: 0,
      machineBaseResistanceStatus: 'suggested'
    }),
    (err: unknown) => err instanceof SyncValidationError && err.code === 'INVALID_MACHINE_BASE_KG'
  );
  assert.throws(
    () => normalizeIncomingSyncSet({
      ...base,
      machineBaseResistanceKg: 0,
      machineBaseResistanceStatus: 'user_defined'
    }),
    (err: unknown) => err instanceof SyncValidationError && err.code === 'INVALID_MACHINE_BASE_KG'
  );

  // Reject verified status without authoritative provenance
  assert.throws(
    () => normalizeIncomingSyncSet({
      ...base,
      machineBaseResistanceKg: 20,
      machineBaseResistanceStatus: 'verified',
      machineBaseSourceLabel: 'manual notes' // NOT authoritative by itself!
    }),
    (err: unknown) => err instanceof SyncValidationError && err.code === 'INVALID_MACHINE_BASE_PROVENANCE'
  );
});

test('sync input accepts verified machine base resistance with authoritative provenance', () => {
  // Verified with valid http/https sourceUrl
  const withUrl = normalizeIncomingSyncSet({
    ...base,
    machineBaseResistanceKg: 15,
    machineBaseResistanceStatus: 'verified',
    machineBaseSourceUrl: 'https://cybexintl.com/specs/smith'
  });
  assert.equal(withUrl.machineBaseResistanceStatus, 'verified');
  assert.equal(withUrl.machineBaseResistanceKg, 15);
  assert.equal(withUrl.machineBaseSourceUrl, 'https://cybexintl.com/specs/smith');

  // Verified with structured manufacturer + model + sourceLabel
  const withStructured = normalizeIncomingSyncSet({
    ...base,
    machineBaseResistanceKg: 20,
    machineBaseResistanceStatus: 'verified',
    machineManufacturer: 'Hammer Strength',
    machineModel: 'Linear Leg Press',
    machineBaseSourceLabel: 'Manual Section 4.2'
  });
  assert.equal(withStructured.machineBaseResistanceStatus, 'verified');
  assert.equal(withStructured.machineBaseResistanceKg, 20);
  assert.equal(withStructured.machineManufacturer, 'Hammer Strength');
  assert.equal(withStructured.machineModel, 'Linear Leg Press');
});

test('sync hydration safely preserves machine base resistance or degrades missing cleanly', () => {
  const hydrated = hydrateSyncedSet({
    ...base,
    machineProfileId: 'mp-smith-1',
    machineProfileLabel: 'Cybex Smith',
    machineBaseResistanceKg: 9.07,
    machineBaseResistanceStatus: 'suggested'
  });
  assert.equal(hydrated.machineProfileId, 'mp-smith-1');
  assert.equal(hydrated.machineProfileLabel, 'Cybex Smith');
  assert.equal(hydrated.machineBaseResistanceKg, 9.07);
  assert.equal(hydrated.machineBaseResistanceStatus, 'suggested');

  // Hydration of verified with authoritative evidence retains verified
  const hydratedVerified = hydrateSyncedSet({
    ...base,
    machineBaseResistanceKg: 15,
    machineBaseResistanceStatus: 'verified',
    machineBaseSourceUrl: 'https://example.com/spec'
  });
  assert.equal(hydratedVerified.machineBaseResistanceStatus, 'verified');
  assert.equal(hydratedVerified.machineBaseResistanceKg, 15);
  assert.equal(hydratedVerified.machineBaseSourceUrl, 'https://example.com/spec');

  // Hydration of verified without authoritative evidence degrades to user_defined
  const degradedVerified = hydrateSyncedSet({
    ...base,
    machineBaseResistanceKg: 15,
    machineBaseResistanceStatus: 'verified',
    machineBaseSourceLabel: 'manual'
  });
  assert.equal(degradedVerified.machineBaseResistanceStatus, 'user_defined');
  assert.equal(degradedVerified.machineBaseResistanceKg, 15);

  // Legacy set without machine fields
  const legacy = hydrateSyncedSet({ ...base });
  assert.equal(legacy.machineProfileId, undefined);
  assert.equal(legacy.machineProfileLabel, undefined);
  assert.equal(legacy.machineBaseResistanceKg, undefined);
  assert.equal(legacy.machineBaseResistanceStatus, undefined);
});

test('sync input validates total load invariant weightKg >= machineBaseResistanceKg', () => {
  // Reject when weightKg < machineBaseResistanceKg
  assert.throws(
    () => normalizeIncomingSyncSet({
      ...base,
      weightKg: 15,
      machineBaseResistanceKg: 20,
      machineBaseResistanceStatus: 'user_defined'
    }),
    (err: unknown) => err instanceof SyncValidationError && err.code === 'INVALID_MACHINE_TOTAL_LOAD'
  );

  // Accept when weightKg >= machineBaseResistanceKg
  const validEqual = normalizeIncomingSyncSet({
    ...base,
    weightKg: 20,
    machineBaseResistanceKg: 20,
    machineBaseResistanceStatus: 'user_defined'
  });
  assert.equal(validEqual.weightKg, 20);
  assert.equal(validEqual.machineBaseResistanceKg, 20);

  const validGreater = normalizeIncomingSyncSet({
    ...base,
    weightKg: 100,
    machineBaseResistanceKg: 20,
    machineBaseResistanceStatus: 'user_defined'
  });
  assert.equal(validGreater.weightKg, 100);
  assert.equal(validGreater.machineBaseResistanceKg, 20);
});

test('sync hydration safely degrades contradictory total load claim (weightKg < base) without rewriting weightKg', () => {
  // Historical data where weightKg < machineBaseResistanceKg:
  // preserves weightKg, degrades machineBaseResistanceKg to undefined and status to unknown/absent, strips provenance
  const degraded = hydrateSyncedSet({
    ...base,
    weightKg: 10,
    machineProfileId: 'mp-smith-legacy',
    machineProfileLabel: 'Gym Smith',
    machineBaseResistanceKg: 20,
    machineBaseResistanceStatus: 'user_defined',
    machineBaseSourceLabel: 'Some label'
  });
  assert.equal(degraded.weightKg, 10);
  assert.equal(degraded.machineProfileId, 'mp-smith-legacy');
  assert.equal(degraded.machineProfileLabel, 'Gym Smith');
  assert.equal(degraded.machineBaseResistanceKg, undefined);
  assert.equal(degraded.machineBaseResistanceStatus, 'unknown');
  assert.equal(degraded.machineBaseSourceLabel, undefined);

  // Without profileId, status degrades to undefined
  const degradedNoProfile = hydrateSyncedSet({
    ...base,
    weightKg: 5,
    machineBaseResistanceKg: 15,
    machineBaseResistanceStatus: 'suggested'
  });
  assert.equal(degradedNoProfile.weightKg, 5);
  assert.equal(degradedNoProfile.machineBaseResistanceKg, undefined);
  assert.equal(degradedNoProfile.machineBaseResistanceStatus, undefined);
});
