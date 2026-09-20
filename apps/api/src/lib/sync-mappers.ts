import {
  isWorkoutSetType,
  normalizeLoggedSet,
  isValidRirValue,
  isValidRpeValue,
  isValidBaseResistanceStatus,
  isAuthoritativeProvenance,
  isValidWorkoutDateKey,
  isWorkoutEntrySource,
  isValidWorkoutTimestamp,
  type WorkoutSetType,
  type BaseResistanceStatus,
  type WorkoutEntrySource
} from '@light-weight/domain';

export class SyncValidationError extends Error {
  readonly status = 422;
  readonly code: string;

  constructor(code = 'INVALID_SET_TYPE', message = 'Invalid workout set type') {
    super(message);
    this.name = 'SyncValidationError';
    this.code = code;
  }
}

export interface SyncSetInput {
  setIndex: number;
  weightKg: number;
  reps: number;
  rir?: number;
  rpe?: number;
  completed?: boolean;
  setType?: unknown;
  isWarmup?: unknown;
  machineProfileId?: string;
  machineProfileLabel?: string;
  machineBaseResistanceKg?: number;
  machineBaseResistanceStatus?: unknown;
  machineBaseSourceLabel?: string;
  machineBaseSourceUrl?: string;
  machineManufacturer?: string;
  machineModel?: string;
}

export interface SyncSessionInput extends Record<string, unknown> {
  id?: string;
  routineId?: string;
  routineName?: string;
  startedAt: string;
  performedDate?: string;
  recordedAt?: string;
  entrySource?: WorkoutEntrySource;
  endedAt?: string;
  notes?: string;
  sets: Record<string, ReturnType<typeof normalizeIncomingSyncSet>[]>;
}

export function normalizeIncomingSyncSet<T extends SyncSetInput>(set: T): T & {
  setType: WorkoutSetType;
  isWarmup: boolean;
} {
  if (set.setType !== undefined && !isWorkoutSetType(set.setType)) {
    throw new SyncValidationError();
  }
  if (set.rir !== undefined && !isValidRirValue(set.rir)) {
    throw new SyncValidationError('INVALID_RIR', 'Invalid RIR value: must be a non-negative integer');
  }
  if (set.rpe !== undefined && !isValidRpeValue(set.rpe)) {
    throw new SyncValidationError('INVALID_RPE', 'Invalid RPE value: must be a finite number between 0 and 10');
  }
  if (set.machineBaseResistanceStatus !== undefined && !isValidBaseResistanceStatus(set.machineBaseResistanceStatus)) {
    throw new SyncValidationError('INVALID_MACHINE_BASE_STATUS', 'Invalid machine base resistance status');
  }
  if (
    set.machineBaseResistanceKg !== undefined &&
    (typeof set.machineBaseResistanceKg !== 'number' ||
      !Number.isFinite(set.machineBaseResistanceKg) ||
      set.machineBaseResistanceKg < 0)
  ) {
    throw new SyncValidationError('INVALID_MACHINE_BASE_KG', 'Invalid machine base resistance weight: must be a non-negative number');
  }
  if (set.machineBaseResistanceStatus === 'unknown' && set.machineBaseResistanceKg !== undefined) {
    throw new SyncValidationError('INVALID_MACHINE_BASE_UNKNOWN', 'Machine base resistance weight must not be set when status is unknown');
  }
  if (set.machineBaseResistanceStatus === 'none' && set.machineBaseResistanceKg !== undefined && set.machineBaseResistanceKg !== 0) {
    throw new SyncValidationError('INVALID_MACHINE_BASE_NONE', 'Machine base resistance weight must be 0 or omitted when status is none');
  }
  if (
    set.machineBaseResistanceStatus === 'suggested' ||
    set.machineBaseResistanceStatus === 'verified' ||
    set.machineBaseResistanceStatus === 'user_defined'
  ) {
    if (set.machineBaseResistanceKg === undefined || set.machineBaseResistanceKg <= 0) {
      throw new SyncValidationError('INVALID_MACHINE_BASE_KG', `Machine base resistance weight must be greater than 0 for status "${set.machineBaseResistanceStatus}"`);
    }
  }
  if (set.machineBaseResistanceStatus === 'verified') {
    const hasAuthoritative = isAuthoritativeProvenance({
      sourceUrl: set.machineBaseSourceUrl,
      manufacturer: set.machineManufacturer,
      model: set.machineModel,
      sourceLabel: set.machineBaseSourceLabel
    });
    if (!hasAuthoritative) {
      throw new SyncValidationError(
        'INVALID_MACHINE_BASE_PROVENANCE',
        'Verified machine base resistance requires authoritative provenance (valid URL or manufacturer + model + document identifier)'
      );
    }
  }
  if (set.machineBaseResistanceKg !== undefined && set.machineBaseResistanceStatus === undefined) {
    throw new SyncValidationError('INVALID_MACHINE_BASE_MISSING_STATUS', 'Machine base resistance status is required when machine base resistance weight is provided');
  }
  if (
    set.machineBaseResistanceKg !== undefined &&
    typeof set.weightKg === 'number' &&
    Number.isFinite(set.weightKg) &&
    set.weightKg < set.machineBaseResistanceKg
  ) {
    throw new SyncValidationError(
      'INVALID_MACHINE_TOTAL_LOAD',
      'Weight cannot be less than machine base resistance'
    );
  }
  return normalizeLoggedSet(set);
}

export function hydrateSyncedSet<T extends SyncSetInput>(set: T): T & {
  setType: WorkoutSetType;
  isWarmup: boolean;
} {
  return normalizeLoggedSet(set);
}

export function normalizeIncomingSyncSessions(value: unknown): SyncSessionInput[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((session): session is Record<string, unknown> => Boolean(session) && typeof session === 'object' && !Array.isArray(session))
    .map((session) => {
      if (typeof session.startedAt !== 'string' || Number.isNaN(new Date(session.startedAt).getTime())) {
        throw new SyncValidationError('INVALID_SESSION_DATE', 'Invalid workout session start date');
      }
      if (session.endedAt !== undefined && (!isValidWorkoutTimestamp(session.endedAt) || Date.parse(session.endedAt) < Date.parse(session.startedAt))) {
        throw new SyncValidationError('INVALID_SESSION_END', 'Invalid workout session end date');
      }
      if (session.performedDate !== undefined && !isValidWorkoutDateKey(session.performedDate)) {
        throw new SyncValidationError('INVALID_PERFORMED_DATE', 'Invalid performed date');
      }
      if (session.recordedAt !== undefined && !isValidWorkoutTimestamp(session.recordedAt)) {
        throw new SyncValidationError('INVALID_RECORDED_AT', 'Invalid recorded date');
      }
      if (session.entrySource !== undefined && !isWorkoutEntrySource(session.entrySource)) {
        throw new SyncValidationError('INVALID_ENTRY_SOURCE', 'Invalid workout entry source');
      }
      if (session.entrySource === 'historical_manual' && (!session.recordedAt || Date.parse(session.startedAt) > Date.parse(session.recordedAt))) {
        throw new SyncValidationError('INVALID_HISTORICAL_PROVENANCE', 'Historical sessions require a recorded time after training');
      }
      // Historical facts cannot be dated materially in the future. A small
      // tolerance avoids rejecting a client whose clock is milliseconds ahead.
      if (session.entrySource === 'historical_manual' && Date.parse(session.startedAt) > Date.now() + 5 * 60_000) {
        throw new SyncValidationError('HISTORICAL_SESSION_IN_FUTURE', 'Historical sessions cannot be in the future');
      }
      const rawSets = session.sets && typeof session.sets === 'object' && !Array.isArray(session.sets)
        ? session.sets as Record<string, unknown>
        : {};
      const sets = Object.fromEntries(
        Object.entries(rawSets).map(([exerciseId, exerciseSets]) => [
          exerciseId,
          Array.isArray(exerciseSets)
            ? exerciseSets
                .filter((set): set is SyncSetInput => Boolean(set) && typeof set === 'object' && !Array.isArray(set))
                .map(normalizeIncomingSyncSet)
            : []
        ])
      );
      return { ...session, startedAt: session.startedAt, sets } as SyncSessionInput;
    });
}
