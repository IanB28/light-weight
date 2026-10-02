import { calculateCanonicalStrengthOneRm } from './onerm.js';
import { isSetEligibleForPersonalRecord } from './setSemantics.js';
import type { BodyweightEntry, Exercise, HistoricalPersonalRecord, WorkoutSession } from './types.js';
import { resolveBodyweightKgAtDate } from './weight.js';
import { resolveWorkoutDateKey } from './workoutTemporal.js';

export interface CanonicalPersonalRecord {
  exerciseId: string;
  weightKg: number;
  reps: number;
  est1Rm: number;
  date: string;
  bodyweightKg?: number;
  source?: 'workout' | 'historical_manual';
}

export interface CanonicalPersonalRecordOptions {
  exercisesById?: Readonly<Record<string, Exercise>>;
  bodyweightEntries?: readonly BodyweightEntry[];
  historicalPersonalRecords?: readonly HistoricalPersonalRecord[];
}

/** Current product default-PR selection: highest canonical 1RM per exercise. */
export function selectCanonicalPersonalRecordsByExercise(
  history: readonly WorkoutSession[],
  options: CanonicalPersonalRecordOptions = {}
): Record<string, CanonicalPersonalRecord> {
  const records: Record<string, CanonicalPersonalRecord> = {};

  for (const session of history) {
    const bodyweightKg = options.bodyweightEntries
      ? resolveBodyweightKgAtDate(options.bodyweightEntries, resolveWorkoutDateKey(session))
      : null;
    for (const [exerciseId, sets] of Object.entries(session.sets ?? {})) {
      const exercise = options.exercisesById?.[exerciseId];
      for (const set of sets) {
        if (!isSetEligibleForPersonalRecord({ set, exercise, bodyweightKg })) continue;
        const est1Rm = calculateCanonicalStrengthOneRm(set, { exercise, bodyweightKg });
        if (est1Rm === null) continue;
        const current = records[exerciseId];
        if (!current || est1Rm > current.est1Rm) {
          records[exerciseId] = {
            exerciseId,
            weightKg: set.weightKg,
            reps: set.reps,
            est1Rm,
            date: session.startedAt,
            ...(bodyweightKg ? { bodyweightKg } : {}),
            source: 'workout'
          };
        }
      }
    }
  }

  for (const record of options.historicalPersonalRecords ?? []) {
    const exercise = options.exercisesById?.[record.exerciseId];
    if (!isSetEligibleForPersonalRecord({ set: record.set, exercise, bodyweightKg: record.bodyweightKg })) continue;
    const est1Rm = calculateCanonicalStrengthOneRm(record.set, { exercise, bodyweightKg: record.bodyweightKg });
    if (est1Rm === null) continue;
    const current = records[record.exerciseId];
    if (!current || est1Rm > current.est1Rm) {
      records[record.exerciseId] = {
        exerciseId: record.exerciseId,
        weightKg: record.set.weightKg,
        reps: record.set.reps,
        est1Rm,
        date: record.performedDate,
        bodyweightKg: record.bodyweightKg,
        source: 'historical_manual'
      };
    }
  }

  return records;
}
