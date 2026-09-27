import {
  DEFAULT_EXERCISE_LOADING_PROFILE,
  formatLocalWorkoutDateKey,
  isValidRirValue,
  isValidWorkoutDateKey,
  isValidWorkoutSet,
  isPlateLoadedMachine,
  normalizeLoggedSet,
  normalizeWorkoutSession,
  resolveExerciseLoadingProfile,
  type Exercise,
  type LoggedSet,
  type MachineProfile,
  type WorkoutSession,
  type WorkoutSetType
} from '@light-weight/domain';
import { parseDisplayWeight } from '../../lib/weight-units.js';
import type { UnitSystem } from '../../lib/preferences.js';
import type { ActiveExerciseSession } from './types.js';

export interface HistoricalSetDraft {
  weight: string;
  reps: string;
  rir: string;
  setType: WorkoutSetType;
}

export interface HistoricalExerciseDraft {
  exercise: Exercise;
  sets: HistoricalSetDraft[];
  machineProfile?: MachineProfile;
}

export interface HistoricalWorkoutDraft {
  userId: string;
  routineId?: string;
  performedDate: string;
  performedTime: string;
  durationMinutes?: string;
  routineName?: string;
  units?: UnitSystem;
  exercises: HistoricalExerciseDraft[];
}

export type HistoricalWorkoutValidationCode =
  | 'invalid_time'
  | 'future_date'
  | 'not_historical_date'
  | 'invalid_duration'
  | 'invalid_set'
  | 'machine_base'
  | 'invalid_recorded_at';

export class HistoricalWorkoutValidationError extends Error {
  constructor(readonly code: HistoricalWorkoutValidationCode) { super(code); }
}

/**
 * Canonical helper returning local yesterday's calendar date key (YYYY-MM-DD).
 */
export function getLatestHistoricalDateKey(relativeTo = new Date()): string {
  const yesterday = new Date(relativeTo.getFullYear(), relativeTo.getMonth(), relativeTo.getDate() - 1);
  return formatLocalWorkoutDateKey(yesterday);
}

/**
 * Strict calendar date check: historical entry date must strictly precede today.
 */
export function isStrictlyPastDateKey(dateKey: string, relativeTo = new Date()): boolean {
  if (!isValidWorkoutDateKey(dateKey)) return false;
  const todayKey = formatLocalWorkoutDateKey(relativeTo);
  return dateKey < todayKey;
}

/**
 * Validates HH:mm time format within 00:00 to 23:59.
 */
export function isValidPerformedTime(time: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(time)) return false;
  const [hours, minutes] = time.split(':').map(Number);
  return Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

/**
 * Validates optional duration: empty or integer between 1 and 1440 minutes.
 */
export function isValidHistoricalDuration(durationText?: string): boolean {
  if (durationText === undefined || durationText.trim() === '') return true;
  const num = Number(durationText.trim());
  return Number.isInteger(num) && num > 0 && num <= 1_440;
}

function createLocalInstant(dateKey: string, time: string): Date {
  if (!isValidWorkoutDateKey(dateKey) || !isValidPerformedTime(time)) {
    throw new HistoricalWorkoutValidationError('invalid_time');
  }
  const local = new Date(`${dateKey}T${time}:00`);
  if (!Number.isFinite(local.getTime())) throw new HistoricalWorkoutValidationError('invalid_time');
  return local;
}

export function createHistoricalWorkoutSession(draft: HistoricalWorkoutDraft, recordedAt = new Date()): WorkoutSession {
  if (!isValidWorkoutDateKey(draft.performedDate) || !isStrictlyPastDateKey(draft.performedDate, recordedAt)) {
    throw new HistoricalWorkoutValidationError('not_historical_date');
  }
  const started = createLocalInstant(draft.performedDate, draft.performedTime);
  if (started.getTime() > recordedAt.getTime()) throw new HistoricalWorkoutValidationError('future_date');
  const durationText = draft.durationMinutes?.trim();
  const duration = durationText ? Number(durationText) : undefined;
  if (!isValidHistoricalDuration(durationText)) {
    throw new HistoricalWorkoutValidationError('invalid_duration');
  }

  const sets = Object.fromEntries(draft.exercises.flatMap(({ exercise, sets: exerciseSets, machineProfile }) => {
    const isPlateMachine = isPlateLoadedMachine(resolveExerciseLoadingProfile(exercise).profile);
    const normalized = exerciseSets.map((set, index) => {
      const rawWeight = set.weight.trim();
      const rawReps = set.reps.trim();
      if (rawWeight === '' || rawReps === '') throw new HistoricalWorkoutValidationError('invalid_set');
      const displayWeight = Number(rawWeight);
      const reps = Number(rawReps);
      const rir = set.rir.trim() === '' ? undefined : Number(set.rir);
      if (!Number.isFinite(displayWeight) || displayWeight < 0 || !Number.isFinite(reps) || !Number.isInteger(reps) || reps <= 0 || (rir !== undefined && !isValidRirValue(rir))) {
        throw new HistoricalWorkoutValidationError('invalid_set');
      }
      const weightKg = parseDisplayWeight(displayWeight, draft.units || 'metric');
      if (machineProfile?.baseResistanceKg !== undefined && weightKg < machineProfile.baseResistanceKg) {
        throw new HistoricalWorkoutValidationError('machine_base');
      }
      return {
        setIndex: index + 1,
        weightKg,
        reps,
        ...(rir === undefined ? {} : { rir }),
        completed: true,
        setType: set.setType,
        isWarmup: set.setType === 'warmup',
        ...(machineProfile ? {
          machineProfileId: machineProfile.id,
          machineProfileLabel: machineProfile.label,
          machineBaseResistanceKg: machineProfile.baseResistanceKg,
          machineBaseResistanceStatus: machineProfile.baseResistanceStatus,
          machineBaseSourceLabel: machineProfile.sourceLabel,
          machineBaseSourceUrl: machineProfile.sourceUrl,
          machineManufacturer: machineProfile.manufacturer,
          machineModel: machineProfile.model
        } : isPlateMachine ? {
          machineBaseResistanceStatus: 'unknown' as const
        } : {})
      };
    });
    return normalized.length ? [[exercise.id, normalized] as const] : [];
  }));
  if (Object.values(sets).flat().length === 0) throw new HistoricalWorkoutValidationError('invalid_set');

  const recordedMs = recordedAt.getTime();
  if (!Number.isFinite(recordedMs) || started.getTime() > recordedMs) throw new HistoricalWorkoutValidationError('invalid_recorded_at');
  const id = globalThis.crypto?.randomUUID?.() || `historical-${recordedMs}-${Math.random().toString(36).slice(2)}`;
  return normalizeWorkoutSession({
    id,
    userId: draft.userId,
    ...(draft.routineId ? { routineId: draft.routineId } : {}),
    ...(draft.routineName?.trim() ? { routineName: draft.routineName.trim().slice(0, 255) } : {}),
    startedAt: started.toISOString(),
    performedDate: draft.performedDate,
    recordedAt: recordedAt.toISOString(),
    entrySource: 'historical_manual',
    ...(duration ? { endedAt: new Date(started.getTime() + duration * 60_000).toISOString() } : {}),
    sets
  });
}

export interface HistoricalActiveWorkoutDraft {
  userId: string;
  routineId?: string;
  performedDate: string;
  performedTime: string;
  durationMinutes?: string;
  routineName?: string;
  exerciseSessions: ActiveExerciseSession[];
}

export function createHistoricalWorkoutSessionFromActive(
  draft: HistoricalActiveWorkoutDraft,
  recordedAt = new Date()
): WorkoutSession {
  if (!isValidWorkoutDateKey(draft.performedDate) || !isStrictlyPastDateKey(draft.performedDate, recordedAt)) {
    throw new HistoricalWorkoutValidationError('not_historical_date');
  }
  const started = createLocalInstant(draft.performedDate, draft.performedTime);
  if (started.getTime() > recordedAt.getTime()) throw new HistoricalWorkoutValidationError('future_date');
  const durationText = draft.durationMinutes?.trim();
  const duration = durationText ? Number(durationText) : undefined;
  if (!isValidHistoricalDuration(durationText)) {
    throw new HistoricalWorkoutValidationError('invalid_duration');
  }

  const sets: Record<string, LoggedSet[]> = {};
  for (const session of draft.exerciseSessions) {
    if (session.skipped) continue;
    const isPlateMachine = isPlateLoadedMachine(session.exercise.loading ?? DEFAULT_EXERCISE_LOADING_PROFILE);
    const completedSets = session.sets
      .filter((set) => set.completed && isValidWorkoutSet(set))
      .map((set, index) => {
        const effectiveBaseKg = set.machineBaseResistanceKg ?? (isPlateMachine ? session.machineBaseResistanceKg : undefined);
        if (effectiveBaseKg !== undefined && set.weightKg < effectiveBaseKg) {
          throw new HistoricalWorkoutValidationError('machine_base');
        }
        return normalizeLoggedSet({
          ...set,
          setIndex: index + 1,
          completed: true
        });
      });
    if (completedSets.length > 0) {
      sets[session.exercise.id] = completedSets;
    }
  }

  if (Object.values(sets).flat().length === 0) {
    throw new HistoricalWorkoutValidationError('invalid_set');
  }

  const recordedMs = recordedAt.getTime();
  if (!Number.isFinite(recordedMs) || started.getTime() > recordedMs) {
    throw new HistoricalWorkoutValidationError('invalid_recorded_at');
  }

  const id = globalThis.crypto?.randomUUID?.() || `historical-${recordedMs}-${Math.random().toString(36).slice(2)}`;
  return normalizeWorkoutSession({
    id,
    userId: draft.userId,
    ...(draft.routineId ? { routineId: draft.routineId } : {}),
    ...(draft.routineName?.trim() ? { routineName: draft.routineName.trim().slice(0, 255) } : {}),
    startedAt: started.toISOString(),
    performedDate: draft.performedDate,
    recordedAt: recordedAt.toISOString(),
    entrySource: 'historical_manual',
    ...(duration ? { endedAt: new Date(started.getTime() + duration * 60_000).toISOString() } : {}),
    sets
  });
}
