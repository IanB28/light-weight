import type { Exercise, ExerciseLoadMode, LoggedSet, WorkoutSession, WorkoutSetType } from './types.js';
import { resolveExerciseLoadingProfile } from './exerciseLoading.js';
import { normalizeRirValue, normalizeRpeValue } from './effort.js';
import { isValidBaseResistanceStatus, isAuthoritativeProvenance } from './machineProfile.js';

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
  const raw = set as Record<string, unknown>;
  const result: any = { ...set, setType, isWarmup: setType === 'warmup' };
  if ('rir' in raw) {
    result.rir = normalizeRirValue(raw.rir);
  }
  if ('rpe' in raw) {
    result.rpe = normalizeRpeValue(raw.rpe);
  }
  if ('machineBaseResistanceStatus' in raw) {
    result.machineBaseResistanceStatus = isValidBaseResistanceStatus(raw.machineBaseResistanceStatus)
      ? raw.machineBaseResistanceStatus
      : undefined;
  }
  if ('machineBaseResistanceKg' in raw) {
    const val = raw.machineBaseResistanceKg;
    result.machineBaseResistanceKg = typeof val === 'number' && Number.isFinite(val) && val >= 0
      ? val
      : undefined;
    if (!result.machineBaseResistanceStatus || result.machineBaseResistanceStatus === 'unknown') {
      result.machineBaseResistanceKg = undefined;
    } else if (result.machineBaseResistanceStatus === 'none') {
      result.machineBaseResistanceKg = 0;
    }
  } else if (result.machineBaseResistanceStatus === 'none') {
    result.machineBaseResistanceKg = 0;
  }
  if (
    result.machineBaseResistanceStatus === 'suggested' ||
    result.machineBaseResistanceStatus === 'verified' ||
    result.machineBaseResistanceStatus === 'user_defined'
  ) {
    if (result.machineBaseResistanceKg === undefined || result.machineBaseResistanceKg <= 0) {
      result.machineBaseResistanceStatus = undefined;
      result.machineBaseResistanceKg = undefined;
    }
  }
  if ('machineProfileId' in raw) {
    result.machineProfileId = typeof raw.machineProfileId === 'string' && raw.machineProfileId.trim().length > 0
      ? raw.machineProfileId.trim()
      : undefined;
  }
  if ('machineProfileLabel' in raw) {
    result.machineProfileLabel = typeof raw.machineProfileLabel === 'string' && raw.machineProfileLabel.trim().length > 0
      ? raw.machineProfileLabel.trim()
      : undefined;
  }
  if ('machineBaseSourceLabel' in raw) {
    result.machineBaseSourceLabel = typeof raw.machineBaseSourceLabel === 'string' && raw.machineBaseSourceLabel.trim().length > 0
      ? raw.machineBaseSourceLabel.trim()
      : undefined;
  }
  if ('machineBaseSourceUrl' in raw) {
    result.machineBaseSourceUrl = typeof raw.machineBaseSourceUrl === 'string' && raw.machineBaseSourceUrl.trim().length > 0
      ? raw.machineBaseSourceUrl.trim()
      : undefined;
  }
  if ('machineManufacturer' in raw) {
    result.machineManufacturer = typeof raw.machineManufacturer === 'string' && raw.machineManufacturer.trim().length > 0
      ? raw.machineManufacturer.trim()
      : undefined;
  }
  if ('machineModel' in raw) {
    result.machineModel = typeof raw.machineModel === 'string' && raw.machineModel.trim().length > 0
      ? raw.machineModel.trim()
      : undefined;
  }
  if (result.machineBaseResistanceStatus === 'verified') {
    const isAuthoritative = isAuthoritativeProvenance({
      sourceUrl: result.machineBaseSourceUrl,
      manufacturer: result.machineManufacturer,
      model: result.machineModel,
      sourceLabel: result.machineBaseSourceLabel
    });
    if (!isAuthoritative) {
      result.machineBaseResistanceStatus = 'user_defined';
    }
  }
  return result;
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
  const profile = resolveExerciseLoadingProfile(exercise).profile;
  const mode = loadModeOverride ?? profile.loadMode;
  const rawWeight = Number.isFinite(setWeightKg) ? setWeightKg : 0;
  const factor = profile.bodyweightFactor;

  if (typeof factor === 'number' && Number.isFinite(factor) && factor > 0 && factor <= 1) {
    const validBw = (typeof bodyweightKg === 'number' && Number.isFinite(bodyweightKg) && bodyweightKg > 0)
      ? bodyweightKg
      : null;

    if (mode === 'assisted') {
      const assistanceKg = Math.max(0, Math.abs(rawWeight));
      if (validBw !== null) {
        return Math.max(0, (validBw * factor) - assistanceKg);
      }
      // Rule E: Assistance without known bodyweight must NEVER be treated as positive load
      return 0;
    }

    // Default for bodyweightFactor is added_weight:
    const externalLoadKg = Math.max(0, rawWeight);
    if (validBw !== null) {
      return (validBw * factor) + externalLoadKg;
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

  const profile = resolveExerciseLoadingProfile(exercise).profile;
  const isBodyweight = typeof profile.bodyweightFactor === 'number' && profile.bodyweightFactor > 0 && profile.bodyweightFactor <= 1;
  const effectiveLoad = calculateEffectiveLoadKg({
    exercise,
    setWeightKg: set.weightKg,
    bodyweightKg
  });

  if (isBodyweight) {
    return effectiveLoad > 0;
  }

  return Number.isFinite(set.weightKg) && Number(set.weightKg) > 0 && effectiveLoad > 0;
}
