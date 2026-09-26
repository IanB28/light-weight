import {
  calculateSetOneRm,
  isSetEligibleForPersonalRecord,
  resolveBodyweightKgAtDate,
  resolveWorkoutDateKey,
  resolveExerciseLoadingProfile,
  shouldCountForVolume,
  type BodyweightEntry,
  type Exercise,
  type HistoricalPersonalRecord,
  type LoggedSet,
  type WorkoutSession
} from '@light-weight/domain';

export interface PersonalRecordInfo {
  exerciseId: string;
  weightKg: number;
  reps: number;
  est1Rm: number;
  date: string;
  bodyweightKg?: number;
  source?: 'workout' | 'historical_manual';
}

export interface PreviousExercisePerformance {
  lastDate?: string;
  sets: LoggedSet[];
  summary: string;
}

export interface WorkoutHistoryIndex {
  sessionsByExercise: Record<string, WorkoutSession[]>;
  sessionsByDate: Record<string, WorkoutSession[]>;
  latestPerformanceByExercise: Record<string, PreviousExercisePerformance>;
  personalRecordsByExercise: Record<string, PersonalRecordInfo>;
}

export interface BuildWorkoutHistoryIndexOptions {
  exercisesById?: Record<string, Exercise>;
  bodyweightEntries?: BodyweightEntry[];
  historicalPersonalRecords?: HistoricalPersonalRecord[];
}

const emptyIndex = (): WorkoutHistoryIndex => ({
  sessionsByExercise: {},
  sessionsByDate: {},
  latestPerformanceByExercise: {},
  personalRecordsByExercise: {}
});

/**
 * Builds reusable history selectors once per history change. All returned data
 * uses canonical set semantics, keeping UI callers free of legacy warm-up checks.
 */
export function buildWorkoutHistoryIndex(
  history: WorkoutSession[],
  options?: BuildWorkoutHistoryIndexOptions
): WorkoutHistoryIndex {
  const index = emptyIndex();
  const newestFirst = [...history].sort(
    (left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt)
  );

  for (const session of newestFirst) {
    const dateKey = resolveWorkoutDateKey(session);
    (index.sessionsByDate[dateKey] ||= []).push(session);

    const sessionBw = options?.bodyweightEntries
      ? resolveBodyweightKgAtDate(options.bodyweightEntries, dateKey)
      : null;

    for (const [exerciseId, sets] of Object.entries(session.sets)) {
      (index.sessionsByExercise[exerciseId] ||= []).push(session);
      const exercise = options?.exercisesById?.[exerciseId];

      if (!index.latestPerformanceByExercise[exerciseId]) {
        const effectiveSets = sets.filter(shouldCountForVolume);
        if (effectiveSets.length > 0) {
          const topSet = effectiveSets.reduce(
            (best, set) => set.weightKg > best.weightKg ? set : best,
            effectiveSets[0]
          );
          const loading = exercise ? resolveExerciseLoadingProfile(exercise).profile : undefined;
          let summary = `${topSet.weightKg} kg × ${topSet.reps}`;
          if (loading?.loadMode === 'assisted') {
            summary = `-${topSet.weightKg} kg × ${topSet.reps}`;
          } else if (loading?.loadMode === 'added_weight') {
            summary = topSet.weightKg === 0 ? `BW × ${topSet.reps}` : `+${topSet.weightKg} kg × ${topSet.reps}`;
          }
          index.latestPerformanceByExercise[exerciseId] = {
            lastDate: session.startedAt,
            sets: effectiveSets,
            summary
          };
        }
      }

      for (const set of sets) {
        if (!isSetEligibleForPersonalRecord({ set, exercise, bodyweightKg: sessionBw })) continue;
        const est1Rm = calculateSetOneRm(set, { exercise, bodyweightKg: sessionBw, formula: 'epley' });
        if (est1Rm === null) continue;
        const existing = index.personalRecordsByExercise[exerciseId];
        if (!existing || est1Rm > existing.est1Rm) {
          index.personalRecordsByExercise[exerciseId] = {
            exerciseId,
            weightKg: set.weightKg,
            reps: set.reps,
            est1Rm,
            date: session.startedAt,
            bodyweightKg: sessionBw ?? undefined,
            source: 'workout'
          };
        }
      }
    }
  }

  if (Array.isArray(options?.historicalPersonalRecords)) {
    for (const record of options.historicalPersonalRecords) {
      const exercise = options?.exercisesById?.[record.exerciseId];
      if (!isSetEligibleForPersonalRecord({ set: record.set, exercise, bodyweightKg: record.bodyweightKg })) continue;
      const est1Rm = calculateSetOneRm(record.set, { exercise, bodyweightKg: record.bodyweightKg, formula: 'epley' });
      if (est1Rm === null) continue;
      const existing = index.personalRecordsByExercise[record.exerciseId];
      if (!existing || est1Rm > existing.est1Rm) {
        index.personalRecordsByExercise[record.exerciseId] = {
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
  }

  return index;
}

export function getLatestPerformance(
  index: WorkoutHistoryIndex,
  exerciseId: string
): PreviousExercisePerformance | null {
  return index.latestPerformanceByExercise[exerciseId] || null;
}

/** Compatibility selector for existing consumers during the storage split. */
export function calculateAllPersonalRecords(
  history: WorkoutSession[],
  options?: BuildWorkoutHistoryIndexOptions
): Record<string, PersonalRecordInfo> {
  return buildWorkoutHistoryIndex(history, options).personalRecordsByExercise;
}
