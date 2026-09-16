import type { Exercise, ExerciseLoadMode, LoggedSet, WorkoutSession, WorkoutSetType } from './types.js';
import { resolveExerciseLoadingProfile } from './exerciseLoading.js';

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

export interface EffectiveLoadOptions {
  exercise: Pick<Exercise, 'id' | 'category' | 'name' | 'instructions' | 'loading'>;
  setWeightKg: number;
  bodyweightKg?: number | null;
  loadModeOverride?: ExerciseLoadMode;
}

/**
 * Calculates the mechanical effective load (in kg) moved during a set.
 *
 * Distinguishes conceptually:
 * - bodyweightKg: User's bodyweight at session date (never invented silently if missing).
 * - externalLoadKg (setWeightKg): Stored magnitude logged by user (+added load or assistance).
 * - effectiveLoadKg: Net mechanical load computed here.
 */
export function calculateEffectiveLoadKg({
  exercise,
  setWeightKg,
  bodyweightKg,
  loadModeOverride
}: EffectiveLoadOptions): number {
  const profile = exercise.loading ?? resolveExerciseLoadingProfile(exercise).profile;
  const mode = loadModeOverride ?? profile.loadMode;
  const rawWeight = Number.isFinite(setWeightKg) ? setWeightKg : 0;
  const factor = profile.bodyweightFactor;

  if (factor === 1) {
    const validBw = (typeof bodyweightKg === 'number' && Number.isFinite(bodyweightKg) && bodyweightKg > 0)
      ? bodyweightKg
      : null;

    if (mode === 'assisted') {
      const assistanceKg = Math.max(0, Math.abs(rawWeight));
      if (validBw !== null) {
        return Math.max(0, validBw - assistanceKg);
      }
      // Rule E: Assistance without known bodyweight must NEVER be treated as positive load
      return 0;
    }

    // Default for bodyweightFactor === 1 is added_weight:
    const externalLoadKg = Math.max(0, rawWeight);
    if (validBw !== null) {
      return validBw + externalLoadKg;
    }
    return externalLoadKg;
  }

  // Rule G: Bodyweight without explicit bodyweightFactor (pushups, crunches, etc.):
  // Do NOT assume BW=70, do NOT convert automatically to 70 kg.
  return Math.max(0, rawWeight);
}

export interface SetEligibilityContext {
  set: LoggedSet;
  exercise?: Pick<Exercise, 'id' | 'category' | 'name' | 'instructions' | 'loading'> | null;
  bodyweightKg?: number | null;
}

/**
 * Context-aware check for Personal Record eligibility.
 *
 * Preserves legacy shouldCountForPersonalRecord for callers without exercise context.
 */
export function isSetEligibleForPersonalRecord({
  set,
  exercise,
  bodyweightKg
}: SetEligibilityContext): boolean {
  if (!shouldCountForVolume(set)) return false;
  if (!Number.isFinite(set.reps) || set.reps <= 0) return false;

  if (!exercise) {
    return shouldCountForPersonalRecord(set);
  }

  const profile = exercise.loading ?? resolveExerciseLoadingProfile(exercise).profile;
  const isFullBodyweight = profile.bodyweightFactor === 1;
  const effectiveLoad = calculateEffectiveLoadKg({
    exercise,
    setWeightKg: set.weightKg,
    bodyweightKg
  });

  if (isFullBodyweight) {
    return effectiveLoad > 0;
  }

  return Number.isFinite(set.weightKg) && Number(set.weightKg) > 0 && effectiveLoad > 0;
}
