import {
  calculateMuscleFatigue,
  calculateOverallStrength,
  calculateSessionTotalVolume,
  calculateSetOneRm,
  calculateWeeklyStreak,
  evaluateRelativeStrength,
  getExerciseProgressSeries,
  getNeglectedMuscles,
  isSetEligibleForPersonalRecord,
  resolveBodyweightKgAtDate,
  REP_CAP,
  type BodyweightEntry,
  type Exercise,
  type Gender,
  type MuscleGroup,
  type StrengthEvaluation,
  type WorkoutSession
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
}

interface BestMuscleStrengthRecord {
  top1Rm: number;
  exerciseId: string;
  exerciseName: string;
  performedAt: string;
  evaluation: StrengthEvaluation;
}

/**
 * Pure selector that processes entire training history to derive the best valid
 * strength observation per MuscleGroup and the Overall Strength evaluation.
 *
 * Selection Invariants:
 * - Only sets eligible for Personal Record (isSetEligibleForPersonalRecord).
 * - Only sets within REP_CAP (1 to 12 reps, >12 rejected).
 * - Historical bodyweight is resolved via resolveBodyweightKgAtDate with fallback to current bodyweight.
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
  const { bodyweightKg, gender, bodyweightEntries } = options;
  const bestByMuscle = new Map<MuscleGroup, BestMuscleStrengthRecord>();

  if (gender === 'male' || gender === 'female') {
    for (const session of history) {
      const sessionDate = session.startedAt;
      const sessionBw = bodyweightEntries && bodyweightEntries.length > 0
        ? (resolveBodyweightKgAtDate(bodyweightEntries, sessionDate) ?? bodyweightKg)
        : bodyweightKg;

      if (!sessionBw || sessionBw <= 0) {
        continue;
      }

      for (const [exerciseId, sets] of Object.entries(session.sets || {})) {
        const exercise = exercisesById[exerciseId];
        if (!exercise) continue;

        const targetMuscle = exercise.primaryMuscle;
        if (!targetMuscle) continue;

        for (const set of sets) {
          if (!isSetEligibleForPersonalRecord({ set, exercise, bodyweightKg: sessionBw })) {
            continue;
          }

          if (!Number.isFinite(set.reps) || set.reps < 1 || set.reps > REP_CAP) {
            continue;
          }

          const set1Rm = calculateSetOneRm(set, {
            exercise,
            bodyweightKg: sessionBw,
            formula: 'average'
          });

          if (!set1Rm || set1Rm <= 0) continue;

          const evaluation = evaluateRelativeStrength(targetMuscle, set1Rm, sessionBw, gender);
          if (!evaluation) continue;

          const currentBest = bestByMuscle.get(targetMuscle);
          if (!currentBest) {
            bestByMuscle.set(targetMuscle, {
              top1Rm: set1Rm,
              exerciseId: exercise.id,
              exerciseName: exercise.name,
              performedAt: sessionDate,
              evaluation
            });
          } else {
            const isHigherScore = evaluation.strengthScore > currentBest.evaluation.strengthScore;
            const isSameScore = evaluation.strengthScore === currentBest.evaluation.strengthScore;
            const isHigher1Rm = evaluation.oneRmKg > currentBest.top1Rm;
            const isSame1Rm = evaluation.oneRmKg === currentBest.top1Rm;
            const isNewerDate = Date.parse(sessionDate) > Date.parse(currentBest.performedAt);

            const isWinner =
              isHigherScore ||
              (isSameScore && isHigher1Rm) ||
              (isSameScore && isSame1Rm && isNewerDate);

            if (isWinner) {
              bestByMuscle.set(targetMuscle, {
                top1Rm: set1Rm,
                exerciseId: exercise.id,
                exerciseName: exercise.name,
                performedAt: sessionDate,
                evaluation
              });
            }
          }
        }
      }
    }
  }

  const muscles = {} as Record<MuscleGroup, StatsMuscleAnalytics>;
  const evaluationsMap: Partial<Record<MuscleGroup, StrengthEvaluation>> = {};

  for (const muscle of ALL_MUSCLE_GROUPS) {
    const best = bestByMuscle.get(muscle);
    if (best) {
      evaluationsMap[muscle] = best.evaluation;
    }
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
      topEst1RmKg: best ? best.top1Rm : 0,
      topExerciseId: best?.exerciseId,
      topExerciseName: best?.exerciseName,
      performedAt: best?.performedAt,
      strengthEvaluation: best?.evaluation
    };
  }

  const overall = calculateOverallStrength(evaluationsMap);

  return { muscles, overall };
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
    bodyweightEntries
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
      ? resolveBodyweightKgAtDate(bodyweightEntries, session.startedAt)
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
  for (const session of [...history].sort(
    (a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)
  )) {
    const sessionBw = options?.bodyweightEntries
      ? resolveBodyweightKgAtDate(options.bodyweightEntries, session.startedAt)
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
  bodyweightEntries?: BodyweightEntry[]
) {
  const exercisesById = buildExercisesById(exercises);
  const totalVolumeTonnage = history.reduce((total, session) => {
    const sessionBw = bodyweightEntries
      ? resolveBodyweightKgAtDate(bodyweightEntries, session.startedAt)
      : bodyweightKg;
    return total + calculateSessionTotalVolume(session, { exercisesById, bodyweightKg: sessionBw });
  }, 0);

  const strength = selectStrengthSnapshot(history, exercisesById, {
    bodyweightKg,
    gender,
    bodyweightEntries
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
      bodyweightEntries
    ),
    progressSummary: selectProgressSummary(history, exercisesById, bodyweightEntries),
    totalVolumeTonnage,
    strength
  };
}

export { getExerciseProgressSeries };
