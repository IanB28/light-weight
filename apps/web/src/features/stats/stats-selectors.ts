import {
  calculateMuscleFatigue,
  calculateSessionTotalVolume,
  calculateSetOneRm,
  calculateWeeklyStreak,
  evaluateRelativeStrength,
  getExerciseProgressSeries,
  getNeglectedMuscles,
  isSetEligibleForPersonalRecord,
  resolveBodyweightKgAtDate,
  shouldCountForVolume,
  type BodyweightEntry,
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

export function selectMuscleAnalytics(
  history: WorkoutSession[],
  exercisesById: Record<string, Exercise>,
  windowDays: number,
  bodyweightKg: number | null,
  gender?: Gender,
  bodyweightEntries?: BodyweightEntry[]
): {
  muscleAnalysis: ReturnType<typeof getNeglectedMuscles>;
  fatigueMap: ReturnType<typeof calculateMuscleFatigue>;
  fullMuscleAnalytics: Record<MuscleGroup, StatsMuscleAnalytics>;
} {
  const muscleAnalysis = getNeglectedMuscles(history, exercisesById, windowDays, { bodyweightKg, bodyweightEntries });
  const fatigueMap = calculateMuscleFatigue(history, exercisesById);
  const workedMap = new Map(muscleAnalysis.worked.map((worked) => [worked.muscle, worked]));
  const strengthMap = new Map<MuscleGroup, { top1Rm: number; exName: string }>();

  history.forEach((session) => {
    const sessionBw = bodyweightEntries
      ? resolveBodyweightKgAtDate(bodyweightEntries, session.startedAt)
      : bodyweightKg;

    Object.entries(session.sets).forEach(([exerciseId, sets]) => {
      const exercise = exercisesById[exerciseId];
      if (!exercise) return;
      sets.filter(shouldCountForVolume).forEach((set) => {
        const candidate = calculateSetOneRm(set, {
          exercise,
          bodyweightKg: sessionBw,
          formula: 'average'
        }) ?? 0;
        const current = strengthMap.get(exercise.primaryMuscle) || { top1Rm: 0, exName: '' };
        if (candidate > current.top1Rm) {
          strengthMap.set(exercise.primaryMuscle, { top1Rm: candidate, exName: exercise.name });
        }
      });
    });
  });

  const fullMuscleAnalytics = {} as Record<MuscleGroup, StatsMuscleAnalytics>;
  ALL_MUSCLE_GROUPS.forEach((muscle) => {
    const worked = workedMap.get(muscle);
    const strength = strengthMap.get(muscle) || { top1Rm: 0, exName: '' };
    const fatigue = fatigueMap[muscle];
    fullMuscleAnalytics[muscle] = {
      muscle,
      nameEs: SPANISH_MUSCLE_NAMES[muscle] || muscle,
      sets: worked?.sets || 0,
      volumeKg: worked?.volumeKg || 0,
      fatigueScore: fatigue.fatigueScore,
      recoveryStatus: fatigue.status,
      recoveryPct: fatigue.recoveryPct,
      lastTrainedHoursAgo: fatigue.hoursSinceLastTrained,
      recentHardSetsCount: fatigue.recentHardSetsCount,
      topEst1RmKg: strength.top1Rm,
      topExerciseName: strength.exName,
      strengthEvaluation: gender && bodyweightKg && strength.top1Rm > 0
        ? evaluateRelativeStrength(muscle, strength.top1Rm, bodyweightKg, gender)
        : undefined
    };
  });
  return { muscleAnalysis, fatigueMap, fullMuscleAnalytics };
}

export function selectProgressSummary(
  history: WorkoutSession[],
  exercisesById: Record<string, Exercise>,
  bodyweightEntries?: BodyweightEntry[],
  nowMs = Date.now()
) {
  const cutoff = nowMs - 30 * 24 * 60 * 60 * 1000;
  const recentSessions = history.filter((session) => Date.parse(session.startedAt) >= cutoff);
  let bestEstimatedOneRm = 0;
  let bestExerciseName = '';

  recentSessions.forEach((session) => {
    const sessionBw = bodyweightEntries
      ? resolveBodyweightKgAtDate(bodyweightEntries, session.startedAt)
      : null;

    Object.entries(session.sets).forEach(([exerciseId, sets]) => {
      const exercise = exercisesById[exerciseId];
      sets.filter((s) => isSetEligibleForPersonalRecord({ set: s, exercise, bodyweightKg: sessionBw })).forEach((set) => {
        const candidate = calculateSetOneRm(set, {
          exercise,
          bodyweightKg: sessionBw,
          formula: 'average'
        }) ?? 0;
        if (candidate > bestEstimatedOneRm) {
          bestEstimatedOneRm = candidate;
          bestExerciseName = exercise?.name || 'Ejercicio del historial';
        }
      });
    });
  });

  const volumeKg = recentSessions.reduce((total, session) => {
    const sessionBw = bodyweightEntries
      ? resolveBodyweightKgAtDate(bodyweightEntries, session.startedAt)
      : null;
    return total + calculateSessionTotalVolume(session, { exercisesById, bodyweightKg: sessionBw });
  }, 0);

  return {
    sessions: recentSessions.length,
    volumeKg,
    bestEstimatedOneRm,
    bestExerciseName,
    weeklyStreak: calculateWeeklyStreak(history)
  };
}

export function selectLastTopSet(
  history: WorkoutSession[],
  exerciseId: string,
  options?: {
    exercise?: Exercise;
    bodyweightEntries?: BodyweightEntry[];
    bodyweightKg?: number | null;
  }
) {
  for (const session of [...history].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))) {
    const sessionBw = options?.bodyweightEntries
      ? resolveBodyweightKgAtDate(options.bodyweightEntries, session.startedAt)
      : options?.bodyweightKg ?? null;
    const effectiveSets = (session.sets[exerciseId] || []).filter((s) =>
      isSetEligibleForPersonalRecord({ set: s, exercise: options?.exercise, bodyweightKg: sessionBw })
    );
    if (effectiveSets.length) {
      const top = effectiveSets.reduce((best, set) => {
        const best1Rm = calculateSetOneRm(best, { exercise: options?.exercise, bodyweightKg: sessionBw, formula: 'average' }) ?? 0;
        const set1Rm = calculateSetOneRm(set, { exercise: options?.exercise, bodyweightKg: sessionBw, formula: 'average' }) ?? 0;
        return set1Rm > best1Rm ? set : best;
      });
      const estimatedOneRm = calculateSetOneRm(top, { exercise: options?.exercise, bodyweightKg: sessionBw, formula: 'average' }) ?? 0;
      return { weightKg: top.weightKg, reps: top.reps, estimatedOneRm };
    }
  }
  return null;
}

export function selectStatsSnapshot(
  history: WorkoutSession[],
  exercises: Exercise[],
  windowDays: number,
  bodyweightKg: number | null,
  gender?: Gender,
  bodyweightEntries?: BodyweightEntry[]
) {
  const exercisesById = buildExercisesById(exercises);
  const totalVolumeTonnage = history.reduce((total, session) => {
    const sessionBw = bodyweightEntries
      ? resolveBodyweightKgAtDate(bodyweightEntries, session.startedAt)
      : bodyweightKg;
    return total + calculateSessionTotalVolume(session, { exercisesById, bodyweightKg: sessionBw });
  }, 0);

  return {
    exercisesById,
    exercisesWithHistory: selectExercisesWithHistory(history, exercisesById),
    muscle: selectMuscleAnalytics(history, exercisesById, windowDays, bodyweightKg, gender, bodyweightEntries),
    progressSummary: selectProgressSummary(history, exercisesById, bodyweightEntries),
    totalVolumeTonnage
  };
}

export { getExerciseProgressSeries };
