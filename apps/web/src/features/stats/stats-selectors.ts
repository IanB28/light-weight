import {
  calculateMuscleFatigue,
  calculateSessionTotalVolume,
  calculateWeeklyStreak,
  estimateOneRm,
  evaluateRelativeStrength,
  getExerciseProgressSeries,
  getNeglectedMuscles,
  shouldCountForPersonalRecord,
  shouldCountForVolume,
  type Exercise,
  type Gender,
  type MuscleGroup,
  type WorkoutSession
} from '@light-weight/domain';
import { SPANISH_MUSCLE_NAMES, type StatsMuscleAnalytics } from './stats-types.js';

const ALL_MUSCLE_GROUPS: MuscleGroup[] = ['chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'core'];

export const buildExercisesById = (exercises: Exercise[]): Record<string, Exercise> => Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise]));

export function selectExercisesWithHistory(history: WorkoutSession[], exercisesById: Record<string, Exercise>): Exercise[] {
  const ids = new Set(history.flatMap((session) => Object.keys(session.sets)));
  return [...ids].map((id) => exercisesById[id] || { id, name: 'Ejercicio no disponible', category: 'other', primaryMuscle: 'chest' as MuscleGroup }).sort((a, b) => a.name.localeCompare(b.name));
}

export function selectMuscleAnalytics(history: WorkoutSession[], exercisesById: Record<string, Exercise>, windowDays: number, bodyweightKg: number | null, gender?: Gender): { muscleAnalysis: ReturnType<typeof getNeglectedMuscles>; fatigueMap: ReturnType<typeof calculateMuscleFatigue>; fullMuscleAnalytics: Record<MuscleGroup, StatsMuscleAnalytics> } {
  const muscleAnalysis = getNeglectedMuscles(history, exercisesById, windowDays);
  const fatigueMap = calculateMuscleFatigue(history, exercisesById);
  const workedMap = new Map(muscleAnalysis.worked.map((worked) => [worked.muscle, worked]));
  const strengthMap = new Map<MuscleGroup, { top1Rm: number; exName: string }>();
  history.forEach((session) => Object.entries(session.sets).forEach(([exerciseId, sets]) => {
    const exercise = exercisesById[exerciseId];
    if (!exercise) return;
    sets.filter(shouldCountForVolume).forEach((set) => {
      const candidate = estimateOneRm(set.weightKg, set.reps).average;
      const current = strengthMap.get(exercise.primaryMuscle) || { top1Rm: 0, exName: '' };
      if (candidate > current.top1Rm) strengthMap.set(exercise.primaryMuscle, { top1Rm: candidate, exName: exercise.name });
    });
  }));
  const fullMuscleAnalytics = {} as Record<MuscleGroup, StatsMuscleAnalytics>;
  ALL_MUSCLE_GROUPS.forEach((muscle) => {
    const worked = workedMap.get(muscle);
    const strength = strengthMap.get(muscle) || { top1Rm: 0, exName: '' };
    const fatigue = fatigueMap[muscle];
    fullMuscleAnalytics[muscle] = {
      muscle, nameEs: SPANISH_MUSCLE_NAMES[muscle] || muscle, sets: worked?.sets || 0, volumeKg: worked?.volumeKg || 0,
      fatigueScore: fatigue.fatigueScore, recoveryStatus: fatigue.status, recoveryPct: fatigue.recoveryPct,
      lastTrainedHoursAgo: fatigue.hoursSinceLastTrained, recentHardSetsCount: fatigue.recentHardSetsCount,
      topEst1RmKg: strength.top1Rm, topExerciseName: strength.exName,
      strengthEvaluation: gender && bodyweightKg && strength.top1Rm > 0 ? evaluateRelativeStrength(muscle, strength.top1Rm, bodyweightKg, gender) : undefined
    };
  });
  return { muscleAnalysis, fatigueMap, fullMuscleAnalytics };
}

export function selectProgressSummary(history: WorkoutSession[], exercisesById: Record<string, Exercise>, nowMs = Date.now()) {
  const cutoff = nowMs - 30 * 24 * 60 * 60 * 1000;
  const recentSessions = history.filter((session) => Date.parse(session.startedAt) >= cutoff);
  let bestEstimatedOneRm = 0;
  let bestExerciseName = '';
  recentSessions.forEach((session) => Object.entries(session.sets).forEach(([exerciseId, sets]) => sets.filter(shouldCountForPersonalRecord).forEach((set) => {
    const candidate = estimateOneRm(set.weightKg, set.reps).average;
    if (candidate > bestEstimatedOneRm) { bestEstimatedOneRm = candidate; bestExerciseName = exercisesById[exerciseId]?.name || 'Ejercicio del historial'; }
  })));
  return { sessions: recentSessions.length, volumeKg: recentSessions.reduce((total, session) => total + calculateSessionTotalVolume(session), 0), bestEstimatedOneRm, bestExerciseName, weeklyStreak: calculateWeeklyStreak(history) };
}

export function selectLastTopSet(history: WorkoutSession[], exerciseId: string) {
  for (const session of [...history].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))) {
    const effectiveSets = (session.sets[exerciseId] || []).filter(shouldCountForPersonalRecord);
    if (effectiveSets.length) {
      const top = effectiveSets.reduce((best, set) => estimateOneRm(set.weightKg, set.reps).average > estimateOneRm(best.weightKg, best.reps).average ? set : best);
      return { weightKg: top.weightKg, reps: top.reps, estimatedOneRm: estimateOneRm(top.weightKg, top.reps).average };
    }
  }
  return null;
}

export function selectStatsSnapshot(history: WorkoutSession[], exercises: Exercise[], windowDays: number, bodyweightKg: number | null, gender?: Gender) {
  const exercisesById = buildExercisesById(exercises);
  return {
    exercisesById,
    exercisesWithHistory: selectExercisesWithHistory(history, exercisesById),
    muscle: selectMuscleAnalytics(history, exercisesById, windowDays, bodyweightKg, gender),
    progressSummary: selectProgressSummary(history, exercisesById),
    totalVolumeTonnage: history.reduce((total, session) => total + calculateSessionTotalVolume(session), 0)
  };
}

export { getExerciseProgressSeries };
