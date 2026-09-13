export type MuscleGroup =
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'quadriceps'
  | 'hamstrings'
  | 'glutes'
  | 'calves'
  | 'core';

export type ExerciseCategory =
  | 'barbell'
  | 'dumbbell'
  | 'machine'
  | 'cable'
  | 'bodyweight'
  | 'other';

export type ExerciseLoadMechanism =
  | 'barbell'
  | 'dumbbell'
  | 'plate_loaded'
  | 'selectorized'
  | 'cable'
  | 'bodyweight'
  | 'other';

export type ExerciseLoadMode = 'total' | 'per_side' | 'per_hand' | 'added_weight';

/**
 * Canonical loading semantics for an exercise.
 *
 * `total` stores the total exercise load. `per_side` stores the load handled by
 * one working side. `per_hand` stores the weight of each dumbbell/hand.
 * `added_weight` stores only external load added to body weight. Stored values
 * are never implicitly doubled based on unilateral wording.
 */
export interface ExerciseLoadingProfile {
  mechanism: ExerciseLoadMechanism;
  loadMode: ExerciseLoadMode;
  supportsKeyboard: boolean;
  supportsPlates: boolean;
  supportsExternalLoad: boolean;
  includeBarWeight: boolean;
}

export interface Exercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  primaryMuscle: MuscleGroup;
  secondaryMuscles?: MuscleGroup[];
  isCustom?: boolean;
  img?: string;
  gif?: string;
  instructions?: string[];
  targetMuscle?: string;
  loading?: ExerciseLoadingProfile;
}

export type WorkoutSetType = 'working' | 'warmup' | 'drop' | 'backoff';

export interface LoggedSet {
  setIndex: number;
  weightKg: number;
  reps: number;
  rpe?: number;
  rir?: number;
  completed: boolean;
  setType: WorkoutSetType;
  /** @deprecated Compatibility mirror. Use setType through domain helpers. */
  isWarmup?: boolean;
}

export interface WorkoutSession {
  id: string;
  userId: string;
  routineId?: string;
  routineName?: string;
  startedAt: string;
  endedAt?: string;
  notes?: string;
  sets: Record<string, LoggedSet[]>; // Keyed by exerciseId
}

export interface Routine {
  id: string;
  userId: string;
  name: string;
  description?: string;
  exerciseIds: string[];
}

export type OneRmFormula = 'epley' | 'brzycki' | 'lombardi';

export interface OneRmEstimate {
  epley: number;
  brzycki: number;
  lombardi: number;
  average: number;
}

export interface BestSetRecord {
  est: number;
  w: number;
  r: number;
  date?: string;
}

export type ProgressionPolicy = 'off' | 'linear' | 'greyskull' | 'double' | 'time';
