import { Exercise, MuscleGroup, WorkoutSession } from '@light-weight/domain';

export interface ExerciseUsage {
  sessions: number;
  lastUsedAt: number;
}

export const COMMON_EXERCISES_BY_MUSCLE: Partial<Record<MuscleGroup, string[]>> = {
  chest: ['ex-0025', 'ex-0047', 'ex-0289', 'ex-0662'],
  back: ['ex-0027', 'ex-0861', 'ex-0652', 'ex-2330'],
  shoulders: ['ex-0091', 'ex-0334', 'ex-0426'],
  quadriceps: ['ex-0585', 'ex-1460', 'ex-0032'],
  hamstrings: ['ex-0085', 'ex-1459', 'ex-0044'],
  glutes: ['ex-1409', 'ex-3561', 'ex-3236'],
  biceps: ['ex-0031', 'ex-0070', 'ex-1648'],
  triceps: ['ex-0241', 'ex-0060', 'ex-0814', 'ex-0194'],
  core: ['ex-0472', 'ex-0687', 'ex-0464'],
  calves: ['ex-1385', 'ex-1376', 'ex-1377'],
  forearms: ['ex-1411', 'ex-1412', 'ex-0082']
};

export function deriveExerciseUsage(history: WorkoutSession[]): Record<string, ExerciseUsage> {
  const usage: Record<string, ExerciseUsage> = {};
  for (const session of history) {
    const timestamp = new Date(session.startedAt).getTime();
    for (const [exerciseId, sets] of Object.entries(session.sets)) {
      if (!sets.some((set) => set.completed && !set.isWarmup)) continue;
      const current = usage[exerciseId] || { sessions: 0, lastUsedAt: 0 };
      usage[exerciseId] = {
        sessions: current.sessions + 1,
        lastUsedAt: Math.max(current.lastUsedAt, Number.isFinite(timestamp) ? timestamp : 0)
      };
    }
  }
  return usage;
}

export function rankExerciseDiscovery(
  exercises: Exercise[],
  usage: Record<string, ExerciseUsage>,
  muscle: MuscleGroup | 'all'
): { featured: Exercise[]; remaining: Exercise[]; featuredKind: 'recent' | 'frequent' | 'recommended' | null } {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const used = exercises
    .filter((exercise) => usage[exercise.id])
    .sort((a, b) => {
      const aUsage = usage[a.id];
      const bUsage = usage[b.id];
      return muscle === 'all'
        ? bUsage.lastUsedAt - aUsage.lastUsedAt || bUsage.sessions - aUsage.sessions
        : bUsage.sessions - aUsage.sessions || bUsage.lastUsedAt - aUsage.lastUsedAt;
    });

  const featured = used.slice(0, muscle === 'all' ? 8 : 6);
  let featuredKind: 'recent' | 'frequent' | 'recommended' | null = featured.length
    ? (muscle === 'all' ? 'recent' : 'frequent')
    : null;

  if (muscle !== 'all' && featured.length < 8) {
    for (const id of COMMON_EXERCISES_BY_MUSCLE[muscle] || []) {
      const exercise = byId.get(id);
      if (exercise && !featured.some((item) => item.id === id)) featured.push(exercise);
      if (featured.length >= 8) break;
    }
    if (!used.length && featured.length) featuredKind = 'recommended';
  }

  const featuredIds = new Set(featured.map((exercise) => exercise.id));
  return { featured, remaining: exercises.filter((exercise) => !featuredIds.has(exercise.id)), featuredKind };
}
