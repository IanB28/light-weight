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
}

export interface LoggedSet {
  setIndex: number;
  weightKg: number;
  reps: number;
  rpe?: number;
  completed: boolean;
  isWarmup: boolean;
}

export interface WorkoutSession {
  id: string;
  userId: string;
  routineId?: string;
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

export interface OneRmEstimate {
  epley: number;
  brzycki: number;
  average: number;
}
