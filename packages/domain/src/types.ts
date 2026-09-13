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
}

export type WorkoutSetType = 'working' | 'warmup' | 'drop' | 'backoff';

export interface LoggedSet {
  setIndex: number;
  weightKg: number;
  reps: number;
  rpe?: number;
  rir?: number;
  completed: boolean;
  isWarmup: boolean;
  setType?: WorkoutSetType;
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
