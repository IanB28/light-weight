import {
  calculateMuscleFatigue,
  calculateSetOneRm,
  calculateWeeklyStreak,
  getExerciseProgressSeries,
  getNeglectedMuscles,
  isSetEligibleForPersonalRecord,
  resolveCanonicalStrengthProjection,
  resolveBodyweightKgAtDate,
  resolveWorkoutDateKey,
  type BodyweightEntry,
  type Exercise,
  type Gender,
  type MuscleGroup,
  type WorkoutSession,
  type HistoricalPersonalRecord
} from '@light-weight/domain';
import {
  SPANISH_MUSCLE_NAMES,
  type StatsMuscleAnalytics,
  type StrengthSnapshot
} from './stats-types.js';
import {
  computeSemanticBalanceForHistory,
  type SemanticBalanceResult
} from '../../lib/balance-anatomy.js';
import {
  computeSemanticFatigueForHistory,
  type SemanticFatigueResult
} from '../../lib/fatigue-anatomy.js';
import { calculateHistoricalSessionVolume } from '../../lib/historical-volume.js';

const ALL_MUSCLE_GROUPS: MuscleGroup[] = [
  'chest',
  'back',
  'shoulders',
  'biceps',
  'triceps',
  'forearms',
  'quadriceps',
  'hamstrings',
  'glutes',
  'calves',
  'core'
];

export const buildExercisesById = (exercises: Exercise[]): Record<string, Exercise> =>
  Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise]));

export function selectExercisesWithHistory(
  history: WorkoutSession[],
  exercisesById: Record<string, Exercise>
): Exercise[] {
  const ids = new Set(history.flatMap((session) => Object.keys(session.sets)));
  return [...ids]
    .map(
      (id) =>
        exercisesById[id] || {
          id,
          name: 'Ejercicio no disponible',
          category: 'other',
          primaryMuscle: 'chest' as MuscleGroup
        }
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export interface SelectStrengthSnapshotOptions {
  bodyweightKg: number | null;
  gender?: Gender;
  bodyweightEntries?: BodyweightEntry[];
  historicalPersonalRecords?: HistoricalPersonalRecord[];
}

/**
 * Pure selector that processes entire training history to derive the best valid
 * strength observation per MuscleGroup and the Overall Strength evaluation.
 *
 * Selection Invariants:
 * - Only sets eligible for Personal Record (isSetEligibleForPersonalRecord).
 * - Only sets within REP_CAP (1 to 12 reps, >12 rejected).
 * - Historical sessions use only bodyweight known at their physical timestamp.
 * - Missing bodyweight or gender results in no StrengthEvaluation (undefined, never Novato).
 * - Multiple sets are NEVER averaged.
 * - Winner per MuscleGroup is selected by:
 *   1. highest strengthScore
 *   2. tie-breaker: higher oneRmKg
 *   3. tie-breaker: newer performedAt
 * - Overall Strength averages normalized muscle strengthScore values (unrated muscles ignored).
 */
export function selectStrengthSnapshot(
  history: WorkoutSession[],
  exercisesById: Record<string, Exercise>,
  options: SelectStrengthSnapshotOptions
): StrengthSnapshot {
  const projection = resolveCanonicalStrengthProjection(history, exercisesById, {
    gender: options.gender,
    bodyweightEntries: options.bodyweightEntries,
    historicalPersonalRecords: options.historicalPersonalRecords
  });

  const muscles = {} as Record<MuscleGroup, StatsMuscleAnalytics>;

  for (const muscle of ALL_MUSCLE_GROUPS) {
    const best = projection.byMuscle[muscle];
    muscles[muscle] = {
      muscle,
      nameEs: SPANISH_MUSCLE_NAMES[muscle] || muscle,
      sets: 0,
      volumeKg: 0,
      fatigueScore: 0,
      recoveryStatus: 'ready',
      recoveryPct: 100,
      lastTrainedHoursAgo: null,
      recentHardSetsCount: 0,
      topEst1RmKg: best?.oneRmKg ?? 0,
      topExerciseId: best?.exerciseId,
      topExerciseName: best?.exerciseName,
      performedAt: best?.performedAt,
      strengthEvaluation: best?.evaluation
    };
  }
  return { muscles, overall: projection.overall };
}

export function selectMuscleAnalytics(
  history: WorkoutSession[],
  exercisesById: Record<string, Exercise>,
  windowDays: number,
  bodyweightKg: number | null,
  gender?: Gender,
  bodyweightEntries?: BodyweightEntry[],
  historicalPersonalRecords?: HistoricalPersonalRecord[]
): {
  muscleAnalysis: ReturnType<typeof getNeglectedMuscles>;
  fatigueMap: ReturnType<typeof calculateMuscleFatigue>;
  fullMuscleAnalytics: Record<MuscleGroup, StatsMuscleAnalytics>;
  semanticBalance: SemanticBalanceResult;
  semanticFatigue: SemanticFatigueResult;
} {
  const muscleAnalysis = getNeglectedMuscles(history, exercisesById, windowDays, {
    bodyweightKg,
    bodyweightEntries
  });
  const fatigueMap = calculateMuscleFatigue(history, exercisesById);
  const workedMap = new Map(muscleAnalysis.worked.map((worked) => [worked.muscle, worked]));
  const strengthSnapshot = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg,
    gender,
    bodyweightEntries,
    historicalPersonalRecords
  });

  const cutoffTime = windowDays > 0 ? Date.now() - windowDays * 24 * 60 * 60 * 1000 : 0;
  const windowedHistory = windowDays > 0
    ? history.filter((s) => Date.parse(s.startedAt) >= cutoffTime)
    : history;
  const semanticBalance = computeSemanticBalanceForHistory(windowedHistory, exercisesById);
  const semanticFatigue = computeSemanticFatigueForHistory(history, exercisesById);

  const fullMuscleAnalytics = {} as Record<MuscleGroup, StatsMuscleAnalytics>;
  ALL_MUSCLE_GROUPS.forEach((muscle) => {
    const worked = workedMap.get(muscle);
    const fatigue = fatigueMap[muscle];
    const strength = strengthSnapshot.muscles[muscle];

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
      topEst1RmKg: strength.topEst1RmKg,
      topExerciseId: strength.topExerciseId,
      topExerciseName: strength.topExerciseName,
      performedAt: strength.performedAt,
      strengthEvaluation: strength.strengthEvaluation
    };
  });

  return { muscleAnalysis, fatigueMap, fullMuscleAnalytics, semanticBalance, semanticFatigue };
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
      ? resolveBodyweightKgAtDate(bodyweightEntries, resolveWorkoutDateKey(session))
      : null;

    Object.entries(session.sets).forEach(([exerciseId, sets]) => {
      const exercise = exercisesById[exerciseId];
      sets
        .filter((s) => isSetEligibleForPersonalRecord({ set: s, exercise, bodyweightKg: sessionBw }))
        .forEach((set) => {
          const candidate =
            calculateSetOneRm(set, {
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
    return total + calculateHistoricalSessionVolume(session, exercisesById, bodyweightEntries ?? []);
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
  for (const session of [...history].sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)
  )) {
    const sessionBw = options?.bodyweightEntries
      ? resolveBodyweightKgAtDate(options.bodyweightEntries, resolveWorkoutDateKey(session))
      : options?.bodyweightKg ?? null;
    const effectiveSets = (session.sets[exerciseId] || []).filter((s) =>
      isSetEligibleForPersonalRecord({ set: s, exercise: options?.exercise, bodyweightKg: sessionBw })
    );
    if (effectiveSets.length) {
      const top = effectiveSets.reduce((best, set) => {
        const best1Rm =
          calculateSetOneRm(best, {
            exercise: options?.exercise,
            bodyweightKg: sessionBw,
            formula: 'average'
          }) ?? 0;
        const set1Rm =
          calculateSetOneRm(set, {
            exercise: options?.exercise,
            bodyweightKg: sessionBw,
            formula: 'average'
          }) ?? 0;
        return set1Rm > best1Rm ? set : best;
      });
      const estimatedOneRm =
        calculateSetOneRm(top, {
          exercise: options?.exercise,
          bodyweightKg: sessionBw,
          formula: 'average'
        }) ?? 0;
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
  bodyweightEntries?: BodyweightEntry[],
  historicalPersonalRecords?: HistoricalPersonalRecord[]
) {
  const exercisesById = buildExercisesById(exercises);
  const totalVolumeTonnage = history.reduce((total, session) => {
    return total + calculateHistoricalSessionVolume(session, exercisesById, bodyweightEntries ?? []);
  }, 0);

  const strength = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg,
    gender,
    bodyweightEntries,
    historicalPersonalRecords
  });

  return {
    exercisesById,
    exercisesWithHistory: selectExercisesWithHistory(history, exercisesById),
    muscle: selectMuscleAnalytics(
      history,
      exercisesById,
      windowDays,
      bodyweightKg,
      gender,
      bodyweightEntries,
      historicalPersonalRecords
    ),
    progressSummary: selectProgressSummary(history, exercisesById, bodyweightEntries),
    totalVolumeTonnage,
    strength
  };
}

export { getExerciseProgressSeries };
