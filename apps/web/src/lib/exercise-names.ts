import type { Exercise, WorkoutSession } from '@light-weight/domain';

export const LEGACY_EXERCISE_ALIASES: Readonly<Record<string, string>> = {
  'ex-bench': 'Bench Press',
  'ex-lat-pulldown': 'Lat Pulldown',
  'ex-ohp': 'Overhead Press',
  'ex-bicep-curl': 'Biceps Curl',
  'ex-tricep-pushdown': 'Triceps Pushdown',
  'ex-squat': 'Back Squat',
  'ex-rdl': 'Romanian Deadlift',
  'ex-leg-raise': 'Leg Raise',
  'ex-incline-db': 'Incline Dumbbell Press'
};

type LegacySession = WorkoutSession & {
  exerciseNames?: Record<string, string>;
  exercises?: Array<{ id?: string; exerciseId?: string; name?: string }>;
};

function nameFromHistory(exerciseId: string, history: WorkoutSession[]): string | undefined {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const session = history[index] as LegacySession;
    const mappedName = session.exerciseNames?.[exerciseId]?.trim();
    if (mappedName) return mappedName;
    const exercise = session.exercises?.find((item) => (item.id ?? item.exerciseId) === exerciseId);
    if (exercise?.name?.trim()) return exercise.name.trim();
  }
  return undefined;
}

export function resolveExerciseName(
  exerciseId: string,
  exercises: Exercise[],
  history: WorkoutSession[],
  fallback = 'Exercise unavailable'
): string {
  return exercises.find((exercise) => exercise.id === exerciseId)?.name?.trim()
    || LEGACY_EXERCISE_ALIASES[exerciseId]
    || nameFromHistory(exerciseId, history)
    || fallback;
}
