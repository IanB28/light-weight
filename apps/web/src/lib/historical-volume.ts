import {
  calculateSessionTotalVolume,
  type BodyweightEntry,
  type Exercise,
  type WorkoutSession
} from '@light-weight/domain';

/** UI boundary for historical tonnage: the Domain resolves bodyweight at the physical workout date. */
export function calculateHistoricalSessionVolume(
  session: WorkoutSession,
  exercisesById: Record<string, Exercise>,
  bodyweightEntries: BodyweightEntry[]
): number {
  return calculateSessionTotalVolume(session, { exercisesById, bodyweightEntries });
}
