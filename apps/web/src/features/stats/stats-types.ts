import type { MuscleGroup, StrengthEvaluation, OverallStrengthEvaluation } from '@light-weight/domain';

export interface MuscleStrengthAnalytics {
  muscle: MuscleGroup;
  topEst1RmKg: number;
  topExerciseId?: string;
  topExerciseName?: string;
  performedAt?: string;
  strengthEvaluation?: StrengthEvaluation;
}

/** Pure analytics data contract; presentation adapters may consume it on web or native. */
export interface StatsMuscleAnalytics {
  muscle: MuscleGroup;
  nameEs: string;
  sets: number;
  volumeKg: number;
  fatigueScore: number;
  recoveryStatus: 'fatigued' | 'recovering' | 'ready';
  recoveryPct: number;
  lastTrainedHoursAgo: number | null;
  recentHardSetsCount: number;
  topEst1RmKg: number;
  topExerciseId?: string;
  topExerciseName?: string;
  performedAt?: string;
  strengthEvaluation?: StrengthEvaluation;
}

export interface StrengthSnapshot {
  muscles: Record<MuscleGroup, StatsMuscleAnalytics>;
  overall: OverallStrengthEvaluation | null;
}

export const SPANISH_MUSCLE_NAMES: Record<MuscleGroup, string> = {
  chest: 'Pecho',
  back: 'Espalda',
  shoulders: 'Hombros',
  biceps: 'Bíceps',
  triceps: 'Tríceps',
  forearms: 'Antebrazos',
  quadriceps: 'Cuádriceps',
  hamstrings: 'Isquiotibiales',
  glutes: 'Glúteos',
  calves: 'Gemelos',
  core: 'Abdomen / Core'
};
