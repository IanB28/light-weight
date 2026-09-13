import {
  estimate1RM,
  shouldCountForPersonalRecord,
  shouldCountForVolume,
  type LoggedSet,
  type WorkoutSession
} from '@light-weight/domain';

export interface PersonalRecordInfo {
  exerciseId: string;
  weightKg: number;
  reps: number;
  est1Rm: number;
  date: string;
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
export function buildWorkoutHistoryIndex(history: WorkoutSession[]): WorkoutHistoryIndex {
  const index = emptyIndex();
  const newestFirst = [...history].sort(
    (left, right) => Date.parse(right.startedAt) - Date.parse(left.startedAt)
  );

  for (const session of newestFirst) {
    const dateKey = session.startedAt.slice(0, 10);
    (index.sessionsByDate[dateKey] ||= []).push(session);

    for (const [exerciseId, sets] of Object.entries(session.sets)) {
      (index.sessionsByExercise[exerciseId] ||= []).push(session);

      if (!index.latestPerformanceByExercise[exerciseId]) {
        const effectiveSets = sets.filter(shouldCountForVolume);
        if (effectiveSets.length > 0) {
          const topSet = effectiveSets.reduce(
            (best, set) => set.weightKg > best.weightKg ? set : best,
            effectiveSets[0]
          );
          index.latestPerformanceByExercise[exerciseId] = {
            lastDate: session.startedAt,
            sets: effectiveSets,
            summary: `${topSet.weightKg} kg × ${topSet.reps}`
          };
        }
      }

      for (const set of sets) {
        if (!shouldCountForPersonalRecord(set)) continue;
        const est1Rm = estimate1RM(set.weightKg, set.reps, 'epley');
        if (est1Rm === null) continue;
        const existing = index.personalRecordsByExercise[exerciseId];
        if (!existing || est1Rm > existing.est1Rm) {
          index.personalRecordsByExercise[exerciseId] = {
            exerciseId,
            weightKg: set.weightKg,
            reps: set.reps,
            est1Rm,
            date: session.startedAt
          };
        }
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
export function calculateAllPersonalRecords(history: WorkoutSession[]): Record<string, PersonalRecordInfo> {
  return buildWorkoutHistoryIndex(history).personalRecordsByExercise;
}
