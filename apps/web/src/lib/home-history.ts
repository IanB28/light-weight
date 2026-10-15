import { resolveWorkoutDateKey, type WorkoutSession } from '@light-weight/domain';

/** Group by the workout's recorded local day, not the viewer's UTC day. */
export function groupWorkoutSessionsByDate(history: WorkoutSession[]): Record<string, WorkoutSession[]> {
  const grouped: Record<string, WorkoutSession[]> = {};
  for (const session of history) {
    (grouped[resolveWorkoutDateKey(session)] ||= []).push(session);
  }
  for (const sessions of Object.values(grouped)) {
    sessions.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  }
  return grouped;
}

export function recentWorkoutSessions(history: WorkoutSession[], limit = 10): WorkoutSession[] {
  return [...history]
    .sort((a, b) => resolveWorkoutDateKey(b).localeCompare(resolveWorkoutDateKey(a)) || Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, limit);
}
