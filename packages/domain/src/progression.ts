import type { LoggedSet } from './types.js';

/**
 * Calculates the total training volume (reps * weight) for a set of completed sets.
 */
export function calculateVolume(sets: LoggedSet[]): number {
  return sets
    .filter((s) => s.completed && !s.isWarmup)
    .reduce((total, s) => total + s.weightKg * s.reps, 0);
}

/**
 * Checks if an exercise has met the target threshold for double progression
 * (e.g. all sets hit top of rep range).
 */
export function checkProgressionTarget(
  sets: LoggedSet[],
  targetSets: number,
  targetReps: number
): boolean {
  const workingSets = sets.filter((s) => s.completed && !s.isWarmup);
  if (workingSets.length < targetSets) return false;
  return workingSets.slice(0, targetSets).every((s) => s.reps >= targetReps);
}
