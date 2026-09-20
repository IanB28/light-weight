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

export type ExerciseLoadMode = 'total' | 'per_side' | 'per_hand' | 'added_weight' | 'assisted';
export type ExercisePlateBaseKind = 'user_bar' | 'fixed' | 'none';

export interface ExercisePlateBase {
  kind: ExercisePlateBaseKind;
  weightKg?: number;
  selectableWeightsKg?: number[];
  label?: 'smith';
}

/**
 * Canonical loading semantics for an exercise.
 *
 * `total` stores the total exercise load. `per_side` stores the load handled by
 * one working side. `per_hand` stores the weight of each dumbbell/hand.
 * `added_weight` stores only external load added to body weight.
 * `assisted` stores machine assistance / counterweight that is subtracted from body weight.
 * Stored values are never implicitly doubled based on unilateral wording.
 */
export interface ExerciseLoadingProfile {
  mechanism: ExerciseLoadMechanism;
  loadMode: ExerciseLoadMode;
  supportsKeyboard: boolean;
  supportsPlates: boolean;
  supportsExternalLoad: boolean;
  includeBarWeight: boolean;
  /** Optional for legacy entries; the resolver supplies a semantic default. */
  plateBase?: ExercisePlateBase;
  /**
   * Explicit bodyweight contribution factor (e.g. 1.0 for pull-ups, chin-ups, dips).
   * Undefined when biomechanical contribution is unknown or not reliably quantified.
   */
  bodyweightFactor?: number;
  /** Whether this exercise movement involves an inherent machine starting resistance / carriage tare. */
  hasMachineBase?: boolean;
  /** Non-authoritative product suggestions for machine base resistance (e.g. 20 lb / 22 lb for Smith). */
  suggestions?: readonly { weightKg: number; label?: string }[];
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
export type WorkoutEntrySource = 'live' | 'historical_manual';

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
  /** Snapshot of selected machine starting/base resistance at set execution time. */
  machineBaseResistanceKg?: number;
  /** Snapshot of machine base resistance status at set execution time. */
  machineBaseResistanceStatus?: import('./machineProfile.js').BaseResistanceStatus;
  /** Snapshot of selected machine profile ID at set execution time. */
  machineProfileId?: string;
  /** Snapshot of selected machine profile label at set execution time. */
  machineProfileLabel?: string;
  /** Snapshot of machine base resistance authoritative source label/document. */
  machineBaseSourceLabel?: string;
  /** Snapshot of machine base resistance authoritative source URL. */
  machineBaseSourceUrl?: string;
  /** Snapshot of machine manufacturer at set execution time. */
  machineManufacturer?: string;
  /** Snapshot of machine model at set execution time. */
  machineModel?: string;
}

export interface MachineSnapshot {
  machineProfileId?: string;
  machineProfileLabel?: string;
  machineBaseResistanceKg?: number;
  machineBaseResistanceStatus?: import('./machineProfile.js').BaseResistanceStatus;
  machineBaseSourceLabel?: string;
  machineBaseSourceUrl?: string;
  machineManufacturer?: string;
  machineModel?: string;
}

export interface MachineBaseSelection {
  profile?: import('./machineProfile.js').MachineProfile;
  status: import('./machineProfile.js').BaseResistanceStatus;
  weightKg: number | null;
}

export interface WorkoutSession {

  id: string;
  userId: string;
  routineId?: string;
  routineName?: string;
  startedAt: string;
  /** Local calendar date on which the physical training occurred. */
  performedDate?: string;
  /** Instant the session was recorded in the application. Never analytics time. */
  recordedAt?: string;
  /** Provenance only; absent on legacy sessions. */
  entrySource?: WorkoutEntrySource;
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
  /**
   * Immutable, privacy-minimal attribution for an independently owned routine
   * imported from a friend. It deliberately contains no email or birth date.
   */
  origin?: {
    type: 'shared';
    sharedBy: import('./identity.js').PublicUserSummary;
    shareId?: string;
  };
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

export type { BodyweightEntry, BodyweightEntryLike } from './weight.js';
