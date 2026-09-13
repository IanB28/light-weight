import type { MuscleGroup, StrengthEvaluation } from '@light-weight/domain';

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
  topExerciseName?: string;
  strengthEvaluation?: StrengthEvaluation;
}

export const SPANISH_MUSCLE_NAMES: Record<MuscleGroup, string> = {
  chest: 'Pecho', back: 'Espalda', shoulders: 'Hombros', biceps: 'Bíceps', triceps: 'Tríceps',
  forearms: 'Antebrazos', quadriceps: 'Cuádriceps', hamstrings: 'Isquiotibiales', glutes: 'Glúteos',
  calves: 'Gemelos', core: 'Abdomen / Core'
};
