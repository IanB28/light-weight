import { resolveExerciseStrengthTarget } from './exerciseSemanticsResolver.js';
import { REP_CAP } from './oneRmConstants.js';
import { calculateCanonicalStrengthOneRm } from './onerm.js';
import { isSetEligibleForPersonalRecord } from './setSemantics.js';
import {
  calculateOverallStrength,
  evaluateRelativeStrength,
  type Gender,
  type OverallStrengthEvaluation,
  type StrengthEvaluation
} from './strengthStandards.js';
import type { BodyweightEntry, Exercise, HistoricalPersonalRecord, MuscleGroup, WorkoutSession } from './types.js';
import { resolveBodyweightKgAtDate } from './weight.js';
import { resolveWorkoutDateKey } from './workoutTemporal.js';

export interface CanonicalStrengthObservation {
  exerciseId: string;
  exerciseName: string;
  muscle: MuscleGroup;
  oneRmKg: number;
  performedAt: string;
  evaluation: StrengthEvaluation;
}

export interface CanonicalStrengthProjection {
  byExercise: Record<string, CanonicalStrengthObservation>;
  byMuscle: Partial<Record<MuscleGroup, CanonicalStrengthObservation>>;
  overall: OverallStrengthEvaluation | null;
}

export interface CanonicalStrengthProjectionOptions {
  gender?: Gender;
  bodyweightEntries?: readonly BodyweightEntry[];
  historicalPersonalRecords?: readonly HistoricalPersonalRecord[];
}

function observationWins(
  candidate: CanonicalStrengthObservation,
  current: CanonicalStrengthObservation | undefined
): boolean {
  if (!current) return true;
  if (candidate.evaluation.strengthScore !== current.evaluation.strengthScore) {
    return candidate.evaluation.strengthScore > current.evaluation.strengthScore;
  }
  if (candidate.oneRmKg !== current.oneRmKg) return candidate.oneRmKg > current.oneRmKg;
  return Date.parse(candidate.performedAt) > Date.parse(current.performedAt);
}

/**
 * Canonical full-history strength selection shared by web and server.
 *
 * Each exercise and muscle keeps the observation with the highest normalized
 * strength score, then the highest canonical 1RM, then the newest physical date.
 */
export function resolveCanonicalStrengthProjection(
  history: readonly WorkoutSession[],
  exercisesById: Readonly<Record<string, Exercise>>,
  options: CanonicalStrengthProjectionOptions
): CanonicalStrengthProjection {
  const byExercise: Record<string, CanonicalStrengthObservation> = {};
  const byMuscle: Partial<Record<MuscleGroup, CanonicalStrengthObservation>> = {};
  const gender = options.gender;

  const consider = (
    exercise: Exercise,
    oneRmKg: number,
    bodyweightKg: number,
    performedAt: string
  ) => {
    const muscle = resolveExerciseStrengthTarget(exercise);
    if (!muscle) return;
    const evaluation = evaluateRelativeStrength(muscle, oneRmKg, bodyweightKg, gender);
    if (!evaluation) return;
    const candidate: CanonicalStrengthObservation = {
      exerciseId: exercise.id,
      exerciseName: exercise.name,
      muscle,
      oneRmKg,
      performedAt,
      evaluation
    };
    if (observationWins(candidate, byExercise[exercise.id])) byExercise[exercise.id] = candidate;
    if (observationWins(candidate, byMuscle[muscle])) byMuscle[muscle] = candidate;
  };

  if (gender === 'male' || gender === 'female') {
    for (const session of history) {
      const bodyweightKg = resolveBodyweightKgAtDate(
        options.bodyweightEntries ?? [],
        resolveWorkoutDateKey(session)
      );
      if (!bodyweightKg || bodyweightKg <= 0) continue;

      for (const [exerciseId, sets] of Object.entries(session.sets ?? {})) {
        const exercise = exercisesById[exerciseId];
        if (!exercise || !resolveExerciseStrengthTarget(exercise)) continue;
        for (const set of sets) {
          if (!isSetEligibleForPersonalRecord({ set, exercise, bodyweightKg })) continue;
          if (!Number.isFinite(set.reps) || set.reps < 1 || set.reps > REP_CAP) continue;
          const oneRmKg = calculateCanonicalStrengthOneRm(set, { exercise, bodyweightKg });
          if (!oneRmKg || oneRmKg <= 0) continue;
          consider(exercise, oneRmKg, bodyweightKg, session.startedAt);
        }
      }
    }

    for (const record of options.historicalPersonalRecords ?? []) {
      const bodyweightKg = record.bodyweightKg;
      if (!Number.isFinite(bodyweightKg) || bodyweightKg <= 0) continue;
      const exercise = exercisesById[record.exerciseId];
      if (!exercise || !resolveExerciseStrengthTarget(exercise)) continue;
      if (!isSetEligibleForPersonalRecord({ set: record.set, exercise, bodyweightKg })) continue;
      if (!Number.isFinite(record.set.reps) || record.set.reps < 1 || record.set.reps > REP_CAP) continue;
      const oneRmKg = calculateCanonicalStrengthOneRm(record.set, { exercise, bodyweightKg });
      if (!oneRmKg || oneRmKg <= 0) continue;
      consider(exercise, oneRmKg, bodyweightKg, record.performedDate);
    }
  }

  const evaluations: Partial<Record<MuscleGroup, StrengthEvaluation>> = {};
  for (const [muscle, observation] of Object.entries(byMuscle)) {
    if (observation) evaluations[muscle as MuscleGroup] = observation.evaluation;
  }

  return { byExercise, byMuscle, overall: calculateOverallStrength(evaluations) };
}
