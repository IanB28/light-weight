import { normalizeLoggedSet } from './setSemantics.js';
import type { LoggedSet, WorkoutSession } from './types.js';

/** The latest physical occurrence of an exercise, independent of routine identity. */
export interface ExercisePerformanceHead {
  exerciseId: string;
  sessionId: string;
  startedAt: string;
  performedDate?: string;
  recordedAt?: string;
  sets: LoggedSet[];
}

export function getSessionChronologicalTimestamp(session: Pick<WorkoutSession, 'startedAt' | 'performedDate'>): number {
  const startedAt = Date.parse(session.startedAt);
  if (Number.isFinite(startedAt)) return startedAt;
  if (session.performedDate) {
    const performedAt = Date.parse(`${session.performedDate}T12:00:00Z`);
    if (Number.isFinite(performedAt)) return performedAt;
  }
  return 0;
}

export function isQualifyingPerformedSet(set: LoggedSet | null | undefined): set is LoggedSet {
  return Boolean(set && set.completed === true && Number.isFinite(set.weightKg) && set.weightKg >= 0
    && Number.isFinite(set.reps) && set.reps > 0);
}

export function qualifyingPerformanceSets(sets: readonly LoggedSet[]): LoggedSet[] {
  return sets.map((set, index) => ({ set, index }))
    .filter(({ set }) => isQualifyingPerformedSet(set))
    .sort((a, b) => a.set.setIndex - b.set.setIndex || a.index - b.index)
    .map(({ set }) => normalizeLoggedSet(set));
}

/** Positive result means left is chronologically newer. Ties are deterministic. */
export function compareExercisePerformanceHeads(left: ExercisePerformanceHead, right: ExercisePerformanceHead): number {
  const time = getSessionChronologicalTimestamp(left) - getSessionChronologicalTimestamp(right);
  if (time) return time;
  const recorded = (Date.parse(left.recordedAt ?? '') || 0) - (Date.parse(right.recordedAt ?? '') || 0);
  if (recorded) return recorded;
  return left.sessionId.localeCompare(right.sessionId);
}

export function resolveExercisePreviousPerformance(options: {
  exerciseId: string;
  history: readonly WorkoutSession[];
  remoteHead?: ExercisePerformanceHead | null;
  beforeTimestamp?: number;
}): ExercisePerformanceHead | null {
  const { exerciseId, history, remoteHead, beforeTimestamp } = options;
  if (!exerciseId) return null;
  let latest: ExercisePerformanceHead | null = null;
  const consider = (head: ExercisePerformanceHead) => {
    const timestamp = getSessionChronologicalTimestamp(head);
    if (!timestamp || (beforeTimestamp !== undefined && timestamp >= beforeTimestamp)) return;
    if (!latest || compareExercisePerformanceHeads(head, latest) > 0) latest = head;
  };
  for (const session of history) {
    const sourceSets = session?.sets?.[exerciseId];
    if (!Array.isArray(sourceSets)) continue;
    const sets = qualifyingPerformanceSets(sourceSets);
    if (sets.length) consider({ exerciseId, sessionId: session.id, startedAt: session.startedAt,
      performedDate: session.performedDate, recordedAt: session.recordedAt, sets });
  }
  if (remoteHead?.exerciseId === exerciseId && Array.isArray(remoteHead.sets)) {
    const sets = qualifyingPerformanceSets(remoteHead.sets);
    if (sets.length) consider({ ...remoteHead, sets });
  }
  return latest;
}
