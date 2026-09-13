import type { LoggedSet, WorkoutSession, WorkoutSetType } from './types.js';

export const WORKOUT_SET_TYPES = ['working', 'warmup', 'drop', 'backoff'] as const;

export interface LegacyWorkoutSetClassification {
  setType?: unknown;
  isWarmup?: unknown;
}

export type LegacyLoggedSet = Omit<LoggedSet, 'setType' | 'isWarmup'> & {
  setType?: unknown;
  isWarmup?: unknown;
};

export type LegacyWorkoutSession = Omit<WorkoutSession, 'sets'> & {
  sets: Record<string, LegacyLoggedSet[]>;
};

export function isWorkoutSetType(value: unknown): value is WorkoutSetType {
  return typeof value === 'string' && (WORKOUT_SET_TYPES as readonly string[]).includes(value);
}

export function normalizeWorkoutSetType(set: LegacyWorkoutSetClassification): WorkoutSetType {
  if (isWorkoutSetType(set.setType)) return set.setType;
  return set.isWarmup === true ? 'warmup' : 'working';
}

export function normalizeLoggedSet<T extends LegacyWorkoutSetClassification>(
  set: T
): T & { setType: WorkoutSetType; isWarmup: boolean } {
  const setType = normalizeWorkoutSetType(set);
  return { ...set, setType, isWarmup: setType === 'warmup' };
}

export function normalizeWorkoutSession(session: LegacyWorkoutSession): WorkoutSession {
  return {
    ...session,
    sets: Object.fromEntries(
      Object.entries(session.sets || {}).map(([exerciseId, sets]) => [
        exerciseId,
        Array.isArray(sets) ? sets.map((set) => normalizeLoggedSet(set)) : []
      ])
    )
  };
}

export function isWarmupSet(set: LegacyWorkoutSetClassification): boolean {
  return normalizeWorkoutSetType(set) === 'warmup';
}

export function isEffectiveSet(set: LegacyWorkoutSetClassification): boolean {
  return normalizeWorkoutSetType(set) !== 'warmup';
}

export function shouldCountForVolume(
  set: LegacyWorkoutSetClassification & { completed?: boolean }
): boolean {
  return set.completed === true && isEffectiveSet(set);
}

export function shouldCountForPersonalRecord(
  set: LegacyWorkoutSetClassification & { completed?: boolean; weightKg?: number; reps?: number }
): boolean {
  return shouldCountForVolume(set)
    && Number.isFinite(set.weightKg)
    && Number(set.weightKg) > 0
    && Number.isFinite(set.reps)
    && Number(set.reps) > 0;
}
